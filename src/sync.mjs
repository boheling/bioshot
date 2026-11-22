// Puts library assets into the film's scene folders. This is the gate: a scene only ever sees what
// sync gave it. An approved asset is copied as it is; anything else is copied with a DRAFT tag in
// its corner and a thin outline, so a film rendered with unreviewed pictures says so without
// looking broken.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sha256, isImage, isRaster } from './util.mjs';
import { creditLine } from './licence.mjs';

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'kit');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// The mark on a picture nobody has reviewed: a small amber DRAFT tag in the top-left corner, a thin
// outline, and the word repeated faintly across the picture, because a scene that scales or crops a
// plate would otherwise crop the tag away. (The first version crossed the picture out in red and
// read as a broken image.) Changing the mark changes MARK, so sync re-marks what it placed before.
export const MARK = 5;
const AMBER = 'e08a00';
const FONTS = ['/System/Library/Fonts/Supplemental/Arial Bold.ttf', '/System/Library/Fonts/Supplemental/Arial.ttf', '/System/Library/Fonts/Helvetica.ttc',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf', 'C:/Windows/Fonts/arialbd.ttf'];

export function stamp(src, dest) {
  if (path.extname(src).toLowerCase() === '.svg') {
    const svg = fs.readFileSync(src, 'utf8');
    // nested <svg>s with their own units: the tag keeps its shape, the repeat covers the whole picture
    const text = 'font-family="Arial, Helvetica, sans-serif" font-weight="700"';
    const mark = `<g pointer-events="none"><rect x="0" y="0" width="100%" height="100%" fill="none" stroke="#${AMBER}" stroke-width="3" vector-effect="non-scaling-stroke"/>`
      + `<svg x="0" y="0" width="100%" height="100%" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice"><defs><pattern id="bioshot-draft" width="330" height="250" patternUnits="userSpaceOnUse" patternTransform="rotate(-20)">`
      + `<text x="30" y="140" ${text} font-size="58" fill="#${AMBER}" fill-opacity="0.16">DRAFT</text></pattern></defs><rect x="-500" y="-500" width="2000" height="2000" fill="url(#bioshot-draft)"/></svg>`
      + `<svg x="0" y="0" width="100%" height="100%" viewBox="0 0 1000 1000" preserveAspectRatio="xMinYMin meet"><rect x="0" y="0" width="200" height="60" fill="#${AMBER}"/>`
      + `<text x="16" y="45" ${text} font-size="44" fill="#fff">DRAFT</text></svg></g>`;
    if (!/<\/svg>\s*$/i.test(svg)) throw new Error(`${path.basename(src)}: not an SVG that can be marked`);
    fs.writeFileSync(dest, svg.replace(/<\/svg>\s*$/i, `${mark}</svg>`));
    return;
  }
  // replace=1 so the tag is opaque even on the transparent corner of a cutout
  const m = 'min(iw\\,ih)', mt = 'min(w\\,h)', font = FONTS.find((f) => fs.existsSync(f));
  const ff = font && `fontfile='${font.replace(/:/g, '\\:')}'`;
  const filters = [`drawbox=x=0:y=0:w=iw:h=ih:t=max(3\\,${m}/300):color=0x${AMBER}:replace=1`];
  if (ff) {
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) filters.push(`drawtext=${ff}:text=DRAFT:fontcolor=0x${AMBER}@0.16:fontsize=${mt}*0.05:x=w*${((c + (r % 2 ? 0.75 : 0.25)) / 4).toFixed(3)}-text_w/2:y=h*${((r + 0.5) / 3).toFixed(3)}`);
  }
  filters.push(`drawbox=x=0:y=0:w=${m}*0.2:h=${m}*0.06:t=fill:color=0x${AMBER}:replace=1`);
  if (ff) filters.push(`drawtext=${ff}:text=DRAFT:fontcolor=white:fontsize=${mt}*0.044:x=${mt}*0.016:y=${mt}*0.011`);
  const enc = /\.webp$/i.test(dest) ? ['-c:v', 'libwebp', '-quality', '90'] : [];
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-vf', filters.join(','), ...enc, '-frames:v', '1', dest], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`could not mark ${path.basename(src)} as a draft (ffmpeg: ${(r.stderr || r.error?.message || '').trim().split('\n').pop()})`);
}

const stateFile = (manifest) => path.join(manifest.workDir, 'sync.json');
export const readSync = (manifest) => (fs.existsSync(stateFile(manifest)) ? JSON.parse(fs.readFileSync(stateFile(manifest), 'utf8')) : { files: {} });

// The credits a film owes, and the disclosure it makes when pictures in it were generated.
export function credits({ manifest, lib }) {
  const used = manifest.assets.map((e) => lib.get(e.id)).filter(Boolean);
  const lines = [...new Set(used.map(creditLine).filter(Boolean))];
  const generated = used.filter((a) => a.source === 'generated');
  const reviewed = generated.every((a) => lib.status(a) === 'approved');
  const disclosure = !generated.length ? null
    : reviewed ? 'Illustrations in this film were generated with AI and reviewed by a person. They are not experimental data.'
      : 'Illustrations in this film were generated with AI and are still drafts: nobody has reviewed them yet. They are not experimental data.';
  return { disclosure, lines };
}

