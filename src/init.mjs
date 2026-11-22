// `bioshot init <dir>`: the skeleton of a film. A storyboard storyshot can read, an asset manifest
// with one brief to fill in, a look sheet, and one folder per scene.
import fs from 'node:fs';
import path from 'node:path';
import { slug } from './util.mjs';

const sceneId = (name) => { const s = slug(name).replace(/-/g, ''); return /^[a-z]/.test(s) ? s : `s${s}`; };

const look = () => `/* The look sheet: how this film looks, decided once, before any scene is drawn
   (\`storyshot guide\`: "Design the film before the first scene").

   This starter is the plain studio that generated product pictures come in: seamless pale grey, even
   light, ink for words. Make it this film's own, then delete the "storyshot-look" line.

   1. Colour       Measure the ground from your own pictures, so a drawn scene and a photographed
                   one sit in the same room. Keep saturated colour for the one thing the film tracks.
   2. Type         One family for what a scene is about, one plainly different for names on parts.
   3. Composition  Words hang from the left edge; the object takes the right of the frame; a label
                   reaches its part with a straight leader line; the stage strip sits top left.
   4. One bold thing  What a viewer will remember this film looked like.

   storyshot-look: placeholder
*/
:root {
  --ground: #e1e1e3;
  --quiet: #66706e;      /* structure, and the stages the film is not in */
  --lead: #172026;       /* leader lines are ink */
  --face: 'Outfit', sans-serif;
  --face-label: 'IBM Plex Mono', monospace;
  --t-label: 32px;       /* a name on a part, a stage */
  --t-body: 44px;        /* a sentence */
  --t-head: 84px;        /* what the scene is about */
  --t-figure: 190px;     /* a number that is itself the point */
  --edge: 120px;
}
.film { position: absolute; inset: 0; overflow: hidden; background: #e1e1e3; color: var(--ink); font-family: var(--face); }
.film .head { position: absolute; left: var(--edge); font-size: var(--t-head); line-height: 1.05; font-weight: 600; letter-spacing: -0.02em; }
.film .body { position: absolute; left: var(--edge); font-size: var(--t-body); line-height: 1.25; font-weight: 400; }
.film .figure { position: absolute; left: var(--edge); font-size: var(--t-figure); line-height: 0.95; font-weight: 600; letter-spacing: -0.03em; }
`;

// A scene whose ground is a picture from the library: the plate fills the frame, the words hang left.
const plateScene = (id, i) => `<template>
  <style>
    #${id}-head { top: 300px; width: 760px; }
  </style>
  <div id="${id}" class="film" data-composition-id="${id}" data-width="1920" data-height="1080">
    <!-- the picture is the scene's ground; \`bioshot sync\` puts it in this folder's assets/ -->
    <img id="${id}-plate" class="bio-full" src="assets/hero.webp" alt="">
    <div id="${id}-head" class="head">TODO what this scene is about</div>
  </div>
  <script>
    (function () {
      const S = window.__storyshot, B = window.BioKit, R = B.root('${id}');
      const q = (s) => R.querySelector(s);
      B.stages(R, Film.stages, ${i});
      // a label reaches its part: at = the point on the picture, to = where the line meets the words (frame pixels)
      const c = B.callout(R, { at: [1300, 700], to: [1150, 700], text: 'TODO the part' });
      const tl = gsap.timeline({ paused: true });
      // a slow push towards the object for as long as the scene lasts
      B.move(tl, q('#${id}-plate'), { scale: 1, transformOrigin: '68% 62%' }, { scale: 1.05 }, 0, S.duration, 'none');
      B.show(tl, q('#${id}-head'), 0.1, 0.4);
      c.show(tl, S.at(0, 0.6));
      window.__timelines['${id}'] = tl;
    })();
  </script>
</template>
`;

// A scene that states facts, so it is drawn. Swap the slip for the part the facts need
// (fragments, capture, clusters, pileup: see the skill), or add a part to the kit.
const drawnScene = (id, i) => `<template>
  <style>
    #${id}-head { top: 300px; width: 600px; }
  </style>
  <div id="${id}" class="film" data-composition-id="${id}" data-width="1920" data-height="1080">
    <div id="${id}-head" class="head">TODO what this scene is about</div>
  </div>
  <script>
    (function () {
      const S = window.__storyshot, B = window.BioKit, R = B.root('${id}');
      B.stages(R, Film.stages, ${i});
      const slip = B.sheet(R, { left: 860, top: 260, width: 880, title: 'TODO a title', rows: [['TODO', 'a fact'], ['TODO', 'another']] });
      const tl = gsap.timeline({ paused: true });
      B.show(tl, R.querySelector('#${id}-head'), 0.1, 0.4);
      tl.fromTo(slip.box, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }, S.at(0));
      slip.row(tl, 0, S.at(0, 0.8));
      slip.row(tl, 1, S.at(0, 1.4));
      window.__timelines['${id}'] = tl;
    })();
  </script>
</template>
`;

