import path from 'node:path';
// The default `main` build requires `@tensorflow/tfjs-node` (a platform-specific native addon); this
// subpath build uses the WASM backend instead, so installing on Render is a plain `npm install`.
import * as faceapi from '@vladmandic/face-api/dist/face-api.node-wasm.js';
import * as tf from '@tensorflow/tfjs';
import type { FaceBox } from './avatarCrop';

const MODEL_DIR = path.join(process.cwd(), 'src/modules/people/faceModel');
const MIN_CONFIDENCE = 0.5;

let ready: Promise<void> | null = null;

function ensureReady(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await tf.setBackend('wasm');
      await tf.ready();
      await faceapi.nets.tinyFaceDetector.loadFromDisk(MODEL_DIR);
    })();
  }
  return ready;
}

/**
 * The highest-confidence face in a decoded RGB image, or `null` when nothing scores above
 * `MIN_CONFIDENCE` — a blurry scan, a face cut off at the frame's edge, or no face at all. Runs
 * entirely in-process on the WASM backend (TensorFlow.js): no network call, no paid API, nothing
 * that costs money beyond the CPU time already paid for on the API server.
 */
export async function detectFaceBox(
  pixels: Uint8Array,
  width: number,
  height: number,
): Promise<FaceBox | null> {
  await ensureReady();
  const tensor = tf.tensor3d(pixels, [height, width, 3], 'int32');
  try {
    const detections = await faceapi.detectAllFaces(tensor, new faceapi.TinyFaceDetectorOptions());
    const best = detections
      .filter((detection) => detection.score >= MIN_CONFIDENCE)
      .sort((a, b) => b.score - a.score)[0];
    if (!best) return null;
    return { x: best.box.x, y: best.box.y, width: best.box.width, height: best.box.height };
  } finally {
    tensor.dispose();
  }
}
