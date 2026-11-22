---
name: bioshot
description: Make a film about biology, a lab method, an assay or a lab product (an instrument, a kit, a consumable) with bioshot and storyshot. Use when the user asks for a product video, a workflow or mechanism explainer, or a method walkthrough whose subject is a lab, and the film needs pictures of real-looking things - instruments, tubes, flow cells, cells, molecules, data. Read this before looking for, generating or drawing any picture for such a film.
---

# Making biology and lab-product films with bioshot

bioshot looks after the pictures; storyshot makes the film. A storyshot explainer draws its subject
with lines and boxes. A lab film cannot: a viewer who works at a bench knows what a sequencer, a tube
on a magnet or a flow cell looks like, and a box labelled "sequencer" tells them the film was made by
someone who does not.

Read storyshot's skill first (`storyshot guide`). Everything there about the brief, the look sheet,
narration, scenes, cues, previews and rendering still applies. This page is what changes when the
subject is a lab.

## The one rule

Every picture in the film is one of three things, and each has one source.

| It shows | Examples | Where it comes from |
|---|---|---|
| What something looks like | an instrument, a tube, a rack, a flow cell, a bench | generated to a brief, reviewed by a person |
| A fact | a molecule, a mechanism, a count, a sequence, a result | drawn by the scene with BioKit, or rendered from structure data |
| Evidence | a micrograph, a gel, a plot, a screenshot | supplied by the user; cropped and labelled, never altered |

Never ask an image model for a fact. It will draw a convincing mitochondrion with three membranes, a
flow cell with a port too many, a helix that turns the wrong way. Never run real data through a model.

**A picture that nearly fits is worse than none.** Do not fill a slot with an open-library icon, a
leftover from another film, or a generation that is "close". If it does not say exactly what its
brief says, it is not in the film.

## Tools

`bioshot` is on the PATH, or run `node <bioshot>/bin/bioshot.mjs`. `bioshot doctor` says what is missing.

| Command | What it does |
|---|---|
| `bioshot init <dir> --topic "…"` | a film skeleton: storyboard, asset manifest, look sheet, scene folders |
| `bioshot find <words>` | is it in the library already? (`--open` also searches Bioicons and Wikimedia Commons) |
| `bioshot plan` | what the film still needs, what the library could supply, what generating the rest costs |
| `bioshot gen --go [id…]` | make what is missing (needs `FAL_KEY` in `.env`; `--from-drafts` to derive from an unreviewed picture) |
| `bioshot add <file\|url> …` | bring the user's own material, or a found file, into the library with its licence |
| `bioshot review [--all] --open` | a page of every asset with its intent, origin and claims, for the person to look at |
| `bioshot approve <id…>` / `reject <id> --note "…"` | record the person's decision |
| `bioshot sync` | put the film's assets and BioKit into its scene folders |
| `bioshot check [--drafts]` | is every picture in the library, reviewed, licensed, in place and unchanged |

Then storyshot: `storyshot cues film.yaml`, `storyshot scene film.yaml --step N`, `storyshot render film.yaml`.

## The loop

1. **Brief.** As in storyshot, plus three questions that decide the pictures: is this about a named
   product or brand-neutral; what real material exists (photos, CAD, data, screenshots); who signs
   off on scientific accuracy. A brand-neutral film uses generic objects that resemble no real product.
2. **Outline, then sort the pictures.** Write the narration first. For every scene list what is on
   screen and put each item in one of the three rows of the table above.
3. **Write the briefs** in `assets.yaml` (below). One entry per look.
4. **`bioshot plan`, then `bioshot gen --go`.** The library is asked first; what an earlier film made
   is reused.
5. **Look at every result yourself** against its intent and each claim before anyone else sees it.
   Open the image. Count what the claims count. If it fails, reject it with the reason and write a
   better brief under a new id.
6. **`bioshot review --open`, and ask the person.** Only a person approves. When they tell you which
   pass and which fail, run `approve` and `reject` with their words as the note. Never approve on
   your own judgement, and never treat "looks good" about the film as approval of a picture.
