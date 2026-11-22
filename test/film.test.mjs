import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openLibrary } from '../src/library.mjs';
import { loadManifest } from '../src/manifest.mjs';
import { plan, generate, addFrom } from '../src/acquire.mjs';
import { sync, credits } from '../src/sync.mjs';
import { check } from '../src/gate.mjs';
import { reviewPage } from '../src/review.mjs';
import { hasBin } from '../src/util.mjs';

const svg = (label) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><text>${label}</text></svg>`);
// A provider that draws nothing and bills ten cents.
const fake = (log = []) => ({
  DEFAULTS: { plate: 'fake/image' },
  modelFor: (want) => `fake/${want.kind}`,
  estimate: () => 0.1,
  async make(req) { log.push(req); return { buffer: svg(`${req.want.kind}: ${req.want.prompt ?? req.from}`), ext: '.svg', origin: { provider: 'fake', model: `fake/${req.want.kind}`, prompt: req.want.prompt, cost_usd: 0.1 } }; },
});

function film(yaml) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bioshot-film-'));
  fs.mkdirSync(path.join(dir, 'scenes', '01-instrument'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'scenes', '02-flowcell'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'scenes', '01-instrument', 'scene.html'), '<template><img src="assets/sequencer.svg"></template>');
  fs.writeFileSync(path.join(dir, 'scenes', '02-flowcell', 'scene.html'), '<template><img src="assets/cell.svg"></template>');
  fs.writeFileSync(path.join(dir, 'assets.yaml'), yaml);
  const manifest = loadManifest(path.join(dir, 'assets.yaml'));
  return { dir, manifest, lib: openLibrary(manifest.libraryDir) };
}
const YAML_ = `library: library
budget: 0.25
assets:
  - id: sequencer
    in: [01-instrument]
    want: { kind: plate, title: Benchtop sequencer, tags: [ngs, instrument], prompt: a generic benchtop sequencer, claims: [resembles no real product] }
  - id: flow-cell
    in: [02-flowcell]
    as: cell.svg
    want: { kind: plate, title: Flow cell, tags: [ngs], prompt: a two-lane flow cell, claims: [two lanes] }
