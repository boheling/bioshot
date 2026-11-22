// The review page: every asset with where it came from and what it claims, for a person to look at.
// It is a plain local file; approving is a command, so that it is a deliberate act with a name on it.
import fs from 'node:fs';
import path from 'node:path';
import { isImage } from './util.mjs';
import { licenceTerms } from './licence.mjs';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function card(lib, asset, outDir, used, previews) {
  const status = lib.status(asset), view = lib.viewOf(asset);
  const rel = view ? path.relative(outDir, view).split(path.sep).join('/') : '';
  const t = licenceTerms(asset.licence.id), o = asset.origin ?? {};
  const where = asset.source === 'generated'
    ? `Generated with ${esc(o.model ?? o.provider ?? 'a model')}${o.generated ? `, ${esc(o.generated)}` : ''}`
    : asset.source === 'open' ? `Found at ${o.page || o.url ? `<a href="${esc(o.page ?? o.url)}">${esc(new URL(o.page ?? o.url).hostname)}</a>` : 'an open source'}${asset.licence.author ? `, by ${esc(asset.licence.author)}` : ''}`
    : asset.source === 'structure' ? `Rendered from ${esc(o.entry ?? 'a structure database entry')}` : `Supplied by the owner${o.file ? ` (${esc(o.file)})` : ''}`;
  const shot = previews[asset.id] && path.relative(outDir, previews[asset.id]).split(path.sep).join('/');
  const preview = !view ? '<p class="quiet">The file was not kept.</p>'
    : isImage(asset.file) ? `<img src="${esc(rel)}" alt="${esc(asset.title)}" loading="lazy">`
    : shot ? `<img src="${esc(shot)}" alt="Four views of ${esc(asset.title)}" loading="lazy">`
    : `<a class="file" href="${esc(rel)}">${esc(asset.file)}</a>`;
  const claims = asset.claims.length
    ? `<ul class="claims">${asset.claims.map((c) => `<li><label><input type="checkbox"> ${esc(c)}</label></li>`).join('')}</ul>`
    : `<p class="quiet">${asset.source === 'generated' ? 'No claims written down. Say what this picture asserts before approving it.' : 'No claims.'}</p>`;
  return `<article class="${status}">
  <div class="pic">${preview}</div>
  <div class="facts">
    <h2>${esc(asset.title)} <span class="chip ${status}">${status}</span></h2>
    <p class="id"><code>${esc(asset.id)}</code> · ${esc(asset.kind)}${asset.width ? ` · ${asset.width}×${asset.height}` : ''}${used?.length ? ` · in ${used.map(esc).join(', ')}` : ''}</p>
    <p>${where}.</p>
    <p class="${t.use}">Licence: ${esc(t.id)}${t.note ? ` (${esc(t.note)})` : ''}${t.attribution && asset.source !== 'generated' ? '. Credit is owed.' : '.'}</p>
    ${o.prompt ? `<details><summary>Prompt</summary><p class="prompt">${esc(o.prompt)}</p></details>` : ''}
    ${asset.intent ? `<h3>What it is for</h3>\n    <p class="intent">${esc(asset.intent)}</p>` : ''}
    <h3>What it claims</h3>
    ${claims}
    ${asset.review?.note ? `<p class="note">Review note: ${esc(asset.review.note)}</p>` : ''}
    <pre>bioshot approve ${esc(asset.id)}\nbioshot reject ${esc(asset.id)} --note "what is wrong"</pre>
  </div>
</article>`;
}

export function reviewPage({ lib, assets, outFile, title = 'Asset review', usedIn = {}, previews = {} }) {
  const outDir = path.dirname(outFile);
  const order = { stale: 0, draft: 1, rejected: 2, approved: 3 };
  const sorted = [...assets].sort((a, b) => (order[lib.status(a)] ?? 9) - (order[lib.status(b)] ?? 9) || a.id.localeCompare(b.id));
  const count = (s) => sorted.filter((a) => lib.status(a) === s).length;
  const waiting = count('draft') + count('stale');
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
  :root { --ground: #f3f4f1; --card: #fff; --ink: #1c2126; --quiet: #5d666f; --line: #d8dbd6; --ok: #1f7a4d; --wait: #a15c00; --bad: #b3261e; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--ground); color: var(--ink); font: 16px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  header, main { max-width: 1100px; margin: 0 auto; padding: 0 16px; }
  header { padding-top: 40px; padding-bottom: 8px; }
  h1 { font-size: 30px; line-height: 1.2; margin: 0 0 6px; letter-spacing: -0.01em; }
  header p { margin: 0; color: var(--quiet); max-width: 70ch; }
  article { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 6fr); gap: 24px; background: var(--card); border: 1px solid var(--line); border-left: 6px solid var(--wait); border-radius: 6px; padding: 20px; margin: 20px 0; }
  article.approved { border-left-color: var(--ok); } article.rejected { border-left-color: var(--bad); }
  .pic { background: repeating-conic-gradient(#e9ebe7 0 25%, #f7f8f5 0 50%) 0 0 / 20px 20px; border-radius: 4px; display: flex; align-items: center; justify-content: center; min-height: 180px; }
  .pic img { max-width: 100%; max-height: 520px; display: block; }
  h2 { font-size: 20px; margin: 0 0 2px; } h3 { font-size: 15px; margin: 18px 0 4px; }
  p { margin: 6px 0; } .id, .quiet { color: var(--quiet); } .restricted, .unknown { color: var(--bad); font-weight: 600; }
  .chip { font-size: 13px; font-weight: 600; padding: 2px 8px; border-radius: 999px; vertical-align: 2px; color: #fff; background: var(--wait); }
  .chip.approved { background: var(--ok); } .chip.rejected { background: var(--bad); }
  .claims { list-style: none; padding: 0; margin: 4px 0; } .claims li { padding: 3px 0; } .claims input { margin-right: 6px; }
  .prompt, .note { background: var(--ground); padding: 10px 12px; border-radius: 4px; }
  pre { background: #1c2126; color: #e8ebe6; padding: 10px 12px; border-radius: 4px; overflow-x: auto; font-size: 13.5px; margin: 16px 0 0; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.92em; }
  @media (max-width: 760px) { article { grid-template-columns: 1fr; } }
</style></head>
<body>
<header>
  <h1>${esc(title)}</h1>
  <p>${sorted.length} asset${sorted.length === 1 ? '' : 's'}: ${waiting} waiting for review, ${count('approved')} approved, ${count('rejected')} rejected. Approve a picture only if it says exactly what it is for and every claim holds; one that nearly fits is a rejection. A film shows an unreviewed picture with a DRAFT tag in its corner.</p>
</header>
<main>
${sorted.map((a) => card(lib, a, outDir, usedIn[a.id], previews)).join('\n')}
</main>
</body></html>
`;
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, html);
  return { file: outFile, waiting, total: sorted.length };
}
