// A film's asset manifest (assets.yaml, beside the storyboard): which library assets the film uses and
// which scene each one goes to. `want` describes an asset the library does not have yet, so it can be
// looked for, and generated only if nothing suitable exists.
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { z } from 'zod';
import { KINDS, libraryDir } from './library.mjs';

const Want = z.object({
  kind: z.enum(KINDS),
  title: z.string().min(1),
  description: z.string().optional(),
  intent: z.string().optional(),             // what the picture has to get across in the film
  tags: z.array(z.string()).default([]),
  prompt: z.string().optional(),
  model: z.string().optional(),
  aspect: z.string().optional(),
  resolution: z.enum(['1K', '2K', '4K']).optional(),
  seed: z.number().int().optional(),
  from: z.string().optional(),               // the library asset a cutout or a model is made from
  detail: z.union([z.literal(512), z.literal(1024), z.literal(1536)]).optional(),   // model: reconstruction resolution
  vertices: z.number().int().positive().optional(),                                   // model: how many vertices to keep
  refs: z.array(z.string()).default([]),     // library ids shown to the model, so the film's pictures agree
  claims: z.array(z.string()).default([]),   // what the picture asserts; the reviewer checks each one
}).strict();

const Entry = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'ids are lower-case letters, digits and dashes'),
  in: z.array(z.string()).default([]),       // scene folders under scenes/
  as: z.string().optional(),                 // its file name in the scene's assets/ (default: the library's)
  want: Want.optional(),
}).strict();

const Manifest = z.object({
  library: z.string().optional(),
  scenes: z.string().default('scenes'),
  film: z.string().optional(),
  budget: z.number().nonnegative().default(0),   // USD this film may spend on generation
  allow_restricted: z.boolean().default(false),  // non-commercial / no-derivatives assets (not for a product film)
  assets: z.array(Entry).default([]),
}).strict();

export function loadManifest(file, { library } = {}) {
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) throw new Error(`no asset manifest at ${file} — write one (see \`bioshot guide\`)`);
  const parsed = Manifest.safeParse(YAML.parse(fs.readFileSync(abs, 'utf8')) ?? {});
  if (!parsed.success) throw new Error(`${file}: ${parsed.error.issues.map((i) => `${i.path.join('.') || 'manifest'}: ${i.message}`).join('; ')}`);
  const m = parsed.data, dir = path.dirname(abs);
  const dup = m.assets.map((a) => a.id).filter((id, k, all) => all.indexOf(id) !== k);
  if (dup.length) throw new Error(`${file}: "${dup[0]}" is listed twice`);
  const film = m.film ? path.resolve(dir, m.film) : ['film.yaml', 'storyboard.yaml'].map((f) => path.join(dir, f)).find((f) => fs.existsSync(f)) ?? null;
  return {
    ...m, file: abs, dir, film,
    libraryDir: libraryDir(library ?? m.library, dir),
    scenesDir: path.resolve(dir, m.scenes),
    workDir: path.join(dir, '.bioshot'),
  };
}
