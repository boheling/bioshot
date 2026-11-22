import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openLibrary, statusOf } from '../src/library.mjs';
import { normaliseLicence, licenceTerms, creditLine } from '../src/licence.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bioshot-'));
const svg = (label) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><text>${label}</text></svg>`);
const base = { kind: 'icon', source: 'open', licence: { id: 'CC BY 4.0', author: 'A. Person' } };

test('the same bytes are stored once, whatever they are called the second time', () => {
  const lib = openLibrary(tmp());
  const a = lib.add({ ...base, buffer: svg('flow cell'), ext: '.svg', title: 'Flow cell', tags: ['NGS', 'Consumable'] });
  const b = lib.add({ ...base, buffer: svg('flow cell'), ext: '.svg', title: 'Another name for it' });
  assert.equal(a.reused, false);
  assert.equal(b.reused, true);
  assert.equal(b.asset.id, 'flow-cell');
  assert.equal(lib.list().length, 1);
  assert.deepEqual(a.asset.tags, ['ngs', 'consumable']);
  assert.equal(a.asset.licence.id, 'CC-BY-4.0');
  assert.equal(a.asset.width, 400);
});

test('an id is never reused for different contents', () => {
  const lib = openLibrary(tmp());
  lib.add({ ...base, buffer: svg('one'), ext: '.svg', title: 'Tube' });
  assert.throws(() => lib.add({ ...base, buffer: svg('two'), ext: '.svg', title: 'Tube' }), /already has "tube"/);
});

test('an approval covers one file and one set of claims', () => {
  const lib = openLibrary(tmp());
  const { asset } = lib.add({ ...base, buffer: svg('seq'), ext: '.svg', title: 'Sequencer', claims: ['has one flow cell door'] });
  assert.equal(lib.status(asset), 'draft');
  lib.review('sequencer', 'approved', { by: 'reviewer' });
  assert.equal(lib.status(lib.get('sequencer')), 'approved');
  // the claims change: someone has to look again
  lib.update('sequencer', { claims: ['has two flow cell doors'] });
  assert.equal(lib.status(lib.get('sequencer')), 'stale');
  lib.review('sequencer', 'approved');
  assert.equal(lib.status(lib.get('sequencer')), 'approved');
  // the file is edited by hand: stale again, and it cannot simply be re-approved under the old hash
  fs.writeFileSync(lib.fileOf(lib.get('sequencer')), svg('seq, edited'));
  assert.equal(lib.status(lib.get('sequencer')), 'stale');
  assert.throws(() => lib.review('sequencer', 'approved'), /file changed/);
  lib.review; // (no other way in)
  assert.equal(statusOf({ sha256: 'x', claims: [], review: { state: 'rejected' } }), 'rejected');
});

test('search ranks by how much of the query an asset covers', () => {
  const lib = openLibrary(tmp());
  lib.add({ ...base, buffer: svg('a'), ext: '.svg', title: 'Benchtop sequencer, front view', tags: ['ngs', 'instrument'] });
  lib.add({ ...base, buffer: svg('b'), ext: '.svg', title: 'Flow cell, two lanes', tags: ['ngs', 'consumable'] });
  lib.add({ ...base, buffer: svg('c'), ext: '.svg', title: 'Pipette tip', tags: ['lab'], description: 'used when loading a flow cell' });
  const hits = lib.search('ngs flow cell');
  assert.equal(hits[0].asset.id, 'flow-cell-two-lanes');
  assert.equal(hits[0].coverage, 1);
  assert.ok(hits.find((h) => h.asset.id === 'pipette-tip'));
  assert.equal(lib.search('sequencers', { kind: 'icon' })[0].asset.id, 'benchtop-sequencer-front-view');
  assert.deepEqual(lib.search('centrifuge'), []);
});

test('a derived asset keeps its parent in the library', () => {
  const lib = openLibrary(tmp());
  lib.add({ ...base, kind: 'plate', buffer: svg('plate'), ext: '.svg', title: 'Tube plate' });
  lib.add({ ...base, kind: 'cutout', buffer: svg('cut'), ext: '.svg', title: 'Tube cutout', derived_from: 'tube-plate' });
  assert.throws(() => lib.remove('tube-plate'), /derived from it/);
  assert.throws(() => lib.add({ ...base, buffer: svg('x'), ext: '.svg', title: 'Orphan', derived_from: 'nope' }), /no "nope"/);
});

test('licences: what a film may use, and what it owes', () => {
  assert.equal(normaliseLicence('cc-by-3.0'), 'CC-BY-3.0');
  assert.equal(normaliseLicence('CC BY-SA 4.0'), 'CC-BY-SA-4.0');
  assert.equal(normaliseLicence('cc-0'), 'CC0-1.0');
  assert.equal(normaliseLicence('Public domain'), 'PD');
  assert.equal(normaliseLicence('CC BY-NC-SA 4.0'), 'CC-BY-NC-SA-4.0');
  assert.equal(licenceTerms('CC0').attribution, false);
  assert.equal(licenceTerms('CC BY 4.0').use, 'ok');
  assert.equal(licenceTerms('CC BY-NC 4.0').use, 'restricted');
  assert.equal(licenceTerms('CC BY-SA 4.0').shareAlike, true);
  assert.equal(licenceTerms('').use, 'unknown');
  assert.equal(creditLine({ title: 'Flow cell', source: 'open', licence: { id: 'CC-BY-4.0', author: 'T. Shafee' } }), 'Flow cell by T. Shafee, CC-BY-4.0');
  assert.equal(creditLine({ title: 'x', source: 'open', licence: { id: 'CC0-1.0' } }), null);
  assert.equal(creditLine({ title: 'x', source: 'generated', licence: { id: 'provider-terms' } }), null);
});

test('a rejected asset keeps its record and gives up its place in git', () => {
  const lib = openLibrary(tmp());
  const { asset } = lib.add({ ...base, buffer: svg('ugly'), ext: '.svg', title: 'Ugly tube' });
  lib.review('ugly-tube', 'rejected', { note: 'too ugly' });
  assert.equal(fs.existsSync(lib.fileOf(asset)), false);
  assert.equal(fs.existsSync(path.join(lib.root, '.rejected', 'ugly-tube', 'ugly-tube.svg')), true);
  assert.equal(lib.status(lib.get('ugly-tube')), 'rejected');
  // the same picture turning up again is recognised, not stored a second time
  const again = lib.add({ ...base, buffer: svg('ugly'), ext: '.svg', title: 'A nicer name' });
  assert.equal(again.reused, true);
  assert.equal(again.asset.review.note, 'too ugly');
  // and if it is approved after all, the file comes back
  lib.review('ugly-tube', 'approved');
  assert.equal(fs.existsSync(lib.fileOf(asset)), true);
  assert.equal(lib.status(lib.get('ugly-tube')), 'approved');
});

test('storing a picture in another encoding keeps its id and asks for a new review', () => {
  const lib = openLibrary(tmp());
  lib.add({ kind: 'plate', source: 'generated', licence: { id: 'provider-terms' }, buffer: Buffer.from('png bytes'), ext: '.png', title: 'Hero' });
  lib.review('hero', 'approved');
  const a = lib.reencode('hero', { buffer: Buffer.from('webp bytes'), ext: '.webp', note: 'webp q90' });
  assert.equal(a.file, 'hero.webp');
  assert.equal(lib.status(a), 'draft');
  assert.equal(a.origin.master.ext, '.png');
  assert.equal(fs.readFileSync(path.join(lib.root, '.masters', 'hero.png'), 'utf8'), 'png bytes');
  assert.equal(fs.existsSync(path.join(lib.root, 'assets', 'hero', 'hero.png')), false);
});

test('an original can be put back in place of its re-encoded copy', () => {
  const lib = openLibrary(tmp());
  lib.add({ kind: 'cutout', source: 'generated', licence: { id: 'provider-terms' }, buffer: Buffer.from('png bytes'), ext: '.png', title: 'Cut' });
  lib.reencode('cut', { buffer: Buffer.from('webp bytes'), ext: '.webp', note: 'webp q90' });
  const a = lib.restoreMaster('cut');
  assert.equal(a.file, 'cut.png');
  assert.equal(a.origin.master, undefined);
  assert.equal(fs.readFileSync(lib.fileOf(a), 'utf8'), 'png bytes');
  assert.equal(fs.existsSync(path.join(lib.root, 'assets', 'cut', 'cut.webp')), false);
});
