// The asset library: everything bioshot has ever found, been given or generated, kept so the next
// film reuses it instead of making it again.
//
//   <library>/assets/<id>/asset.yaml     what it is, where it came from, its licence, its review
//   <library>/assets/<id>/<id>.<ext>     the file itself
//
// A generated picture is a source file, not a cache entry: the same prompt does not return the same
// picture twice, so the library is meant to be committed.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { z } from 'zod';
import { sha256, hashOf, slug, tokens, probeSize, today } from './util.mjs';
import { normaliseLicence } from './licence.mjs';

export const KINDS = ['plate', 'cutout', 'model', 'clip', 'structure', 'photo', 'data', 'icon'];
export const SOURCES = ['generated', 'open', 'real', 'structure'];

const Review = z.object({
  state: z.enum(['draft', 'approved', 'rejected']).default('draft'),
  by: z.string().optional(),
  at: z.string().optional(),
  note: z.string().optional(),
  sha256: z.string().optional(),   // the file that was looked at
  claims: z.string().optional(),   // a hash of the claims that were checked
}).default({ state: 'draft' });

export const Asset = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'ids are lower-case letters, digits and dashes'),
  kind: z.enum(KINDS),
  file: z.string(),
  title: z.string().min(1),
  description: z.string().optional(),
  intent: z.string().optional(),   // what the picture has to get across; "close enough" is a rejection
  tags: z.array(z.string()).default([]),
  source: z.enum(SOURCES),
  origin: z.record(z.string(), z.any()).default({}),
  licence: z.object({ id: z.string(), url: z.string().optional(), author: z.string().optional(), attribution: z.string().optional() }),
  claims: z.array(z.string()).default([]),
  derived_from: z.string().optional(),
  sha256: z.string(),
  bytes: z.number(),
  width: z.number().optional(),
  height: z.number().optional(),
  added: z.string(),
  review: Review,
});

// Where the library is: an explicit path, $BIOSHOT_LIBRARY, ./library when there is one, and
// otherwise the library that sits beside this code (a checkout carries its own), so the command
// finds the same library from any folder.
const OWN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'library');
export function libraryDir(explicit, cwd = process.cwd()) {
  if (explicit || process.env.BIOSHOT_LIBRARY) return path.resolve(cwd, explicit || process.env.BIOSHOT_LIBRARY);
  const here = path.resolve(cwd, 'library');
  return fs.existsSync(here) || !fs.existsSync(OWN) ? here : OWN;
}

// approved: someone looked at this exact file and these exact claims.
// stale: it was approved, then the file or the claims changed, so it has to be looked at again.
export function statusOf(asset, fileHash = asset.sha256) {
  const r = asset.review ?? { state: 'draft' };
  if (r.state === 'rejected') return 'rejected';
  if (r.state !== 'approved') return 'draft';
  if (r.sha256 !== fileHash || fileHash !== asset.sha256 || r.claims !== hashOf(asset.claims ?? [])) return 'stale';
  return 'approved';
}

