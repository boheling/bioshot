// What a licence lets a film do with an asset. The library records the licence of everything it holds;
// `check` reads these terms, and the credits are written from them.

const NAMES = [
  [/^(cc[\s-]?0|cc0[\s-]1\.0|cc[\s-]zero)$/i, 'CC0-1.0'],
  [/^(pd|pdm|public[\s-]domain.*|no restrictions)$/i, 'PD'],
  [/^cc[\s-]by[\s-]sa[\s-]?(\d\.\d)?.*$/i, (m) => `CC-BY-SA-${m[1] ?? '4.0'}`],
  [/^cc[\s-]by[\s-]nc[\s-]sa[\s-]?(\d\.\d)?.*$/i, (m) => `CC-BY-NC-SA-${m[1] ?? '4.0'}`],
  [/^cc[\s-]by[\s-]nc[\s-]nd[\s-]?(\d\.\d)?.*$/i, (m) => `CC-BY-NC-ND-${m[1] ?? '4.0'}`],
  [/^cc[\s-]by[\s-]nc[\s-]?(\d\.\d)?.*$/i, (m) => `CC-BY-NC-${m[1] ?? '4.0'}`],
  [/^cc[\s-]by[\s-]nd[\s-]?(\d\.\d)?.*$/i, (m) => `CC-BY-ND-${m[1] ?? '4.0'}`],
  [/^cc[\s-]by[\s-]?(\d\.\d)?.*$/i, (m) => `CC-BY-${m[1] ?? '4.0'}`],
  [/^mit$/i, 'MIT'], [/^bsd.*$/i, 'BSD'], [/^apache.*$/i, 'Apache-2.0'],
  [/^(own|mine|proprietary|all rights reserved by owner)$/i, 'own'],
  [/^(provider[\s-]terms|generated)$/i, 'provider-terms'],
];

// "CC BY 4.0", "cc-by-4.0", "CC-BY-SA-3.0 IGO", "Public domain" … to one spelling. Unknown strings pass through.
export function normaliseLicence(s) {
  const raw = String(s ?? '').trim();
  if (!raw) return 'unknown';
  for (const [re, out] of NAMES) {
    const m = raw.match(re);
    if (m) return typeof out === 'function' ? out(m) : out;
  }
  return raw;
}

// use: 'ok' (a film may include it), 'restricted' (non-commercial or no-derivatives: a product film
// is commercial and a film is a derivative), 'unknown' (nobody recorded one: find out before using it).
export function licenceTerms(id) {
  const l = normaliseLicence(id);
  if (l === 'CC0-1.0' || l === 'PD') return { id: l, use: 'ok', attribution: false, shareAlike: false };
  if (l === 'own') return { id: l, use: 'ok', attribution: false, shareAlike: false };
  if (l === 'provider-terms') return { id: l, use: 'ok', attribution: false, shareAlike: false, note: 'generated: the provider\'s terms apply' };
  if (/-NC|-ND/.test(l)) return { id: l, use: 'restricted', attribution: true, shareAlike: /-SA/.test(l), note: /-NC/.test(l) ? 'non-commercial only' : 'no derivatives' };
  if (/^CC-BY-SA/.test(l)) return { id: l, use: 'ok', attribution: true, shareAlike: true, note: 'share-alike: a film that adapts it may have to carry the same licence' };
  if (/^CC-BY/.test(l)) return { id: l, use: 'ok', attribution: true, shareAlike: false };
  if (['MIT', 'BSD', 'Apache-2.0'].includes(l)) return { id: l, use: 'ok', attribution: true, shareAlike: false };
  return { id: l, use: 'unknown', attribution: true, shareAlike: false, note: 'unrecognised licence' };
}

// The line a film owes for one asset, or null when it owes none.
export function creditLine(asset) {
  const t = licenceTerms(asset.licence?.id);
  if (!t.attribution) return null;
  if (asset.licence?.attribution) return asset.licence.attribution;
  const who = asset.licence?.author ? ` by ${asset.licence.author}` : '';
  return `${asset.title}${who}, ${t.id}`;
}