7. **`bioshot sync`, write the scenes**, preview each with `storyshot scene`. While pictures are
   unreviewed they carry a DRAFT tag; `bioshot check --drafts` tolerates that.
8. **After approval:** `bioshot sync`, `bioshot check`, `storyshot render`. Look at frames from every
   scene before you say it is done.

## Writing a brief

```yaml
- id: sample-tube-studio
  in: [01-sample, 08-close]          # scene folders that use it
  as: tube.webp                      # its name in each scene's assets/
  want:
    kind: plate                      # plate | cutout | model
    title: Sample tube in a rack, studio, room for words on the left
    intent: The starting material as someone sees it at the bench - one small tube with a little clear liquid in it.
    tags: [ngs, sample, tube, bench]
    aspect: "16:9"
    refs: [sequencer-generic-hero]   # library pictures the model is shown, so the film's pictures agree
    prompt: >-
      Studio product photograph in the same style, lighting and seamless pale grey background as the
      reference image, but of a different subject: one clear 1.5 mL microcentrifuge tube …
    claims:
      - a 1.5 mL snap-cap tube with a conical bottom
      - no lettering anywhere
```

- **`intent`** is one sentence: what a viewer has to understand from this picture. The reviewer
  judges the picture against it.
- **`claims`** are statements someone can check by looking: counts ("two separate lanes"), parts,
  and, for a generic object, always "resembles no real product" and "no lettering anywhere".
- An opaque generated picture is stored as `.webp`; a cutout keeps its transparency as `.png`. Name
  it accordingly in `as:`.

What has worked in prompts:

- **A studio photograph of one subject.** "Studio product photograph of …, seamless pale grey
  background, soft even lighting, a soft shadow. No text, no labels, no logos, no hands, no other objects."
- **Forbid lettering every time.** Models write gibberish on screens, graduations and labels. The
  scene adds every word.
- **Compose for the film.** "The object sits in the right third of the frame; the left two thirds are
  empty background." That empty area is where the scene's words go.
- **One studio for the whole film.** Make the first picture, then list it under `refs:` for every
  other and say "in the same style, lighting and background as the reference image, of a different
  subject". The pictures then share a background, a light and often a camera.
- **Two pictures from one camera are a move.** "The same instrument as in the reference image, the
  same view and background, now with its front door open." Cross-fade the pair and the door opens.
  This is cheaper and more reliable than a 3D model.
- **Say what is generic.** "A fictional, unbranded design that does not copy any existing product."

What a model invents, and what to do about it:

- **Small parts.** Whatever sits inside the open door, the number of ports, the shape of a clip.
  Check them against the claims. Either the claim holds, or the scene labels the part in neutral
  words ("flow cell stage"), or the picture is rejected.
- **3D models from one picture** (`kind: model`, made `from:` a cutout). The far side is a guess and
  details drift: a flow cell gained a third port. Use one only when a shot needs the camera to travel
  round an object, keep the camera on the photographed side, and review it with the four-view
  preview on the review page.
- **Video from a picture.** Only for ambient motion. Never to show a procedure or a mechanism: it
  will look right and be wrong.

A picture costs about $0.15, a 3D model about $0.30. `bioshot plan` prints the estimate and the
manifest's `budget:` is a hard stop.

## The user's own material

Photographs, CAD renders, micrographs, plots and screenshots come in with
`bioshot add <file> --kind photo|data --title "…" --licence own`. They are stored as they are. bioshot
will not upload them to a generation service as a reference unless the asset's `origin.may_upload` is
set to true, and you set that only when the user says so. Evidence is cropped and labelled by the
scene and otherwise left alone.

## Building the scenes

One scene, one folder: `scenes/03-capture/scene.html` and its own `assets/`, which `bioshot sync`
fills. Never put a file in `assets/` by hand: `bioshot check` will say nobody reviewed it.