export function openLibrary(dir) {
  const root = path.resolve(dir);
  const assetsDir = path.join(root, 'assets');
  const dirOf = (id) => path.join(assetsDir, id);
  const sidecar = (id) => path.join(dirOf(id), 'asset.yaml');

  function read(id) {
    const f = sidecar(id);
    if (!fs.existsSync(f)) return null;
    const parsed = Asset.safeParse(YAML.parse(fs.readFileSync(f, 'utf8')));
    if (!parsed.success) throw new Error(`${path.relative(process.cwd(), f)}: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
    return parsed.data;
  }
  const write = (asset) => {
    fs.mkdirSync(dirOf(asset.id), { recursive: true });
    fs.writeFileSync(sidecar(asset.id), YAML.stringify(Asset.parse(asset), { lineWidth: 0 }));
    return asset;
  };
  const fileOf = (asset) => path.join(dirOf(asset.id), asset.file);
  // Kept on this machine and out of git: the file of a rejected asset (its record stays in the library,
  // so the same picture is recognised if it turns up again), and the original a WebP was made from.
  const rejectedFile = (asset) => path.join(root, '.rejected', asset.id, asset.file);
  const masterFile = (id, ext) => path.join(root, '.masters', `${id}${ext}`);
  // The file to look at: the asset's own, or the kept copy of a rejected one, or nothing.
  const viewOf = (asset) => [fileOf(asset), rejectedFile(asset)].find((f) => fs.existsSync(f)) ?? null;
  const list = () => (fs.existsSync(assetsDir) ? fs.readdirSync(assetsDir).sort() : []).map((id) => read(id)).filter(Boolean);
  const get = (id) => read(id);

  // The state of an asset as it is on disk now (a file edited by hand makes an approval stale).
  function status(asset) {
    const f = fileOf(asset);
    if (asset.review?.state === 'rejected') return 'rejected';
    if (!fs.existsSync(f)) return 'missing';
    return statusOf(asset, sha256(fs.readFileSync(f)));
  }

  // Adds a file. The same bytes are never stored twice: adding them again returns the asset that
  // already holds them (`reused: true`), whatever id was asked for.
  function add({ file, buffer, ext, id, kind, title, description, intent, tags = [], source, origin = {}, licence, claims = [], derived_from }) {
    const bytes = buffer ?? fs.readFileSync(file);
    const hash = sha256(bytes);
    const same = list().find((a) => a.sha256 === hash);
    if (same) return { asset: same, reused: true };
    const e = (ext ?? path.extname(file ?? '')).toLowerCase();
    if (!e) throw new Error('cannot tell what kind of file this is: give it an extension');
    const assetId = id ? slug(id) : slug(title);
    if (!assetId) throw new Error('an asset needs an id or a title');
    if (read(assetId)) throw new Error(`the library already has "${assetId}" with different contents — pick another id, or remove that one first`);
    if (derived_from && !read(derived_from)) throw new Error(`derived_from: the library has no "${derived_from}"`);
    fs.mkdirSync(dirOf(assetId), { recursive: true });
    const name = `${assetId}${e}`;
    fs.writeFileSync(path.join(dirOf(assetId), name), bytes);
    const asset = Asset.parse({
      id: assetId, kind, file: name, title, description, intent, tags: [...new Set(tags.map((t) => String(t).toLowerCase()))],
      source, origin, licence: { ...licence, id: normaliseLicence(licence?.id) }, claims, derived_from,
      sha256: hash, bytes: bytes.length, ...probeSize(path.join(dirOf(assetId), name)), added: today(), review: { state: 'draft' },
    });
    return { asset: write(asset), reused: false };
  }

  function review(id, state, { by, note } = {}) {
    const asset = read(id);
    if (!asset) throw new Error(`the library has no "${id}"`);
    const f = fileOf(asset), kept = rejectedFile(asset);
    // a rejected asset that is approved after all gets its file back
    if (state !== 'rejected' && !fs.existsSync(f) && fs.existsSync(kept)) fs.renameSync(kept, f);
    if (!fs.existsSync(f)) {
      if (state !== 'rejected') throw new Error(`${id}: its file ${asset.file} is missing`);
      asset.review = { ...asset.review, state, by: by ?? asset.review?.by, at: today(), note: note ?? asset.review?.note };
      return write(asset);
    }
    const hash = sha256(fs.readFileSync(f));
    if (hash !== asset.sha256) throw new Error(`${id}: the file changed since it was added (edited by hand?) — add the new file as its own asset`);
    asset.review = { state, by: by ?? undefined, at: today(), note: note ?? undefined, sha256: hash, claims: hashOf(asset.claims ?? []) };
    write(asset);
    if (state === 'rejected') { fs.mkdirSync(path.dirname(kept), { recursive: true }); fs.renameSync(f, kept); }
    return asset;
  }

  // Stores the same picture in another encoding (PNG to WebP). The one case in which an id's bytes
  // change: it is the same picture, but not the same file, so it has to be reviewed again.
  function reencode(id, { buffer, ext, note }) {
    const asset = read(id);
    if (!asset) throw new Error(`the library has no "${id}"`);
    const old = fileOf(asset);
    if (!fs.existsSync(old)) throw new Error(`${id}: its file ${asset.file} is missing`);
    const oldExt = path.extname(asset.file).toLowerCase(), master = masterFile(id, oldExt);
    fs.mkdirSync(path.dirname(master), { recursive: true });
    fs.renameSync(old, master);
    const name = `${id}${ext}`;
    fs.writeFileSync(path.join(dirOf(id), name), buffer);
    asset.origin = { ...asset.origin, encoded: note, master: { sha256: asset.sha256, bytes: asset.bytes, ext: oldExt } };
    Object.assign(asset, { file: name, sha256: sha256(buffer), bytes: buffer.length, ...probeSize(path.join(dirOf(id), name)), review: { state: 'draft' } });
    return write(asset);
  }
  // Undoes reencode: the original comes back as the asset's file.
  function restoreMaster(id) {
    const asset = read(id), m = asset?.origin?.master;
    if (!m) throw new Error(`${id}: no original is on record`);
    const master = masterFile(id, m.ext);
    if (!fs.existsSync(master)) throw new Error(`${id}: its original is not on this machine`);
    fs.rmSync(fileOf(asset), { force: true });
    const name = `${id}${m.ext}`, buffer = fs.readFileSync(master);
    fs.renameSync(master, path.join(dirOf(id), name));
    const { encoded, master: gone, ...origin } = asset.origin;
    Object.assign(asset, { origin, file: name, sha256: sha256(buffer), bytes: buffer.length, ...probeSize(path.join(dirOf(id), name)), review: { state: 'draft' } });
    return write(asset);
  }
  const keepMaster = (id, ext, buffer) => { const f = masterFile(id, ext); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, buffer); return f; };

  // Changing what a picture is said to show makes its approval stale, on purpose.
  function update(id, patch) {
    const asset = read(id);
    if (!asset) throw new Error(`the library has no "${id}"`);
    for (const k of ['title', 'description', 'intent', 'tags', 'claims', 'licence', 'kind']) if (patch[k] !== undefined) asset[k] = patch[k];
    return write(asset);
  }

  // Ranked by how many of the query's words an asset carries; a word in the id, title or tags
  // counts more than one in the description.
  function search(query, { kind, limit = 12 } = {}) {
    const q = [...new Set(tokens(query))];
    if (!q.length) return [];
    const out = [];
    for (const a of list()) {
      if (kind && a.kind !== kind) continue;
      const strong = new Set([...tokens(a.id), ...tokens(a.title), ...a.tags.flatMap(tokens)]);
      const weak = new Set(tokens(a.description));
      let score = 0, hit = 0;
      for (const t of q) {
        if (strong.has(t)) { score += 2; hit++; } else if ([...strong].some((s) => s.startsWith(t) || t.startsWith(s))) { score += 1; hit++; } else if (weak.has(t)) { score += 0.5; hit++; }
      }
      if (hit) out.push({ asset: a, score, coverage: hit / q.length });
    }
    return out.sort((x, y) => y.coverage - x.coverage || y.score - x.score).slice(0, limit);
  }

  function remove(id) {
    if (!read(id)) throw new Error(`the library has no "${id}"`);
    const users = list().filter((a) => a.derived_from === id).map((a) => a.id);
    if (users.length) throw new Error(`${id}: ${users.join(', ')} ${users.length > 1 ? 'are' : 'is'} derived from it`);
    fs.rmSync(dirOf(id), { recursive: true });
    fs.rmSync(path.join(root, '.rejected', id), { recursive: true, force: true });
  }

  return { root, list, get, add, review, update, search, remove, fileOf, viewOf, status, reencode, restoreMaster, keepMaster };
}
