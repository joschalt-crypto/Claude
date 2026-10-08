// Stand-in for api.anthropic.com/v1/messages: records each request, answers with a recipe as JSON text
import http from 'node:http';
import fs from 'node:fs';
const port = Number(process.argv[2] || 8799);
const log = process.argv[3] || '/tmp/mock-anthropic.jsonl';
const RECIPE = {
  t: 'Gulaschsuppe', name: 'Gulaschsuppe aus dem Thermomix', cat: 'haupt', time: 60, veg: false,
  ingredients: [{ q: 400, u: 'g', n: 'Rindergulasch', s: 'fleisch', p: false, x: '' }, { q: 2, u: '', n: 'Zwiebel', s: 'obst', p: false, x: '' }],
  steps: [
    { t: 'Zwiebeln in den Mixtopf geben und zerkleinern.', af: null, tm: { label: 'Zwiebeln zerkleinern', sec: 5, temp: null, speed: 5, rev: false } },
    { t: 'Fleisch zugeben und garen.', af: null, tm: { label: 'Gulasch garen', sec: 3600, temp: 100, speed: 'sanft', rev: true } },
  ],
  tip: 'Mit Brot servieren.',
};
http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    let parsed = null;
    try { parsed = JSON.parse(body); } catch (e) { parsed = null; }
    fs.appendFileSync(log, JSON.stringify({ path: req.url, headers: req.headers, body: parsed }) + '\n');
    if (body.includes('MOCK:NO_CREDIT')) {
      res.writeHead(400, { 'content-type': 'application/json', 'request-id': 'req_mock' });
      res.end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.' } }));
      return;
    }
    const text = process.env.MOCK_REFUSE ? '' : 'Hier ist das Rezept:\n```json\n' + JSON.stringify(RECIPE) + '\n```';
    res.writeHead(200, { 'content-type': 'application/json', 'request-id': 'req_mock' });
    res.end(JSON.stringify({
      id: 'msg_mock', type: 'message', role: 'assistant', model: parsed && parsed.model,
      content: process.env.MOCK_REFUSE ? [] : [{ type: 'thinking', thinking: '', signature: 'x' }, { type: 'text', text }],
      stop_reason: process.env.MOCK_REFUSE ? 'refusal' : 'end_turn', stop_sequence: null,
      usage: { input_tokens: 1200, output_tokens: 800 },
    }));
  });
}).listen(port, '127.0.0.1', () => console.log('mock anthropic on', port));
