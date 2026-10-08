// Antom as its own web app. One Worker serves the app at /f/<FAMILY_KEY>/ (the invite link),
// keeps the family's plan in a Durable Object and sends recipe work to Claude with the
// owner's API key. Without the right key there is nothing to see.
import { Buffer } from 'node:buffer';
import Anthropic from '@anthropic-ai/sdk';
import { Family } from './family.js';

export { Family };

const MODEL = 'claude-opus-5-5';
const KEY_RE = /^[A-Za-z0-9_-]{16,128}$/;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_PROMPT = 60000;
const MAX_IMAGE = 3.5 * 1024 * 1024; // Claude takes up to 5 MB per photo once it is base64
const MAX_UPLOAD = 16 * 1024 * 1024;
// the key is part of every URL: never send it to other sites as a referrer
const SECURITY = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'x-frame-options': 'DENY' };

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...SECURITY, ...headers },
});

function sameKey(given, expected) {
  const enc = new TextEncoder();
  const a = enc.encode(given), b = enc.encode(expected);
  return a.byteLength === b.byteLength && crypto.subtle.timingSafeEqual(a, b);
}

async function asset(env, req, path, headers = {}) {
  const res = await env.ASSETS.fetch(new Request(new URL(path, req.url), { method: 'GET' }));
  if (!res.ok) return notFound(env, req);
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries({ ...SECURITY, ...headers })) out.headers.set(k, v);
  return out;
}

async function notFound(env, req) {
  const res = await env.ASSETS.fetch(new Request(new URL('/index.html', req.url), { method: 'GET' }));
  return new Response(res.ok ? res.body : 'Nicht gefunden', { status: 404, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...SECURITY } });
}

function manifest(key) {
  const base = `/f/${key}/`;
  return json({
    name: 'Antom', short_name: 'Antom', description: 'Euer Wochenplan fürs Essen', lang: 'de', dir: 'ltr',
    id: base, start_url: base, scope: base, display: 'standalone', orientation: 'portrait',
    background_color: '#f2f2f7', theme_color: '#1f3fd1',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }, 200, { 'content-type': 'application/manifest+json; charset=utf-8', 'cache-control': 'no-cache' });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/') return asset(env, req, '/index.html', { 'cache-control': 'no-cache', 'content-type': 'text/html; charset=utf-8' });
    // the app symbols are not private: start page, home screen and manifest use them
    if (/^\/icons\/[\w.-]+\.png$/.test(url.pathname)) return asset(env, req, url.pathname, { 'cache-control': 'public, max-age=604800' });
    const m = url.pathname.match(/^\/f\/([^/]+)(\/.*)?$/);
    if (!m || !env.FAMILY_KEY || !KEY_RE.test(m[1]) || !sameKey(m[1], env.FAMILY_KEY)) return notFound(env, req);
    const key = m[1];
    const rest = m[2] || '';
    if (!rest) return Response.redirect(`${url.origin}/f/${key}/`, 301);
    if (rest === '/') return asset(env, req, '/app.html', { 'cache-control': 'no-cache', 'content-type': 'text/html; charset=utf-8' });
    if (rest === '/manifest.webmanifest') return manifest(key);
    if (rest === '/sw.js') return asset(env, req, '/sw.js', { 'cache-control': 'no-cache', 'content-type': 'text/javascript; charset=utf-8' });
    if (/^\/(img|icons)\/[\w.-]+$/.test(rest)) return asset(env, req, rest, { 'cache-control': 'public, max-age=604800' });
    if (rest.startsWith('/api/')) return api(req, env, rest.slice(5), url);
    return notFound(env, req);
  },
};

async function api(req, env, route, url) {
  const family = env.FAMILY.get(env.FAMILY.idFromName('family'));
  if (route === 'claude') return req.method === 'POST' ? claude(req, env, family) : json({ error: 'method' }, 405);
  const res = await family.fetch(new Request(`https://family/${route}${url.search}`, req));
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY)) out.headers.set(k, v);
  return out;
}

// One request from the app (a prompt, at most three photos as files) → one answer as text.
// The model, effort and limits are fixed here, not by the app. The request to Claude is put
// together as text: encoding megabytes of photo data with JSON.stringify would take longer
// than the 10 ms of computing time the free Cloudflare plan allows per request.
async function claude(req, env, family) {
  if (!env.ANTHROPIC_API_KEY) return json({ error: 'not_configured' }, 503);
  if (Number(req.headers.get('content-length')) > MAX_UPLOAD) return json({ error: 'image_rejected' }, 413);
  let form;
  try { form = await req.formData(); } catch (e) { return json({ error: 'invalid_request' }, 400); }
  const prompt = String(form.get('prompt') || '').trim();
  if (!prompt) return json({ error: 'invalid_request' }, 400);
  if (prompt.length > MAX_PROMPT) return json({ error: 'prompt_too_large' }, 413);
  const images = form.getAll('image');
  if (images.length > 3 || images.some((f) => typeof f === 'string' || !IMAGE_TYPES.has(f.type) || !f.size || f.size > MAX_IMAGE)) {
    return json({ error: 'image_rejected' }, 400);
  }
  const quota = await family.fetch(`https://family/quota?limit=${Number(env.CLAUDE_DAILY_LIMIT) || 40}`, { method: 'POST' });
  if (quota.status === 429) return json({ error: 'daily_limit' }, 429);

  // media types come from IMAGE_TYPES and base64 has no character JSON would escape
  const content = [];
  for (const f of images) {
    content.push(`{"type":"image","source":{"type":"base64","media_type":"${f.type}","data":"${Buffer.from(await f.arrayBuffer()).toString('base64')}"}}`);
  }
  content.push(JSON.stringify({ type: 'text', text: prompt }));
  const head = JSON.stringify({ model: MODEL, max_tokens: 16000, fallbacks: 'default', output_config: { effort: 'medium' } });
  const body = `${head.slice(0, -1)},"messages":[{"role":"user","content":[${content.join(',')}]}]}`;

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, baseURL: env.ANTHROPIC_BASE_URL || undefined, maxRetries: 1, timeout: 180 * 1000 });
  try {
    // the SDK sends a finished body as it is, with the key, retries and its error types
    const message = await client.post('/v1/messages?beta=true', {
      body,
      headers: { 'content-type': 'application/json', 'anthropic-beta': 'server-side-fallback-2026-07-01' },
    });
    if (message.stop_reason === 'refusal') return json({ error: 'refused' }, 422);
    const text = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
    if (!text) return json({ error: 'empty_completion' }, 502);
    return json({ text, truncated: message.stop_reason === 'max_tokens' });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'rate_limited' }, 429);
    // prepaid credit used up: the owner has to top it up
    if (e instanceof Anthropic.APIError && (e.status === 402 || (e.status === 400 && /credit balance/i.test(e.message)))) return json({ error: 'no_credit' }, 402);
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return json({ error: 'not_configured' }, 503);
    if (e instanceof Anthropic.BadRequestError) return json({ error: 'invalid_request' }, 400);
    if (e instanceof Anthropic.APIError && e.status === 413) return json({ error: 'prompt_too_large' }, 413);
    return json({ error: 'upstream_error' }, 502);
  }
}