export function init({ dir, topic, stages }) {
  if (!dir) throw new Error('where? e.g. bioshot init films/my-assay --topic "How the assay works"');
  const root = path.resolve(dir);
  if (fs.existsSync(path.join(root, 'film.yaml')) || fs.existsSync(path.join(root, 'assets.yaml'))) throw new Error(`${dir} already has a film in it`);
  const title = topic || path.basename(root).replace(/[-_]+/g, ' ');
  const names = (stages?.length ? stages : ['Sample', 'Method', 'Result']).map((s) => s.trim()).filter(Boolean);
  const ids = names.map(sceneId);
  if (new Set(ids).size !== ids.length) throw new Error('two stages would get the same scene id: give them different names');
  const name = slug(title) || 'film';
  const folders = names.map((n, i) => `${String(i + 1).padStart(2, '0')}-${slug(n)}`);
  const written = [];
  const put = (rel, text) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); written.push(rel); };

  put('film.yaml', `# ${title}
# TODO who it is for, and what they should understand at the end.
# What is said, its source, and where the film simplifies:
#   - TODO
name: ${name}
purpose: explainer
out: ${name}.mp4
voice: { provider: kokoro }
subtitles: true
ground: light
theme: { accent: "#0f5c63", ink: "#172026", paper: "#e1e1e3", font: Outfit }
scenes: { css: [scenes/kit/biokit.css, scenes/kit/look.css], js: [scenes/kit/biokit.js, scenes/kit/film.js] }

steps:
${names.map((n, i) => `  - scene: { file: scenes/${folders[i]}/scene.html, title: ${JSON.stringify(n)} }
    say: >-
      TODO what the voice says while this is on screen.
`).join('\n')}
  # \`bioshot sync\` writes the credits scene once the film has pictures. Then end the film on it:
  # - scene: { file: scenes/credits/scene.html, title: Credits, tail: 2.0 }
  #   say: TODO one line about where the pictures came from.
`);
  put('assets.yaml', `# What this film is made of. One entry per picture of a THING (an instrument, a tube, a rack).
# What states a fact (a molecule, a mechanism, a count) is not here: the scene draws it.
# \`bioshot plan\` says what is missing, \`bioshot gen --go\` makes it, a person reviews it,
# \`bioshot sync\` puts it in the scenes, \`bioshot check\` holds the film until all are reviewed.
budget: 2            # USD this film may spend on generation
assets:
  - id: ${name}-hero
    in: [${folders[0]}]
    as: hero.webp
    want:
      kind: plate
      title: TODO what it is, studio, room for words on the left
      intent: TODO one sentence - what a viewer has to understand from this picture.
      tags: [TODO]
      aspect: "16:9"
      prompt: >-
        Studio product photograph of TODO. The object sits in the right third of the frame; the
        left two thirds are empty background. Seamless pale grey background, soft even lighting,
        a soft shadow. No text, no labels, no logos, no hands, no other objects. A fictional,
        unbranded design that does not copy any existing product.
      claims:
        - TODO something that can be checked by looking
        - resembles no real product
        - no lettering anywhere
`);
  put('scenes/kit/look.css', look());
  put('scenes/kit/film.js', `/* What every scene of this film shares: the stages along the top. */\nwindow.Film = { stages: ${JSON.stringify(names)} };\n`);
  names.forEach((n, i) => put(`scenes/${folders[i]}/scene.html`, i === 0 ? plateScene(ids[i], i) : drawnScene(ids[i], i)));
  const gi = path.join(root, '.gitignore');
  if (!fs.existsSync(gi)) put('.gitignore', '.env\n.storyshot/\n.bioshot/\n# filled by `bioshot sync`\nscenes/*/assets/\nscenes/kit/biokit.js\nscenes/kit/biokit.css\nscenes/kit/bio3.js\n# rendered\n*.mp4\n*.srt\n*.chapters.txt\n');
  return { root, written, name };
}