- **A plate is the scene's ground.** `<img class="bio-full" src="assets/tube.webp">` fills the frame
  and the picture's studio background becomes the scene's. Words hang from the left edge over the
  empty part of the picture.
- **Drawn scenes share that ground.** Measure the plates' background
  (`ffmpeg -v error -i plate.webp -vf "crop=iw*0.3:ih*0.5:iw*0.05:ih*0.25,scale=1:1:flags=area,format=rgb24" -f rawvideo - | xxd -p`)
  and use it as the look sheet's ground, so a drawn scene and a photographed one sit in one room.
- **Colour is for what the film tracks.** In the sequencing film the only saturated colours are the
  four dyes, and they mean "a base was read" wherever they appear. Leader lines and labels are ink.
- **The stage strip is on every scene.** `B.stages(R, Film.stages, i)` names the workflow's stages
  along the top with the current one in ink.
- **A label reaches its part.** `B.callout(R, { at: [x, y], to: [x2, y2], text, side })` in frame
  pixels. If the picture under it moves, stop the move before the label lands, or scale about the
  labelled point so it stays put.
- **Numbers on screen come from the drawing.** `pileup(...).counts` is counted from the reads that
  were drawn; print that, not a number typed beside it.
- **Find things the way the kit does.** `B.root('<scene id>')` for the root (not `getElementById`),
  and `S.at('a phrase from the narration')` for a cue, so the scene survives a reworded line.

BioKit, drawn parts:

| Part | Draws |
|---|---|
| `fragments` | one long double strand, cut into pieces, an adapter on both ends of each |
| `capture` | a field of pieces; probes settle on the wanted ones, beads take the probes, the rest is washed away |
| `clusters`, `legend`, `readout` | a flow cell surface where every cluster takes one of four colours per cycle; the legend; the read building up |
| `pileup` | reads against a reference, one column where some disagree, and one lone mistake |
| `sheet` | a printed slip of label and value rows |
| `stages`, `callout`, `move`, `show` | the strip, a leader-line label, a push on a plate, a fade |

When a film needs a fact BioKit cannot draw, add the part to `kit/biokit.js` (outside the bioshot
repository: to a kit file of your own, listed in the storyboard's `scenes: { js: [...] }`) rather than
drawing it inside one scene: the next film will need it too. A part takes data, places everything with
`fromTo` on the scene's paused timeline, and hands back the points its labels attach to.

The order that lab films share is a dive through scales and back: the instrument, the consumable,
its surface, the molecule, the signal, the data, and the instrument or the sample again.

## Saying it

storyshot's narration rules hold. For a lab film also:

- **Say what a term is the moment it is used.** "Each piece gets an adapter on both ends, a handle
  the sequencer can hold."
- **Write down every simplification.** The storyboard's header comment lists what is claimed, its
  source, and where the film simplifies ("four colours is the classic scheme; some instruments use
  two"; "the picture shows 5 of 10 reads, far fewer than a real test, so that it can be counted").
- **Name nothing you cannot stand behind.** A report in a film is "an example", and its gene is "one
  of the genes on the panel", not an invented result that looks real.
- **End on a thought, back where the film began.** The closing scene returns to the first picture
  and says what the method comes down to. A recap is not an ending.

## What the film owes

- `bioshot sync` writes `scenes/credits/scene.html` and `credits.txt`: the credit each found asset is
  owed, and a line that says the illustrations were generated and whether a person has reviewed
  them. Make it the storyboard's last step.
- A brand-neutral film names no maker and copies no product. A film about the user's product uses
  the user's own material for the product itself.

## Before you say it is done

- `bioshot check` passes without `--drafts`, and `storyshot check` has no errors.
- You have looked at a frame from every scene of the rendered film, not only the previews.
- Every on-screen number matches what is drawn; every label points at the part it names.
- You have told the person which parts of which pictures the model made up, and what the film
  simplifies.
- You have said what you could not check: you cannot hear the narration or the music.
