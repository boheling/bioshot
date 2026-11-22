// Getting an asset: the library first, and otherwise it is made to its brief.
// Open sources are searched only when asked. A found picture that nearly fits is worse than none:
// it goes in a film only when it says exactly what the brief says.
import fs from 'node:fs';
import path from 'node:path';
import { searchOpen, download } from './sources/index.mjs';
import { today, sha256 } from './util.mjs';
import { toWebp, isReencodable, WEBP_QUALITY } from './encode.mjs';

// A library hit that covers the whole query is a reason not to make another one.
const COVERS = 1;
// Kinds that are made from another asset rather than from a prompt.
const DERIVED = new Set(['cutout', 'model']);

export async function find({ lib, query, kind, open = false, limit = 6, cacheDir, fetchImpl }) {
  const library = lib.search(query, { kind, limit });
  const found = open ? await searchOpen(query, { limit, cacheDir, fetchImpl }) : { hits: [], errors: [] };
  return { library, open: found.hits, errors: found.errors };
}

// Brings a local file or a URL into the library. Something found on the open web needs its licence
// written down here, because nobody will remember it later.
export async function addFrom({ lib, from, meta, fetchImpl }) {
  const isUrl = /^https?:\/\//i.test(from);
  if (isUrl) {
    if (!meta.licence?.id) throw new Error('a downloaded asset needs --licence (what its page says: CC0, CC BY 4.0, …)');
    const d = await download(from, { fetchImpl });
    if (!d.ext) throw new Error(`cannot tell the file type of ${from}`);
    return lib.add({ ...meta, buffer: d.buffer, ext: d.ext, source: meta.source ?? 'open', origin: { url: from, page: meta.page, retrieved: today(), ...(meta.origin ?? {}) } });
  }
  if (!fs.existsSync(from)) throw new Error(`no file at ${from}`);
  if (!meta.licence?.id) throw new Error('say whose it is with --licence (use "own" for your own material)');
  return lib.add({ ...meta, file: from, source: meta.source ?? 'real', origin: { file: path.basename(from), ...(meta.origin ?? {}) } });
}

// What each manifest entry needs: nothing (the library has it), or a search and maybe a generation.
export function plan({ manifest, lib, provider }) {
  return manifest.assets.map((e) => {
    const asset = lib.get(e.id);
    if (asset) return { id: e.id, state: 'have', asset, status: lib.status(asset) };
    if (!e.want) return { id: e.id, state: 'missing', problem: 'not in the library, and the manifest does not say what is wanted (`want:`)' };
    const q = [e.want.title, ...e.want.tags].join(' ');
    const candidates = lib.search(q, { kind: e.want.kind, limit: 4 });
    return {
      id: e.id, state: 'missing', want: e.want, query: q, candidates,
      reuse: candidates.filter((c) => c.coverage >= COVERS),
      makeable: DERIVED.has(e.want.kind) ? !!e.want.from : !!e.want.prompt,
      estimate: provider ? provider.estimate(e.want) : null,
    };
  });
}

const spendFile = (manifest) => path.join(manifest.workDir, 'spend.json');
export function spent(manifest) {
  const f = spendFile(manifest);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : { usd: 0, items: [] };
}

// Generates the entries that are still missing. It refuses when the library already has something
// that fits (reuse it, or pass `anyway`), and when the film's budget would be passed.
export async function generate({ manifest, lib, ids, provider, key, anyway = false, fromDrafts = false, considered = {}, log = () => {} }) {
  const rows = plan({ manifest, lib, provider }).filter((r) => r.state === 'missing' && (!ids?.length || ids.includes(r.id)));
  const done = [], refused = [];
  const ledger = spent(manifest);
  for (const r of rows) {
    if (!r.makeable) { refused.push({ id: r.id, why: r.problem ?? (DERIVED.has(r.want.kind) ? `a ${r.want.kind} is made from another asset: say which with \`want.from\`` : 'no `want.prompt` to generate from') }); continue; }
    if (r.reuse.length && !anyway) { refused.push({ id: r.id, why: `the library already has ${r.reuse.map((c) => `"${c.asset.id}"`).join(', ')} for "${r.query}" — use it, or pass --anyway` }); continue; }
    const cost = r.estimate ?? 0;
    if (ledger.usd + cost > manifest.budget) { refused.push({ id: r.id, why: `over budget: $${ledger.usd.toFixed(2)} spent + $${cost.toFixed(2)} > $${manifest.budget.toFixed(2)} (raise \`budget:\` in the manifest)` }); continue; }
    const refs = [];
    for (const refId of r.want.refs) {
      const a = lib.get(refId);
      if (!a) throw new Error(`${r.id}: reference "${refId}" is not in the library`);
      if (a.source === 'real' && a.origin?.may_upload !== true) throw new Error(`${r.id}: reference "${refId}" is real material and may not be uploaded (set origin.may_upload: true in its asset.yaml if it may)`);
      refs.push(lib.fileOf(a));
    }
    let parent = null;
    if (r.want.from) {
      parent = lib.get(r.want.from);
      if (!parent) { refused.push({ id: r.id, why: `it is made from "${r.want.from}", which is not in the library yet` }); continue; }
      if (parent.source === 'real' && parent.origin?.may_upload !== true) throw new Error(`${r.id}: "${r.want.from}" is real material and may not be uploaded (set origin.may_upload: true in its asset.yaml if it may)`);
      const ps = lib.status(parent);
      if (ps !== 'approved' && !fromDrafts) { refused.push({ id: r.id, why: `"${r.want.from}" is ${ps}: review it before paying to derive from it (or pass --from-drafts)` }); continue; }
    }
    log(`making ${r.id} with ${provider.modelFor(r.want)} (about $${cost.toFixed(2)})`);
    const out = await provider.make({ key, want: r.want, refs, from: parent ? lib.fileOf(parent) : undefined });
    // a generated picture is stored as WebP; what the model returned stays here, outside git
    if (isReencodable(out.ext)) {
      const webp = toWebp(out.buffer, out.ext);
      if (webp) {
        lib.keepMaster(r.id, out.ext, out.buffer);
        out.origin = { ...out.origin, encoded: `webp q${WEBP_QUALITY}`, master: { sha256: sha256(out.buffer), bytes: out.buffer.length, ext: out.ext } };
        out.buffer = webp; out.ext = '.webp';
      }
    }
    // something made from an openly licensed picture still owes that picture's credit
    const inherits = parent && parent.source !== 'generated';
    const { asset } = lib.add({
      id: r.id, kind: r.want.kind, title: r.want.title, description: r.want.description, intent: r.want.intent, tags: r.want.tags, claims: r.want.claims,
      buffer: out.buffer, ext: out.ext, source: 'generated', licence: inherits ? parent.licence : { id: 'provider-terms' }, derived_from: parent?.id,
      origin: { ...out.origin, generated: today(), considered: considered[r.id] ?? { library: r.candidates.map((c) => c.asset.id) } },
    });
    ledger.usd = +(ledger.usd + (out.origin.cost_usd ?? cost)).toFixed(3);
    ledger.items.push({ id: asset.id, usd: out.origin.cost_usd ?? cost, model: out.origin.model, at: today() });
    fs.mkdirSync(manifest.workDir, { recursive: true });
    fs.writeFileSync(spendFile(manifest), JSON.stringify(ledger, null, 2));
    done.push(asset);
  }
  return { done, refused, spent: ledger.usd };
}
