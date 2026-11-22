import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { init } from '../src/init.mjs';
import { setup, guide } from '../src/setup.mjs';
import { loadManifest } from '../src/manifest.mjs';
import { openLibrary } from '../src/library.mjs';
import { sync } from '../src/sync.mjs';
import { check } from '../src/gate.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bioshot-init-'));

test('init writes a film that the manifest loader and the kit agree with', () => {
  const dir = path.join(tmp(), 'assay');
  const r = init({ dir, topic: 'How the assay works', stages: ['Sample', 'Capture', '2 colour read'] });
  assert.equal(r.name, 'how-the-assay-works');
  for (const f of ['film.yaml', 'assets.yaml', 'scenes/kit/look.css', 'scenes/kit/film.js', 'scenes/01-sample/scene.html', 'scenes/03-2-colour-read/scene.html', '.gitignore']) assert.ok(r.written.includes(f), f);
  const manifest = loadManifest(path.join(dir, 'assets.yaml'));
  assert.equal(manifest.assets[0].id, 'how-the-assay-works-hero');
  assert.deepEqual(manifest.assets[0].in, ['01-sample']);
  // every scene's root id is its composition id, is registered as a timeline, and is a usable id
  for (const [folder, id] of [['01-sample', 'sample'], ['02-capture', 'capture'], ['03-2-colour-read', 's2colourread']]) {
    const html = fs.readFileSync(path.join(dir, 'scenes', folder, 'scene.html'), 'utf8');
    assert.match(html, new RegExp(`<div id="${id}" class="film" data-composition-id="${id}"`));
    assert.match(html, new RegExp(`__timelines\\['${id}'\\] = tl`));
  }
  assert.match(fs.readFileSync(path.join(dir, 'film.yaml'), 'utf8'), /scenes\/kit\/biokit\.js/);
  assert.throws(() => init({ dir, topic: 'again' }), /already has a film/);
});

test('sync brings the kit into a new film, and check says what the film still lacks', () => {
  const dir = path.join(tmp(), 'assay');
  init({ dir, topic: 'Assay' });
  const manifest = loadManifest(path.join(dir, 'assets.yaml'), { library: path.join(dir, 'lib') });
  const lib = openLibrary(manifest.libraryDir);
  const r = sync({ manifest, lib });
  assert.deepEqual(r.kit.sort(), ['scenes/kit/biokit.css', 'scenes/kit/biokit.js']);
  assert.match(r.problems.join('\n'), /assay-hero: not in the library yet \(bioshot plan/);
  assert.match(fs.readFileSync(path.join(dir, 'scenes', 'kit', 'biokit.js'), 'utf8'), /window\.BioKit/);
  assert.equal(sync({ manifest, lib }).kit.length, 0);   // unchanged the second time
  const c = check({ manifest, lib, drafts: true });
  assert.match(c.errors.join('\n'), /assay-hero: not in the library/);
  assert.match(c.errors.join('\n'), /uses assets\/hero\.webp, which is not there/);
});

test('setup puts the playbook where each agent reads it, and refreshes its own block only', () => {
  const dir = tmp();
  assert.ok(fs.existsSync(setup('claude', dir)[0]));
  assert.match(fs.readFileSync(path.join(dir, '.claude', 'skills', 'bioshot', 'SKILL.md'), 'utf8'), /^---\nname: bioshot/);
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# House rules\n\nBe kind.\n');
  setup('codex', dir); setup('codex', dir);
  const agents = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8');
  assert.match(agents, /^# House rules/);
  assert.equal(agents.match(/bioshot:start/g).length, 1);
  assert.match(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8'), /^\.bioshot\/$/m);
  assert.throws(() => setup('emacs', dir), /usage: bioshot setup/);
});

test('the guide is the skill without its frontmatter', () => {
  const g = guide();
  assert.match(g, /^# Making biology and lab-product films with bioshot/);
  assert.doesNotMatch(g, /^name: bioshot/m);
});
