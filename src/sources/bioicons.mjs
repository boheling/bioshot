// Bioicons: about 2,800 SVG icons for the life sciences, each with a licence and an author.
import fs from 'node:fs';
import path from 'node:path';
import { normaliseLicence } from '../licence.mjs';
import { tokens } from '../util.mjs';

const INDEX = 'https://bioicons.com/icons/icons.json';
const DAY = 24 * 3600 * 1000;

export const name = 'bioicons';
export const about = 'Bioicons (SVG icons: lab equipment, cells, molecules; CC0, CC BY, MIT)';

async function index({ fetchImpl = fetch, userAgent, cacheDir } = {}) {
  const f = cacheDir && path.join(cacheDir, 'bioicons-index.json');
  if (f && fs.existsSync(f) && Date.now() - fs.statSync(f).mtimeMs < DAY) return JSON.parse(fs.readFileSync(f, 'utf8'));
  const r = await fetchImpl(INDEX, { headers: { 'user-agent': userAgent } });
  if (!r.ok) throw new Error(`bioicons.com answered ${r.status}`);
  const list = await r.json();
  if (f) { fs.mkdirSync(cacheDir, { recursive: true }); fs.writeFileSync(f, JSON.stringify(list)); }
  return list;
}

export async function search(query, opts = {}) {
  const q = [...new Set(tokens(query))];
  const out = [];
  for (const i of await index(opts)) {
    const words = new Set([...tokens(String(i.name).replace(/_/g, ' ')), ...tokens(String(i.category).replace(/_/g, ' '))]);
    const hit = q.filter((t) => words.has(t) || [...words].some((w) => w.startsWith(t))).length;
    if (hit) out.push({ i, hit });
  }
  out.sort((a, b) => b.hit - a.hit);
  const seg = encodeURIComponent;
  return out.slice(0, opts.limit ?? 6).map(({ i }) => ({
    source: name, ref: `${i.category}/${i.author}/${i.name}`, title: String(i.name).replace(/_/g, ' '),
    url: `https://bioicons.com/icons/${seg(i.license)}/${seg(i.category)}/${seg(i.author)}/${seg(i.name)}.svg`,
    page: 'https://bioicons.com/', mime: 'image/svg+xml',
    licence: { id: normaliseLicence(i.license), author: i.author },
  }));
}
