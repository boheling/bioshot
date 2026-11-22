// Open sources bioshot can search by itself. Others have no search API and are looked at by hand, then
// brought in with `bioshot add <url> --licence …`:
//   NIH BioArt Source   https://bioart.niaid.nih.gov      (public domain / CC BY per entry)
//   Servier Medical Art https://smart.servier.com         (CC BY 4.0)
//   NIH 3D              https://3d.nih.gov                (models; licence per entry)
import * as commons from './commons.mjs';
import * as bioicons from './bioicons.mjs';
import { EXT_OF_MIME } from '../util.mjs';

export const OPEN = { bioicons, commons };
// A client name with nothing about the person running it.
export const USER_AGENT = 'bioshot/0.1 (open asset library tool)';

export async function searchOpen(query, { sources = Object.keys(OPEN), limit = 6, fetchImpl, cacheDir } = {}) {
  const runs = await Promise.allSettled(sources.map((s) => OPEN[s].search(query, { limit, fetchImpl, cacheDir, userAgent: USER_AGENT })));
  const hits = [], errors = [];
  runs.forEach((r, k) => (r.status === 'fulfilled' ? hits.push(...r.value) : errors.push(`${sources[k]}: ${r.reason.message}`)));
  return { hits, errors };
}

export async function download(url, { fetchImpl = fetch } = {}) {
  let r = await fetchImpl(url, { headers: { 'user-agent': USER_AGENT } });
  // a busy server says so: wait as long as it asks (at most 20 s) and try once more
  for (let tries = 0; r.status === 429 && tries < 2; tries++) {
    const wait = Math.min(20, +(r.headers.get('retry-after') ?? 0) || 5 * (tries + 1));
    await new Promise((done) => setTimeout(done, wait * 1000));
    r = await fetchImpl(url, { headers: { 'user-agent': USER_AGENT } });
  }
  if (!r.ok) throw new Error(`${url} answered ${r.status}${r.status === 429 ? ' (too many requests: try again in a minute)' : ''}`);
  const mime = (r.headers.get('content-type') ?? '').split(';')[0].trim();
  const fromUrl = (new URL(url).pathname.match(/\.[a-z0-9]{2,5}$/i) ?? [''])[0].toLowerCase();
  return { buffer: Buffer.from(await r.arrayBuffer()), ext: fromUrl || EXT_OF_MIME[mime] || '', mime };
}
