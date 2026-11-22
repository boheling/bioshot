// Reads every frame of a rendered spike film: the timeline clock (12 blocks along the top, 1/120 s)
// and the plate's own frame number (10 blocks along the bottom), then prints how they line up.
import { execFileSync } from 'node:child_process';
const [file, fpsArg, ...scenes] = process.argv.slice(2);
const fps = +fpsArg;
const strip = (crop, n) => execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', `crop=${crop},scale=${n}:1:flags=area,format=gray`, '-f', 'rawvideo', '-'], { maxBuffer: 1 << 28 });
const bits = (buf, n) => { const out = []; for (let f = 0; f * n < buf.length; f++) { let v = 0; for (let i = 0; i < n; i++) if (buf[f * n + i] > 127) v |= 1 << i; out.push(v); } return out; };
const clock = bits(strip('1920:20:0:20', 12), 12);     // timeline time in 1/120 s
const plate = bits(strip('1920:40:0:1000', 10), 10);   // source frame number
let at = 0;
for (const spec of scenes) {                            // name:seconds
  const [name, secs] = spec.split(':'); const n = Math.round(+secs * fps);
  const rows = [];
  for (let i = 0; i < n; i++) rows.push({ i, t: clock[at + i] / 120, src: plate[at + i] });
  const clockOff = rows.map((r) => Math.round(r.t * fps) - r.i);
  const uniq = (a) => [...new Set(a)].join(',');
  console.log(`\n## ${name}  (${n} frames from film frame ${at})`);
  console.log(`timeline clock minus frame index, in frames: ${uniq(clockOff)}`);
  const show = [0, 1, 2, 29, 30, 31, 59, 60, 89, 90, 119, 120, 149, 150, 178, 179, 180, 181, 209, 210, 239, 269].filter((k) => k < n).concat([n - 2, n - 1]);
  console.log('frame→plate: ' + [...new Set(show)].map((k) => `${k}→${rows[k].src}`).join('  '));
  at += n;
}
console.log(`\nfilm frames: ${clock.length}, accounted for: ${at}`);