`;

test('a manifest says what is wrong with itself', () => {
  assert.throws(() => film('assets:\n  - id: Bad Id\n'), /lower-case/);
  assert.throws(() => film('assets:\n  - id: a\n  - id: a\n'), /listed twice/);
  assert.throws(() => film('assets:\n  - id: a\n    wants: {}\n'), /Unrecognized key|unrecognized/i);
});

test('the library is asked before anything is generated', async () => {
  const { manifest, lib } = film(YAML_);
  // someone made a flow cell for an earlier film, under another id
  lib.add({ kind: 'plate', source: 'generated', licence: { id: 'provider-terms' }, buffer: svg('old'), ext: '.svg', title: 'Flow cell, top view', tags: ['ngs'] });
  const rows = plan({ manifest, lib, provider: fake() });
  assert.equal(rows.find((r) => r.id === 'flow-cell').reuse[0].asset.id, 'flow-cell-top-view');
  const calls = [];
  const r = await generate({ manifest, lib, provider: fake(calls), key: 'k' });
  assert.deepEqual(r.done.map((a) => a.id), ['sequencer']);
  assert.match(r.refused[0].why, /already has "flow-cell-top-view"/);
  assert.equal(calls.length, 1);
  const made = lib.get('sequencer');
  assert.equal(made.source, 'generated');
  assert.deepEqual(made.claims, ['resembles no real product']);
  assert.equal(lib.status(made), 'draft');
  // once made, it is in the library: a second run generates nothing
  const again = await generate({ manifest, lib, provider: fake(calls), key: 'k' });
  assert.equal(again.done.length, 0);
  assert.equal(calls.length, 1);
});

test('generation stops at the budget', async () => {
  const { manifest, lib } = film(YAML_.replace('budget: 0.25', 'budget: 0.15'));
  const r = await generate({ manifest, lib, provider: fake(), key: 'k', anyway: true });
  assert.equal(r.done.length, 1);
  assert.match(r.refused[0].why, /over budget/);
});

test('real material is not uploaded as a reference unless its owner said so', async () => {
  const { dir, manifest, lib } = film(YAML_.replace('claims: [two lanes] }', 'claims: [two lanes], refs: [lab-photo] }'));
  const photo = path.join(dir, 'photo.svg');
  fs.writeFileSync(photo, svg('our lab'));
  await addFrom({ lib, from: photo, meta: { id: 'lab-photo', kind: 'photo', title: 'Our lab', licence: { id: 'own' } } });
  await assert.rejects(generate({ manifest, lib, ids: ['flow-cell'], provider: fake(), key: 'k' }), /may not be uploaded/);
});

test('sync marks what nobody reviewed, and check holds the film until it is reviewed', async () => {
  const { dir, manifest, lib } = film(YAML_);
  await generate({ manifest, lib, provider: fake(), key: 'k' });
  let r = sync({ manifest, lib });
  assert.equal(r.marked.length, 2);
  const placed = path.join(dir, 'scenes', '02-flowcell', 'assets', 'cell.svg');
  assert.match(fs.readFileSync(placed, 'utf8'), />DRAFT<\/text>/);            // the draft carries its tag
  let c = check({ manifest, lib });
  assert.equal(c.errors.filter((e) => /not reviewed yet/.test(e)).length, 2);
  assert.equal(check({ manifest, lib, drafts: true }).errors.length, 0);    // drafts are fine while laying out

  lib.review('sequencer', 'approved'); lib.review('flow-cell', 'approved');
  assert.match(check({ manifest, lib }).errors.join('\n'), /out of date — run `bioshot sync`/);
  r = sync({ manifest, lib });
  assert.equal(r.copied.length, 2);
  assert.doesNotMatch(fs.readFileSync(placed, 'utf8'), /DRAFT/);
  assert.deepEqual(check({ manifest, lib }).errors, []);

  // a copy edited in place is caught, and so is a file that never came from the library
  fs.appendFileSync(placed, '<!-- touched up -->');
  fs.writeFileSync(path.join(dir, 'scenes', '02-flowcell', 'assets', 'stray.png'), 'x');
  c = check({ manifest, lib });
  assert.match(c.errors.join('\n'), /changed since `bioshot sync`/);
  assert.match(c.warnings.join('\n'), /stray\.png: not from the library/);
});

test('a scene that mentions an asset nobody supplied fails the check', () => {
  const { manifest, lib } = film('library: library\nassets: []\n');
  assert.match(check({ manifest, lib }).errors.join('\n'), /uses assets\/sequencer\.svg, which is not there/);
});

test('an asset the film stops using is taken back out of its scenes', async () => {
  const { dir, manifest, lib } = film(YAML_);
  await generate({ manifest, lib, provider: fake(), key: 'k' });
  sync({ manifest, lib });
  fs.writeFileSync(manifest.file, YAML_.replace(/  - id: flow-cell[\s\S]*$/, ''));
  const r = sync({ manifest: loadManifest(manifest.file), lib });
  assert.deepEqual(r.removed, [path.join('scenes', '02-flowcell', 'assets', 'cell.svg')]);
  assert.equal(fs.existsSync(path.join(dir, 'scenes', '02-flowcell', 'assets', 'cell.svg')), false);
});

test('licences reach the check and the credits', async () => {
  const { dir, manifest, lib } = film('library: library\nassets:\n  - { id: tube, in: [01-instrument], as: sequencer.svg }\n  - { id: cell, in: [02-flowcell], as: cell.svg }\n');
  const a = path.join(dir, 'a.svg'), b = path.join(dir, 'b.svg');
  fs.writeFileSync(a, svg('tube')); fs.writeFileSync(b, svg('cell'));
  await addFrom({ lib, from: a, meta: { id: 'tube', kind: 'icon', title: 'Tube', source: 'open', licence: { id: 'CC BY-NC 4.0', author: 'N. Body' } } });
  await addFrom({ lib, from: b, meta: { id: 'cell', kind: 'icon', title: 'Cell', source: 'open', licence: { id: 'CC BY 4.0', author: 'S. One' } } });
  lib.review('tube', 'approved'); lib.review('cell', 'approved');
  const r = sync({ manifest, lib });
  assert.match(check({ manifest, lib }).errors.join('\n'), /tube: CC-BY-NC-4\.0 is non-commercial only/);
  assert.deepEqual(credits({ manifest, lib }).lines, ['Tube by N. Body, CC-BY-NC-4.0', 'Cell by S. One, CC-BY-4.0']);
  assert.equal(credits({ manifest, lib }).disclosure, null);
  assert.match(fs.readFileSync(path.join(dir, r.credits), 'utf8'), /Cell by S\. One, CC-BY-4\.0/);
});

test('the review page lists what is waiting first', async () => {
  const { manifest, lib } = film(YAML_);
  await generate({ manifest, lib, provider: fake(), key: 'k' });
  lib.review('flow-cell', 'approved');
  const r = reviewPage({ lib, assets: lib.list(), outFile: path.join(manifest.workDir, 'review.html') });
  const html = fs.readFileSync(r.file, 'utf8');
  assert.equal(r.waiting, 1);
  assert.ok(html.indexOf('bioshot approve sequencer') < html.indexOf('bioshot approve flow-cell'));
  assert.match(html, /resembles no real product/);
});

test('a raster draft gets its tag from ffmpeg, also on a transparent corner', { skip: !hasBin('ffmpeg') && 'no ffmpeg' }, async () => {
  const { spawnSync } = await import('node:child_process');
  const { stamp } = await import('../src/sync.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bioshot-stamp-'));
  const src = path.join(dir, 'grey.png'), out = path.join(dir, 'marked.png');
  spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=black@0:s=600x400,format=rgba', '-frames:v', '1', src]);
  stamp(src, out);
  const at = (x, y) => [...spawnSync('ffmpeg', ['-v', 'error', '-i', out, '-vf', `crop=1:1:${x}:${y},format=rgba`, '-f', 'rawvideo', '-'], { encoding: 'buffer' }).stdout];
  const tag = at(70, 4), middle = at(300, 330);
  assert.ok(tag[0] > 200 && tag[1] > 110 && tag[1] < 170 && tag[2] < 40 && tag[3] === 255, `the tag is opaque amber (got ${tag})`);
  assert.equal(middle[3], 0, 'the picture itself is left alone');
});

test('a cutout and a model are made from a reviewed picture, and stay tied to it', async () => {
  const { manifest, lib } = film(`library: library
