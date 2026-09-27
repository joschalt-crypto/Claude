// Builds out/<Name>-CV.html and out/<Name>-CV.pdf from cv.yaml.
//
//   npm run build                  # uses cv.yaml
//   npm run build -- other.yaml    # uses another content file
//
// Set CHROMIUM_PATH to print with an existing Chrome/Chromium instead of the
// browser installed by `npx playwright install chromium`.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { parse } from 'yaml';

const root = dirname(fileURLToPath(import.meta.url));
const outDir = join(root, 'out');
const dataPath = resolve(process.argv[2] ?? join(root, 'cv.yaml'));

// The weights style.css uses.
const FONTS = [
  '@fontsource/source-sans-3/400.css',
  '@fontsource/source-sans-3/400-italic.css',
  '@fontsource/source-sans-3/600.css',
  '@fontsource/source-serif-4/600.css',
];

const HEADER_KEYS = new Set(['name', 'headline', 'contact']);

// Keeps separators glued to the item before them, so a wrapped line never
// starts with "·".
const SEP = '&nbsp;<span class="sep">·</span> ';

// The failsafe schema keeps every value a string, so phone numbers keep a
// leading "+" or "0"; Maps keep headings and labels in the order written.
const cv = parse(await readFile(dataPath, 'utf8'), { schema: 'failsafe', mapAsMap: true });

const esc = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

// **bold** and [label](url) are the only formatting supported inside text.
const inline = (text) =>
  esc(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');

const list = (value) => (value ? [].concat(value) : []);
const isEmpty = (value) => !(value?.length ?? value?.size);
const link = (href, label) => `<a href="${esc(href)}">${esc(label)}</a>`;

// Links email addresses, phone numbers and web addresses; other text is
// returned as is.
function autoLink(text) {
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return link(`mailto:${text}`, text);
  if (/^\+?[\d\s()./-]+$/.test(text) && text.replace(/\D/g, '').length >= 9) {
    return link(`tel:${text.replace(/[^\d+]/g, '')}`, text);
  }
  if (/^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(text)) {
    return link(/^https?:\/\//.test(text) ? text : `https://${text}`, text.replace(/^https?:\/\//, ''));
  }
  return inline(text);
}

const paragraphs = (text) =>
  text
    .trim()
    .split(/\n+/)
    .map((p) => `<p>${inline(p)}</p>`)
    .join('');

const bullets = (items) => (items.length ? `<ul>${items.map((item) => `<li>${inline(item)}</li>`).join('')}</ul>` : '');

// Label/value rows, e.g. skills by area or languages with a level.
function labelled(map) {
  const rows = [...map].map(
    ([label, value]) => `<dt>${inline(label)}</dt><dd>${list(value).map(inline).join(', ')}</dd>`,
  );
  return `<dl class="labelled">${rows.join('')}</dl>`;
}

// A job, degree, project or anything else with a title.
function entry(item) {
  const fields = typeof item === 'string' ? { title: item } : Object.fromEntries(item);
  const { title = '', org, location, dates, link: url, summary, bullets: points } = fields;
  const sub = [org && inline(org), location && inline(location), url && autoLink(url)].filter(Boolean);
  return `
    <article class="entry">
      <div class="entry-head">
        <h3>${inline(title)}</h3>
        ${dates ? `<span class="dates">${esc(dates)}</span>` : ''}
      </div>
      ${sub.length ? `<p class="entry-sub">${sub.join(SEP)}</p>` : ''}
      ${summary ? `<p class="entry-summary">${inline(summary)}</p>` : ''}
      ${bullets(list(points))}
    </article>`;
}

// A section's layout follows the shape of its content (see cv.yaml).
function sectionBody(value) {
  if (typeof value === 'string') return paragraphs(value);
  if (value instanceof Map) return labelled(value);
  if (value.every((item) => typeof item === 'string')) return bullets(value);
  return value.map(entry).join('');
}

const name = cv.get('name') || 'Your Name';
const headline = cv.get('headline');
const contact = list(cv.get('contact')).map(autoLink);
const sections = [...cv]
  .filter(([key, value]) => !HEADER_KEYS.has(key) && !isEmpty(value))
  .map(([heading, value]) => `<section><h2>${esc(heading)}</h2>${sectionBody(value)}</section>`);

const cssString = (text) => `"${String(text).replace(/["\\]/g, '\\$&').replace(/</g, '\\3c ')}"`;

const outBase = `${name.trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '-')}-CV`;
const htmlPath = join(outDir, `${outBase}.html`);
const pdfPath = join(outDir, `${outBase}.pdf`);

// The footer rule comes before style.css, whose `@page :first` rule removes it
// from page one.
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(name)} – CV</title>
${FONTS.map((font) => `<link rel="stylesheet" href="${import.meta.resolve(font)}">`).join('\n')}
<style>@page { @bottom-left { content: ${cssString(name)}; } }</style>
<link rel="stylesheet" href="${pathToFileURL(join(root, 'style.css')).href}">
</head>
<body>
<header class="masthead">
  <h1>${esc(name)}</h1>
  ${headline ? `<p class="headline">${inline(headline)}</p>` : ''}
  ${contact.length ? `<p class="contact">${contact.join(SEP)}</p>` : ''}
</header>
${sections.join('\n')}
</body>
</html>
`;

await mkdir(outDir, { recursive: true });
await writeFile(htmlPath, html);

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
let pdf;
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(htmlPath).href);
  // Load every font subset up front: text in the page footer does not trigger
  // loading one, so e.g. the "Ł" of a name would fall back to a system font.
  await page.evaluate(() => Promise.all([...document.fonts].map((font) => font.load())));
  pdf = await page.pdf({ path: pdfPath, preferCSSPageSize: true, printBackground: true, tagged: true });
} finally {
  await browser.close();
}

// Chromium writes each page as a plain `/Type /Page` object.
const pages = pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)?.length;
console.log(`Wrote ${relative(process.cwd(), htmlPath)}`);
console.log(`Wrote ${relative(process.cwd(), pdfPath)}${pages ? ` (${pages} page${pages > 1 ? 's' : ''})` : ''}`);
