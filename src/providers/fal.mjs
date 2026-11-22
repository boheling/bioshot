// fal.ai: the first generation provider. Model ids and prices live here and nowhere else.
// Prices were read from fal's model pages on 2026-11-21 and are only used for the estimate printed
// before a run; the bill is what counts.
import fs from 'node:fs';
import path from 'node:path';
import { EXT_OF_MIME } from '../util.mjs';

export const name = 'fal';
export const DEFAULTS = { plate: 'fal-ai/nano-banana-pro', cutout: 'fal-ai/birefnet/v2', model: 'fal-ai/trellis-2' };
const PRICE = {
  'fal-ai/nano-banana-pro': (w) => 0.15 * (w.resolution === '4K' ? 2 : 1),
  'fal-ai/nano-banana-pro/edit': (w) => 0.15 * (w.resolution === '4K' ? 2 : 1),
  'fal-ai/flux-2': (w) => 0.012 * ({ '1K': 1, '2K': 4, '4K': 16 }[w.resolution ?? '2K']),
  'fal-ai/birefnet/v2': () => 0.01,                                   // billed by compute second; a cent is generous
  'fal-ai/trellis-2': (w) => ({ 512: 0.25, 1024: 0.3, 1536: 0.35 }[w.detail ?? 1024] ?? 0.3),
};

export const modelFor = (want) => want.model ?? DEFAULTS[want.kind] ?? DEFAULTS.plate;

// What one asset will cost, in USD, or null when the model's price is not known here.
export function estimate(want) {
  const p = PRICE[modelFor(want)];
  return p ? +p(want).toFixed(3) : null;
}

async function client(key) {
  if (!key) throw new Error('no FAL_KEY: put FAL_KEY=… in a .env file beside the storyboard or at the repo root (it is git-ignored), or export it');
  const { fal } = await import('@fal-ai/client');
  fal.config({ credentials: key });
  return fal;
}
const upload = (fal, f) => fal.storage.upload(new File([fs.readFileSync(f)], path.basename(f)));
async function fetchFile(file, what) {
  if (!file?.url) throw new Error(`${what} returned no file`);
  const res = await fetch(file.url);
  if (!res.ok) throw new Error(`could not download the result of ${what} (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

// One picture. `refs` are local files shown to the model so a film's pictures agree with each other.
async function image({ fal, want, refs }) {
  const format = 'png';
  const input = { prompt: want.prompt, aspect_ratio: want.aspect ?? '16:9', resolution: want.resolution ?? '2K', output_format: format, num_images: 1, ...(want.seed != null ? { seed: want.seed } : {}) };
  let endpoint = modelFor(want);
  if (refs.length) {
    input.image_urls = [];
    for (const f of refs) input.image_urls.push(await upload(fal, f));
    if (!/\/edit$/.test(endpoint)) endpoint += '/edit';
  }
  const r = await fal.subscribe(endpoint, { input, logs: false });
  const img = r.data?.images?.[0];
  return { buffer: await fetchFile(img, endpoint), ext: EXT_OF_MIME[img.content_type] ?? '.png', endpoint, request: r.requestId, extra: { prompt: want.prompt, aspect: input.aspect_ratio, resolution: input.resolution, refs: refs.map((f) => path.basename(f)) } };
}

// The same picture with its background taken away.
async function cutout({ fal, want, from }) {
  const endpoint = modelFor(want);
  const r = await fal.subscribe(endpoint, { input: { image_url: await upload(fal, from), model: 'General Use (Heavy)', operating_resolution: '2048x2048', refine_foreground: true, output_format: 'png' }, logs: false });
  return { buffer: await fetchFile(r.data?.image, endpoint), ext: '.png', endpoint, request: r.requestId, extra: {} };
}

// A textured mesh from one picture of one object. What the picture does not show is invented:
// the far side of the object is a guess.
async function model({ fal, want, from }) {
  const endpoint = modelFor(want);
  const input = { image_url: await upload(fal, from), resolution: String(want.detail ?? 1024), decimation_target: want.vertices ?? 150000, texture_size: '2048', ...(want.seed != null ? { seed: want.seed } : {}) };
  const r = await fal.subscribe(endpoint, { input, logs: false });
  return { buffer: await fetchFile(r.data?.model_glb, endpoint), ext: '.glb', endpoint, request: r.requestId, extra: { resolution: input.resolution, vertices: input.decimation_target } };
}

// Makes what a manifest entry wants. `from` is the library file a cutout or a model is made from;
// both it and `refs` are uploaded to fal, which is why the caller decides what may leave this machine.
export async function make({ key, want, refs = [], from }) {
  const fal = await client(key);
  const fn = want.kind === 'cutout' ? cutout : want.kind === 'model' ? model : image;
  const out = await fn({ fal, want, refs, from });
  return { buffer: out.buffer, ext: out.ext, origin: { provider: name, model: out.endpoint, request: out.request ?? null, seed: want.seed ?? null, cost_usd: estimate({ ...want, model: out.endpoint }), ...out.extra } };
}
