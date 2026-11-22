// `bioshot check`: is every picture in this film in the library, reviewed, licensed for it, and
// exactly the file that was reviewed?
import fs from 'node:fs';
import path from 'node:path';
import { sha256 } from './util.mjs';
import { licenceTerms } from './licence.mjs';
import { readSync, MARK } from './sync.mjs';

export function check({ manifest, lib, drafts = false }) {
  const errors = [], warnings = [];
  const soft = (msg) => (drafts ? warnings : errors).push(msg);
  const synced = readSync(manifest).files;
  const managed = new Set();

  for (const e of manifest.assets) {
    const asset = lib.get(e.id);
    if (!asset) { errors.push(`${e.id}: not in the library — look for it (\`bioshot find\`), and generate it only if nothing fits (\`bioshot gen\`)`); continue; }
    const status = lib.status(asset);
    if (status === 'missing') { errors.push(`${e.id}: its file is missing from the library`); continue; }
    if (status === 'rejected') errors.push(`${e.id}: it was rejected in review${asset.review.note ? ` ("${asset.review.note}")` : ''} — replace it`);
    else if (status === 'stale') soft(`${e.id}: its file or its claims changed after it was approved — review it again (\`bioshot review\`)`);
    else if (status === 'draft') soft(`${e.id}: not reviewed yet — \`bioshot review\`, then \`bioshot approve ${e.id}\``);

    const t = licenceTerms(asset.licence.id);
    if (t.use === 'unknown') errors.push(`${e.id}: no usable licence on record ("${asset.licence.id}") — find out what it is before it goes in a film`);
    if (t.use === 'restricted' && !manifest.allow_restricted) errors.push(`${e.id}: ${t.id} is ${t.note}, and a product film is commercial and a derivative`);
    if (t.shareAlike && t.use === 'ok') warnings.push(`${e.id}: ${t.id} is share-alike — check that the film can carry it`);
    if (asset.source === 'generated' && !asset.claims.length) warnings.push(`${e.id}: a generated picture with no claims — write down what it asserts, so the reviewer has something to check`);
    if (!e.in.length) warnings.push(`${e.id}: listed but not placed in any scene (\`in:\`)`);

    for (const scene of e.in) {
      const sceneDir = path.join(manifest.scenesDir, scene);
      if (!fs.existsSync(sceneDir)) { errors.push(`${e.id}: there is no scene folder ${path.relative(manifest.dir, sceneDir)}`); continue; }
      const rel = path.relative(manifest.dir, path.join(sceneDir, 'assets', e.as ?? asset.file));
      managed.add(rel);
      const rec = synced[rel], f = path.join(manifest.dir, rel);
      if (!rec || !fs.existsSync(f)) { if (status === 'approved' || /\.(png|jpe?g|webp|svg|gif|avif)$/i.test(rel)) errors.push(`${rel}: not synced — run \`bioshot sync\``); continue; }
      if (sha256(fs.readFileSync(f)) !== rec.out) errors.push(`${rel}: changed since \`bioshot sync\` put it there — edit the library asset, not the copy`);
      else if (rec.sha256 !== asset.sha256 || rec.marked !== (status !== 'approved') || (rec.marked && rec.mark !== MARK)) errors.push(`${rel}: out of date — run \`bioshot sync\``);
    }
  }

  // every assets/… a scene mentions has to be there, and everything there has to have come from the library
  if (fs.existsSync(manifest.scenesDir)) {
    for (const scene of fs.readdirSync(manifest.scenesDir, { withFileTypes: true }).filter((d) => d.isDirectory())) {
      const dir = path.join(manifest.scenesDir, scene.name);
      for (const html of fs.readdirSync(dir).filter((f) => f.endsWith('.html'))) {
        const text = fs.readFileSync(path.join(dir, html), 'utf8');
        for (const m of text.matchAll(/["'(]assets\/([^"')\s?#]+)/g)) {
          if (!fs.existsSync(path.join(dir, 'assets', m[1]))) errors.push(`${path.join(manifest.scenes, scene.name, html)}: uses assets/${m[1]}, which is not there — add it to the manifest and \`bioshot sync\``);
        }
      }
      const assets = path.join(dir, 'assets');
      if (!fs.existsSync(assets)) continue;
      for (const f of fs.readdirSync(assets, { recursive: true })) {
        const abs = path.join(assets, String(f));
        if (fs.statSync(abs).isDirectory() || path.basename(abs).startsWith('.')) continue;
        const rel = path.relative(manifest.dir, abs);
        if (!managed.has(rel)) warnings.push(`${rel}: not from the library — nobody has reviewed it and it will not be there for the next film (\`bioshot add\`)`);
      }
    }
  }
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}
