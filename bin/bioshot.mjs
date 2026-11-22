#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { openLibrary, libraryDir, KINDS } from '../src/library.mjs';
import { loadManifest } from '../src/manifest.mjs';
import { find, addFrom, plan, generate, spent } from '../src/acquire.mjs';
import { sync } from '../src/sync.mjs';
import { check } from '../src/gate.mjs';
import { reviewPage } from '../src/review.mjs';
import { previewFor } from '../src/preview.mjs';
import { licenceTerms } from '../src/licence.mjs';
import { envKey, gitUser } from '../src/util.mjs';
import * as fal from '../src/providers/fal.mjs';
import { toWebp, isReencodable, canWebp, WEBP_QUALITY } from '../src/encode.mjs';
import { init } from '../src/init.mjs';
import { setup, guide, TARGETS } from '../src/setup.mjs';
import { storyshotDir } from '../src/storyshot.mjs';

const HELP = `bioshot — an asset library and scene kit for biology and lab-product films (filmed with storyshot)

An asset comes from the library if a reviewed one fits its brief; otherwise it is made to the brief.
Open sources are searched only on request: a found picture that nearly fits is worse than none.
Whatever is added or generated joins the library and is there for the next film.

  bioshot init <dir> --topic "…" [--stages a,b,c]   a film skeleton: storyboard, asset manifest, look sheet, scenes
  bioshot find <words> [--kind K] [--open]         search the library (--open: Bioicons and Wikimedia Commons too)
  bioshot add <file|url> --kind K --title T --licence L [--id ID] [--intent S] [--tags a,b] [--author A]
              [--attribution S] [--page URL] [--claim S]… [--derived-from ID]
                                                   bring a file or a download into the library
  bioshot list [--kind K]                          what the library holds
  bioshot remove <id>                              take an asset out of the library for good
  bioshot compact                                  store generated pictures as WebP; keep originals and rejected files out of git
  bioshot plan [assets.yaml]                       what a film still needs, what could be reused, the cost
  bioshot gen [assets.yaml] [id…] --go [--anyway] [--from-drafts]
                                                   generate what is still missing (needs FAL_KEY)
  bioshot review [assets.yaml] [--all] [--open]    write the review page
  bioshot approve <id…> [--note S]                 a person has checked the picture against its claims
  bioshot reject <id> --note S
  bioshot sync [assets.yaml]                       put the film's assets into its scene folders
  bioshot check [assets.yaml] [--drafts]           is everything in the film reviewed, licensed and in place
  bioshot guide                                    print the playbook
  bioshot setup <agent>                            install the playbook for a coding agent (${TARGETS.join(', ')})
  bioshot doctor                                   what this machine has and lacks

  --library DIR   the library to use (default: the manifest's \`library:\`, $BIOSHOT_LIBRARY, ./library)
  kinds: ${KINDS.join(', ')}
`;

const args = process.argv.slice(2);
const cmd = args.shift();
const flags = {}, rest = [];
const MULTI = new Set(['claim']), BOOL = new Set(['go', 'anyway', 'from-drafts', 'all', 'open', 'drafts', 'help']);
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (!a.startsWith('--')) { rest.push(a); continue; }
  const k = a.slice(2);
  if (BOOL.has(k)) { flags[k] = true; continue; }
  const v = args[++i];
  if (v === undefined) fail(`--${k} needs a value`);
  if (MULTI.has(k)) (flags[k] ??= []).push(v); else flags[k] = v;
}
function fail(msg) { console.error(`✖ ${msg}`); process.exit(1); }
const manifestOf = () => loadManifest(rest.find((r) => /\.ya?ml$/.test(r)) ?? 'assets.yaml', { library: flags.library });
const ids = () => rest.filter((r) => !/\.ya?ml$/.test(r));
const openFor = (manifest) => openLibrary(manifest ? manifest.libraryDir : libraryDir(flags.library));
const row = (a, lib) => `  ${a.id.padEnd(34)} ${a.kind.padEnd(9)} ${lib.status(a).padEnd(9)} ${licenceTerms(a.licence.id).id.padEnd(14)} ${a.title}`;