function creditsScene({ disclosure, lines }) {
  const shown = lines.slice(0, 9), more = lines.length - shown.length;
  const rows = [...shown, ...(more > 0 ? [`and ${more} more: see credits.txt`] : [])];
  return `<!-- Written by \`bioshot sync\`. Edits are overwritten: change the assets, not this file. -->
<template>
  <style>
    #credits-body { position: absolute; left: 8%; right: 8%; top: 14%; }
    #credits-note { font-size: 40px; line-height: 1.3; font-weight: 600; max-width: 30em; }
    #credits-list { margin-top: 56px; font-size: 30px; line-height: 1.5; opacity: 0.85; }
  </style>
  <div id="credits" class="film" data-composition-id="credits" data-width="1920" data-height="1080">
    <div id="credits-body">
      ${disclosure ? `<div id="credits-note">${esc(disclosure)}</div>` : ''}
      <div id="credits-list">${rows.map((l) => `<div>${esc(l)}</div>`).join('')}</div>
    </div>
  </div>
  <script>
    (function () {
      const S = window.__storyshot;
      const tl = gsap.timeline({ paused: true });
      tl.fromTo('#credits-body', { opacity: 0 }, { opacity: 1, duration: 0.5, ease: 'power2.out' }, S.at(0));
      window.__timelines['credits'] = tl;
    })();
  </script>
</template>
`;
}

export function sync({ manifest, lib }) {
  const before = readSync(manifest).files, files = {};
  const report = { copied: [], marked: [], kept: [], skipped: [], removed: [], problems: [] };
  for (const e of manifest.assets) {
    const asset = lib.get(e.id);
    if (!asset) { report.problems.push(`${e.id}: not in the library yet (bioshot plan, then bioshot gen --go)`); continue; }
    const status = lib.status(asset), src = lib.fileOf(asset);
    if (status === 'rejected') { report.problems.push(`${e.id}: it was rejected in review — replace it`); continue; }
    if (status === 'missing') { report.problems.push(`${e.id}: its file is missing from the library`); continue; }
    for (const scene of e.in) {
      const sceneDir = path.join(manifest.scenesDir, scene);
      if (!fs.existsSync(sceneDir)) { report.problems.push(`${e.id}: there is no scene folder ${path.relative(manifest.dir, sceneDir)}`); continue; }
      const dest = path.join(sceneDir, 'assets', e.as ?? asset.file), rel = path.relative(manifest.dir, dest);
      const approved = status === 'approved';
      if (!approved && !isImage(src)) { report.skipped.push(`${rel} (${e.id} is ${status}: only reviewed ${asset.kind}s are synced)`); continue; }
      const want = { id: e.id, sha256: asset.sha256, marked: !approved, ...(approved ? {} : { mark: MARK }) };
      const prev = before[rel];
      if (prev && prev.sha256 === want.sha256 && prev.marked === want.marked && prev.mark === want.mark && fs.existsSync(dest) && sha256(fs.readFileSync(dest)) === prev.out) {
        files[rel] = prev; report.kept.push(rel); continue;
      }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      try {
        if (approved) fs.copyFileSync(src, dest); else stamp(src, dest);
      } catch (err) { report.problems.push(err.message); continue; }
      files[rel] = { ...want, out: sha256(fs.readFileSync(dest)) };
      (approved ? report.copied : report.marked).push(rel);
    }
  }
  for (const rel of Object.keys(before)) {
    if (files[rel]) continue;
    const f = path.join(manifest.dir, rel);
    if (fs.existsSync(f) && sha256(fs.readFileSync(f)) === before[rel].out) { fs.rmSync(f); report.removed.push(rel); }
  }
  // BioKit travels with the film: the scenes load it from scenes/kit/. The 3D bundle only when a model is used.
  report.kit = [];
  if (fs.existsSync(manifest.scenesDir)) {
    const has3d = manifest.assets.some((e) => lib.get(e.id)?.kind === 'model');
    for (const f of ['biokit.js', 'biokit.css', ...(has3d ? ['bio3.js'] : [])]) {
      const src = path.join(KIT, f), dest = path.join(manifest.scenesDir, 'kit', f);
      if (!fs.existsSync(src)) continue;
      if (!fs.existsSync(dest) || sha256(fs.readFileSync(dest)) !== sha256(fs.readFileSync(src))) { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(src, dest); report.kit.push(path.relative(manifest.dir, dest)); }
    }
  }
  const c = credits({ manifest, lib });
  if (c.disclosure || c.lines.length) {
    const dir = path.join(manifest.scenesDir, 'credits');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'scene.html'), creditsScene(c));
    fs.writeFileSync(path.join(manifest.dir, 'credits.txt'), [c.disclosure, ...c.lines].filter(Boolean).join('\n') + '\n');
    report.credits = path.relative(manifest.dir, path.join(dir, 'scene.html'));
  }
  fs.mkdirSync(manifest.workDir, { recursive: true });
  fs.writeFileSync(stateFile(manifest), JSON.stringify({ files }, null, 2));
  return report;
}
