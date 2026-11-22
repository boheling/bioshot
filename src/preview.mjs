// A picture of a 3D model for the review page: four views on one sheet, the back included, because
// what a generated model looks like from behind is the first thing a reviewer needs to see.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { playwright } from './storyshot.mjs';

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'kit', 'bio3.js');

export async function modelPreview({ glb, out, width = 1600, height = 900 }) {
  if (!fs.existsSync(KIT)) throw new Error('kit/bio3.js is missing: run `npm run build:kit`');
  const { chromium } = playwright();
  const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
  try {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.setContent(`<canvas id="gl" width="${width}" height="${height}"></canvas>`);
    await page.addScriptTag({ path: KIT });
    const jpeg = await page.evaluate(async ({ b64, W, H }) => {
      const T = Bio3.three;
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const gltf = await new Promise((ok, no) => new Bio3.GLTFLoader().parse(bytes.buffer, '', ok, no));
      const renderer = new T.WebGLRenderer({ canvas: document.getElementById('gl'), antialias: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(1); renderer.setSize(W, H, false);
      renderer.toneMapping = T.ACESFilmicToneMapping;
      const scene = new T.Scene();
      scene.background = new T.Color(0xeceeeb);
      scene.environment = new T.PMREMGenerator(renderer).fromScene(new Bio3.RoomEnvironment(), 0.04).texture;
      scene.environmentIntensity = 0.8;
      const key = new T.DirectionalLight(0xffffff, 2); key.position.set(4, 6, 5); scene.add(key);
      const m = gltf.scene, box = new T.Box3().setFromObject(m), size = box.getSize(new T.Vector3()), mid = box.getCenter(new T.Vector3());
      const k = 2.4 / Math.max(size.x, size.y, size.z);
      m.scale.setScalar(k); m.position.set(-mid.x * k, -mid.y * k, -mid.z * k);
      scene.add(m);
      const camera = new T.PerspectiveCamera(30, (W / 2) / (H / 2), 0.1, 100);
      const views = [['front, from the left', -0.6, 0.45], ['front, from the right', 0.6, 0.45], ['top', 0, 1.5], ['back', Math.PI, 0.45]];
      renderer.setScissorTest(true);
      views.forEach(([, az, el], i) => {
        const x = (i % 2) * W / 2, y = (1 - Math.floor(i / 2)) * H / 2, d = 6.4;
        camera.position.set(Math.sin(az) * Math.cos(el) * d, Math.sin(el) * d, Math.cos(az) * Math.cos(el) * d);
        camera.up.set(0, el > 1.4 ? 0 : 1, el > 1.4 ? -1 : 0);
        camera.lookAt(0, 0, 0);
        renderer.setViewport(x, y, W / 2, H / 2); renderer.setScissor(x, y, W / 2, H / 2);
        renderer.render(scene, camera);
      });
      const sheet = document.createElement('canvas'); sheet.width = W; sheet.height = H;
      const g = sheet.getContext('2d');
      g.drawImage(renderer.domElement, 0, 0);
      g.fillStyle = '#172026'; g.font = '600 26px sans-serif';
      views.forEach(([label], i) => g.fillText(label, (i % 2) * W / 2 + 24, Math.floor(i / 2) * H / 2 + 44));
      g.fillStyle = '#c9cdc8'; g.fillRect(W / 2 - 1, 0, 2, H); g.fillRect(0, H / 2 - 1, W, 2);
      return sheet.toDataURL('image/jpeg', 0.9).split(',')[1];
    }, { b64: fs.readFileSync(glb).toString('base64'), W: width, H: height });
    fs.writeFileSync(out, Buffer.from(jpeg, 'base64'));
    return out;
  } finally {
    await browser.close();
  }
}

// The preview kept beside a model in the library, made the first time it is asked for.
export async function previewFor(lib, asset) {
  const glb = lib.viewOf(asset);
  if (!glb || !/\.(glb|gltf)$/i.test(asset.file)) return null;
  const out = path.join(path.dirname(glb), 'preview.jpg');
  if (!fs.existsSync(out)) await modelPreview({ glb, out });
  return out;
}