try {
  if (!cmd || cmd === 'help' || flags.help) {
    console.log(HELP);
  } else if (cmd === 'init') {
    const r = init({ dir: rest[0], topic: flags.topic, stages: flags.stages?.split(',') });
    console.log(`✔ a film skeleton in ${path.relative(process.cwd(), r.root) || '.'}\n${r.written.map((f) => `  + ${f}`).join('\n')}\n  next: write the narration in film.yaml and the brief in assets.yaml, then in that folder:\n        bioshot plan  →  bioshot gen --go  →  bioshot review --open  →  bioshot sync  →  storyshot scene film.yaml --step 1`);
  } else if (cmd === 'guide') {
    process.stdout.write(guide());
  } else if (cmd === 'setup') {
    const written = setup(rest[0]);
    console.log(`✔ bioshot's playbook is set up for ${rest[0]}\n${written.map((f) => `  + ${f}`).join('\n')}`);
  } else if (cmd === 'doctor') {
    const ok = (good, what, fix) => console.log(`  ${good ? '✔' : '✖'} ${what}${good || !fix ? '' : ` — ${fix}`}`);
    const major = +process.versions.node.split('.')[0];
    ok(major >= 22, `node ${process.versions.node}`, 'storyshot renders with Node 22 or newer');
    const ff = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
    ok(ff.status === 0, ff.status === 0 ? ff.stdout.split('\n')[0].replace(/ Copyright.*/, '') : 'ffmpeg', 'install ffmpeg');
    ok(canWebp(), 'ffmpeg can write WebP', 'without libwebp, generated pictures stay as PNG');
    let ss = null; try { ss = storyshotDir(); } catch { /* reported below */ }
    ok(!!ss, ss ? `storyshot ${JSON.parse(fs.readFileSync(path.join(ss, 'package.json'), 'utf8')).version} at ${ss}` : 'storyshot', 'npm i -g storyshot, or set STORYSHOT_DIR');
    ok(!!envKey('FAL_KEY'), 'FAL_KEY is set', 'put FAL_KEY=… in a .env file here or above; needed only to generate');
    const lib = openFor();
    console.log(`  library: ${lib.root} (${lib.list().length} assets)`);
  } else if (cmd === 'find') {
    const query = rest.join(' ');
    if (!query) fail('find what? e.g. bioshot find "flow cell"');
    const lib = openFor();
    const r = await find({ lib, query, kind: flags.kind, open: !!flags.open, cacheDir: path.join(lib.root, '.cache') });
    console.log(`In the library (${r.library.length}):`);
    for (const h of r.library) console.log(row(h.asset, lib) + (h.coverage >= 1 ? '   ← covers the whole query' : ''));
    if (!r.library.length) console.log('  nothing');
    if (flags.open) {
      console.log(`\nOpen sources (${r.open.length}) — take one only if it says exactly what the brief says:`);
      for (const h of r.open) {
        const t = licenceTerms(h.licence.id);
        console.log(`  [${h.source}] ${h.title}${h.licence.author ? ` — ${h.licence.author}` : ''}\n      ${t.id}${t.use !== 'ok' ? ` (${t.note})` : ''}  ${h.width ? `${h.width}×${h.height}  ` : ''}${h.url}`);
      }
      for (const e of r.errors) console.log(`  ! ${e}`);
      console.log('\nTo take one: bioshot add <url> --kind … --title "…" --licence "…" --author "…"\nNot searched from here (look by hand): bioart.niaid.nih.gov, smart.servier.com, 3d.nih.gov');
    }
  } else if (cmd === 'add') {
    const from = rest[0];
    if (!from) fail('add what? a file or a URL');
    for (const need of ['kind', 'title']) if (!flags[need]) fail(`--${need} is needed`);
    const lib = openFor();
    const { asset, reused } = await addFrom({ lib, from, meta: {
      id: flags.id, kind: flags.kind, title: flags.title, description: flags.description, intent: flags.intent, tags: flags.tags ? flags.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
      licence: { id: flags.licence, author: flags.author, attribution: flags.attribution, url: flags['licence-url'] }, page: flags.page,
      source: flags.source, claims: flags.claim ?? [], derived_from: flags['derived-from'],
    } });
    console.log(reused ? (lib.status(asset) === 'rejected' ? `= this exact file is already in the library as "${asset.id}", and was rejected${asset.review.note ? `: ${asset.review.note}` : ''}` : `= already in the library as "${asset.id}" (same file): reuse it`) : `✔ added "${asset.id}" to the library (${path.relative(process.cwd(), lib.fileOf(asset))}) — not reviewed yet`);
  } else if (cmd === 'list') {
    const lib = openFor();
    const all = lib.list().filter((a) => !flags.kind || a.kind === flags.kind);
    console.log(`${lib.root}: ${all.length} asset${all.length === 1 ? '' : 's'}`);
    for (const a of all) console.log(row(a, lib));
  } else if (cmd === 'remove') {
    const lib = openFor();
    if (!rest.length) fail('remove which asset?');
    for (const id of rest) { lib.remove(id); console.log(`✔ removed "${id}" from the library`); }
  } else if (cmd === 'compact') {
    const lib = openFor();
    if (!canWebp()) fail('this ffmpeg cannot write WebP (it has no libwebp)');
    let before = 0, after = 0;
    for (const a of lib.list()) {
      const f = lib.fileOf(a), ext = path.extname(a.file).toLowerCase();
      // a rejected asset keeps its record; its file moves out of the folder git sees
      if (lib.status(a) === 'rejected') { if (fs.existsSync(f)) { fs.mkdirSync(path.join(lib.root, '.rejected', a.id), { recursive: true }); fs.renameSync(f, path.join(lib.root, '.rejected', a.id, a.file)); console.log(`  rejected ${a.id}: file kept locally, out of git`); } continue; }
      if (a.source !== 'generated' || !isReencodable(ext) || !fs.existsSync(f)) continue;
      const src = fs.readFileSync(f), webp = toWebp(src, ext);
      if (!webp) { console.log(`  ${a.id}: kept as ${ext.slice(1).toUpperCase()} (it has transparency)`); continue; }
      lib.reencode(a.id, { buffer: webp, ext: '.webp', note: `webp q${WEBP_QUALITY}` });
      before += src.length; after += webp.length;
      console.log(`  ${a.id}: ${(src.length / 1024).toFixed(0)} KB → ${(webp.length / 1024).toFixed(0)} KB (needs review again)`);
    }
    console.log(`✔ ${(before / 1048576).toFixed(1)} MB → ${(after / 1048576).toFixed(1)} MB; originals are in ${path.relative(process.cwd(), path.join(lib.root, '.masters'))}`);
  } else if (cmd === 'plan' || (cmd === 'gen' && !flags.go)) {
    const manifest = manifestOf(), lib = openFor(manifest);
    const rows = plan({ manifest, lib, provider: fal });
    let est = 0;
    for (const r of rows) {
      if (r.state === 'have') { console.log(`  have     ${r.id}  (${r.status})`); continue; }
      if (r.problem) { console.log(`  MISSING  ${r.id}: ${r.problem}`); continue; }
      console.log(`  missing  ${r.id}: "${r.want.title}"`);
      for (const c of r.candidates) console.log(`             library has "${c.asset.id}" (${Math.round(c.coverage * 100)}% of the words)${c.coverage >= 1 ? ' ← reuse this' : ''}`);
      if (r.makeable) { console.log(`             else ${r.want.from ? `make it from "${r.want.from}"` : 'generate'}: about $${(r.estimate ?? 0).toFixed(2)}`); if (!r.reuse.length) est += r.estimate ?? 0; }
      else console.log('             nothing to make it from: it can only be found or supplied');
    }
    const s = spent(manifest);
    console.log(`\nGenerating everything still missing: about $${est.toFixed(2)}. Spent so far: $${s.usd.toFixed(2)} of a $${manifest.budget.toFixed(2)} budget.`);
    if (cmd === 'gen') console.log('Nothing was generated. To make what is missing: bioshot gen --go [id…]');
  } else if (cmd === 'gen') {
    const manifest = manifestOf(), lib = openFor(manifest);
    const r = await generate({ manifest, lib, ids: ids(), provider: fal, key: envKey('FAL_KEY', [manifest.dir, process.cwd()]), anyway: flags.anyway, fromDrafts: flags['from-drafts'], log: (m) => console.log(`  ${m}`) });
    for (const a of r.done) console.log(`✔ generated "${a.id}" — now in the library, not reviewed yet`);
    for (const x of r.refused) console.log(`– ${x.id}: ${x.why}`);
    console.log(`Spent so far: $${r.spent.toFixed(2)} of $${manifest.budget.toFixed(2)}.`);
  } else if (cmd === 'review') {
    const hasManifest = !flags.all && (rest.some((r) => /\.ya?ml$/.test(r)) || fs.existsSync('assets.yaml'));
    const manifest = hasManifest ? manifestOf() : null, lib = openFor(manifest);
    const assets = manifest ? manifest.assets.map((e) => lib.get(e.id)).filter(Boolean) : lib.list();
    const usedIn = manifest ? Object.fromEntries(manifest.assets.map((e) => [e.id, e.in])) : {};
    const outFile = manifest ? path.join(manifest.workDir, 'review.html') : path.join(lib.root, 'index.html');
    const previews = {};
    for (const a of assets) {
      try { const p = await previewFor(lib, a); if (p) previews[a.id] = p; } catch (err) { console.log(`  ! no preview of ${a.id}: ${err.message}`); }
    }
    const r = reviewPage({ lib, assets, outFile, usedIn, previews, title: manifest ? `Asset review: ${path.basename(manifest.dir)}` : 'Asset library' });
    console.log(`✔ ${r.file}\n  ${r.total} assets, ${r.waiting} waiting for review`);
    if (flags.open) spawnSync(process.platform === 'darwin' ? 'open' : 'xdg-open', [r.file], { stdio: 'ignore' });
  } else if (cmd === 'approve' || cmd === 'reject') {
    const lib = openFor(fs.existsSync('assets.yaml') && !flags.library ? manifestOf() : null);
    if (!rest.length) fail(`${cmd} which asset?`);
    if (cmd === 'reject' && !flags.note) fail('reject needs --note saying what is wrong, so the next attempt can fix it');
    for (const id of rest) {
      const a = lib.review(id, cmd === 'approve' ? 'approved' : 'rejected', { by: gitUser() ?? undefined, note: flags.note });
      console.log(`✔ ${a.id}: ${a.review.state}`);
    }
  } else if (cmd === 'sync') {
    const manifest = manifestOf(), lib = openFor(manifest);
    const r = sync({ manifest, lib });
    for (const f of r.copied) console.log(`  + ${f}`);
    for (const f of r.marked) console.log(`  ~ ${f}   (not reviewed: tagged DRAFT)`);
    for (const f of r.removed) console.log(`  - ${f}`);
    for (const f of r.skipped) console.log(`  · skipped ${f}`);
    for (const f of r.kit ?? []) console.log(`  + ${f}`);
    for (const p of r.problems) console.log(`  ✖ ${p}`);
    if (r.credits) console.log(`  credits: ${r.credits} (add it as the film's last scene)`);
    console.log(`✔ synced: ${r.copied.length} copied, ${r.marked.length} marked, ${r.kept.length} unchanged, ${r.removed.length} removed`);
    if (r.problems.length) process.exit(1);
  } else if (cmd === 'check') {
    const manifest = manifestOf(), lib = openFor(manifest);
    const r = check({ manifest, lib, drafts: flags.drafts });
    for (const w of r.warnings) console.log(`  ⚠ ${w}`);
    for (const e of r.errors) console.log(`  ✖ ${e}`);
    if (r.errors.length) { console.log(`✖ ${r.errors.length} problem${r.errors.length === 1 ? '' : 's'} with the film's assets`); process.exit(1); }
    console.log(`✔ assets: ${manifest.assets.length} in the manifest, all in the library${flags.drafts ? '' : ', reviewed'} and in place`);
  } else {
    fail(`unknown command "${cmd}" — run \`bioshot help\``);
  }
} catch (err) {
  fail(err.message);
}
