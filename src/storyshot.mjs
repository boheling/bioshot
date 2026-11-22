// Finding storyshot, the film engine bioshot works beside. bioshot never imports storyshot's source;
// it runs its command line, and borrows the browser storyshot already installed.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// $STORYSHOT_DIR, an installed `storyshot` package, or a checkout beside this one.
export function storyshotDir() {
  const tried = [];
  if (process.env.STORYSHOT_DIR) tried.push(process.env.STORYSHOT_DIR);
  for (const from of [process.cwd(), HERE]) {
    try { tried.push(path.dirname(createRequire(path.join(from, 'x.js')).resolve('storyshot/package.json'))); } catch { /* not installed here */ }
  }
  tried.push(path.resolve(HERE, '..', '..', 'storyshot'));
  const dir = tried.find((d) => fs.existsSync(path.join(d, 'bin', 'storyshot.mjs')));
  if (!dir) throw new Error('storyshot was not found: install it (npm i -g storyshot), or set STORYSHOT_DIR to a checkout');
  return dir;
}
export const storyshotBin = () => path.join(storyshotDir(), 'bin', 'storyshot.mjs');

// The Playwright that storyshot depends on, so bioshot does not download a second browser.
export function playwright() {
  return createRequire(path.join(storyshotDir(), 'package.json'))('playwright');
}
