// Pictures are stored as WebP: a generated 2K PNG is about 5 MB, the same picture as WebP at quality
// 90 is 100 to 300 KB, and a library kept in git never forgets a byte it was given. The PNG a model
// returned (the master) stays on this machine, outside git.
// Only generated pictures are re-encoded. Real material is never altered, so it is stored as it came.
// A picture with transparency stays a PNG: ffmpeg 8 cannot read back a WebP that has an alpha
// channel (dwebp and browsers can), and bioshot has to read every picture it stores.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const WEBP_QUALITY = 90;
const RASTER = ['.png', '.jpg', '.jpeg'];
export const isReencodable = (ext) => RASTER.includes(String(ext).toLowerCase());

let known = null;
export function canWebp() {
  if (known === null) known = /\blibwebp\b/.test(spawnSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' }).stdout ?? '');
  return known;
}

// An opaque PNG or JPEG as WebP. Returns null when the picture has transparency, or when this
// ffmpeg cannot write WebP: the caller then keeps the file as it is.
export function toWebp(buffer, ext, { quality = WEBP_QUALITY } = {}) {
  if (!canWebp()) return null;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bioshot-webp-'));
  try {
    const src = path.join(dir, `in${ext}`), out = path.join(dir, 'out.webp');
    fs.writeFileSync(src, buffer);
    const fmt = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=pix_fmt', '-of', 'csv=p=0', src], { encoding: 'utf8' }).stdout.trim();
    if (!fmt || /a|pal8/.test(fmt.replace(/^gray/, ''))) return null;   // rgba, ya8, gbrap, pal8 (may carry transparency)
    const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-c:v', 'libwebp', '-quality', String(quality), '-compression_level', '6', '-frames:v', '1', out], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`could not encode WebP (ffmpeg: ${(r.stderr || '').trim().split('\n').pop()})`);
    return fs.readFileSync(out);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
