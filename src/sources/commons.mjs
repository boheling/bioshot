// Wikimedia Commons: free media with a licence recorded on every file.
import { normaliseLicence } from '../licence.mjs';

const API = 'https://commons.wikimedia.org/w/api.php';
const strip = (html) => String(html ?? '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

export const name = 'commons';
export const about = 'Wikimedia Commons (photos, diagrams, SVG; licence varies per file)';

export async function search(query, { limit = 6, fetchImpl = fetch, userAgent } = {}) {
  const u = new URL(API);
  u.search = new URLSearchParams({
    action: 'query', format: 'json', generator: 'search', gsrsearch: `${query} filetype:bitmap|drawing`, gsrnamespace: '6', gsrlimit: String(limit),
    prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiextmetadatafilter: 'LicenseShortName|Artist|LicenseUrl', iiurlwidth: '640',
  });
  const r = await fetchImpl(u, { headers: { 'user-agent': userAgent } });
  if (!r.ok) throw new Error(`Wikimedia Commons answered ${r.status}`);
  const pages = Object.values((await r.json()).query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  return pages.filter((p) => p.imageinfo?.[0]).map((p) => {
    const ii = p.imageinfo[0], m = ii.extmetadata ?? {};
    return {
      source: name, ref: p.title, title: p.title.replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '').replace(/_/g, ' '),
      url: String(ii.url).replace(/\?utm_.*$/, ''), page: ii.descriptionurl, thumb: ii.thumburl, mime: ii.mime, width: ii.width, height: ii.height,
      licence: { id: normaliseLicence(m.LicenseShortName?.value), url: m.LicenseUrl?.value, author: strip(m.Artist?.value) || undefined },
    };
  });
}
