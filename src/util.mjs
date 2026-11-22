import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
export const hashOf = (value) => sha256(Buffer.from(JSON.stringify(value)));

export const slug = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);

// Words to match on: lower-case, at least two characters, CJK kept whole.
export const tokens = (s) => String(s ?? '').toLowerCase().split(/[^a-z0-9一-鿿]+/).filter((t) => t.length > 1);

export const IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif', '.avif'];
export const VIDEO_EXT = ['.mp4', '.webm', '.mov'];
export const MODEL_EXT = ['.glb', '.gltf'];
export const isImage = (f) => IMAGE_EXT.includes(path.extname(f).toLowerCase());
export const isRaster = (f) => isImage(f) && path.extname(f).toLowerCase() !== '.svg';

export const EXT_OF_MIME = {
  'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/svg+xml': '.svg', 'image/gif': '.gif',
  'video/mp4': '.mp4', 'video/webm': '.webm', 'model/gltf-binary': '.glb',
};

// Reads one key from the nearest .env without loading the rest of the file into the process.
export function envKey(name, dirs = [process.cwd()]) {
  if (process.env[name]) return process.env[name];
  for (const dir of dirs) {
    for (let d = path.resolve(dir), i = 0; i < 6; i++, d = path.dirname(d)) {
      const f = path.join(d, '.env');
      if (fs.existsSync(f)) {
        const m = fs.readFileSync(f, 'utf8').match(new RegExp(`^\\s*${name}\\s*=\\s*["']?([^"'\\r\\n#]+)`, 'm'));
        if (m) return m[1].trim();
      }
      if (path.dirname(d) === d) break;
    }
  }
  return null;
}

export const hasBin = (bin) => spawnSync(bin, ['-version'], { stdio: 'ignore' }).status === 0;

// Width and height of a picture, when they can be found cheaply. Never throws.
export function probeSize(file) {
  try {
    if (path.extname(file).toLowerCase() === '.svg') {
      const head = fs.readFileSync(file, 'utf8').slice(0, 4000);
      const vb = head.match(/viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/);
      const w = head.match(/<svg[^>]*\swidth\s*=\s*["']([\d.]+)/), h = head.match(/<svg[^>]*\sheight\s*=\s*["']([\d.]+)/);
      if (vb) return { width: Math.round(+vb[1]), height: Math.round(+vb[2]) };
      if (w && h) return { width: Math.round(+w[1]), height: Math.round(+h[1]) };
      return {};
    }
    const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file], { encoding: 'utf8' });
    const m = r.status === 0 && r.stdout.trim().match(/^(\d+),(\d+)/);
    return m ? { width: +m[1], height: +m[2] } : {};
  } catch { return {}; }
}

export const today = () => new Date().toISOString().slice(0, 10);

export function gitUser(cwd = process.cwd()) {
  const r = spawnSync('git', ['config', 'user.name'], { cwd, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() || null : null;
}