budget: 1
assets:
  - id: cell-plate
    want: { kind: plate, title: Flow cell on white, prompt: a flow cell }
  - id: cell-cutout
    want: { kind: cutout, title: Flow cell alone, from: cell-plate }
  - id: cell-model
    want: { kind: model, title: Flow cell in 3D, from: cell-cutout, claims: [the far side is a guess] }
`);
  let r = await generate({ manifest, lib, provider: fake(), key: 'k' });
  assert.deepEqual(r.done.map((a) => a.id), ['cell-plate']);
  assert.match(r.refused[0].why, /"cell-plate" is draft: review it before paying/);
  lib.review('cell-plate', 'approved');
  r = await generate({ manifest, lib, provider: fake(), key: 'k', fromDrafts: true });
  assert.deepEqual(r.done.map((a) => a.id), ['cell-cutout', 'cell-model']);
  assert.equal(lib.get('cell-model').derived_from, 'cell-cutout');
  assert.equal(lib.get('cell-model').kind, 'model');
  assert.throws(() => lib.remove('cell-plate'), /derived from it/);
});

test('what is made from an openly licensed picture still owes its credit', async () => {
  const { dir, manifest, lib } = film(`library: library
budget: 1
assets:
  - { id: tube-cutout, want: { kind: cutout, title: Tube alone, from: tube } }
`);
  const f = path.join(dir, 't.svg'); fs.writeFileSync(f, svg('tube'));
  await addFrom({ lib, from: f, meta: { id: 'tube', kind: 'icon', title: 'Tube', source: 'open', licence: { id: 'CC BY 4.0', author: 'S. One' } } });
  lib.review('tube', 'approved');
  await generate({ manifest, lib, provider: fake(), key: 'k' });
  assert.equal(lib.get('tube-cutout').licence.id, 'CC-BY-4.0');
  assert.deepEqual(credits({ manifest, lib }).lines, ['Tube alone by S. One, CC-BY-4.0']);
});

test('a generated PNG is stored as WebP and its original is kept outside the library folder', { skip: !hasBin('ffmpeg') && 'no ffmpeg' }, async () => {
  const { spawnSync } = await import('node:child_process');
  const { canWebp } = await import('../src/encode.mjs');
  if (!canWebp()) return;
  const { dir, manifest, lib } = film('library: library\nbudget: 1\nassets:\n  - { id: hero, want: { kind: plate, title: Hero, prompt: a hero } }\n');
  const png = path.join(dir, 'x.png');
  spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=640x360', '-frames:v', '1', png]);
  const provider = { ...fake(), async make() { return { buffer: fs.readFileSync(png), ext: '.png', origin: { provider: 'fake', model: 'fake/plate', cost_usd: 0.1 } }; } };
  await generate({ manifest, lib, provider, key: 'k' });
  const a = lib.get('hero');
  assert.equal(a.file, 'hero.webp');
  assert.equal(a.width, 640);
  assert.equal(a.origin.encoded, 'webp q90');
  assert.ok(a.bytes < a.origin.master.bytes);
  assert.equal(fs.existsSync(path.join(lib.root, '.masters', 'hero.png')), true);
});
