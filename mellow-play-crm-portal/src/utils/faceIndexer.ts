import * as faceapi from '@vladmandic/face-api';

/**
 * Face detection + embedding for the event-album importer.
 *
 * Everything face-related runs in the admin's browser: the Worker only ever
 * stores the resulting 128-float descriptors. The same face_recognition net
 * runs in the consumer app (see mellow-play-consumer-app/src/utils/
 * faceEmbedding.ts), which is the entire reason the two embeddings are
 * comparable — change the model version in BOTH places or in neither, and
 * re-index every album after a change.
 *
 * Models come off jsDelivr straight from the npm package: they are static
 * public files, the version is pinned, and the browser caches them for the
 * session. ssd_mobilenetv1 rather than the tiny detector on this side —
 * group photos are the normal case and it finds the small faces the tiny
 * net misses; the importer runs on a desktop where the extra 5MB is nothing.
 */
export const FACE_MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model';

let loading: Promise<void> | null = null;
export function loadFaceModels(): Promise<void> {
  if (!loading) {
    loading = Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(FACE_MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(FACE_MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(FACE_MODEL_URL),
    ]).then(() => undefined);
  }
  return loading;
}

export interface DetectedFace {
  /** base64 of Float32Array(128), little-endian — what the API stores. */
  embedding: string;
  bbox: { x: number; y: number; w: number; h: number };
  score: number;
}

export const embeddingToBase64 = (descriptor: Float32Array): string => {
  const bytes = new Uint8Array(descriptor.buffer, descriptor.byteOffset, descriptor.byteLength);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
};

/** Detect every face in a decoded photo. Detection runs at the display-copy
 *  resolution (~1920px) — small faces in group shots vanish at thumbnail size. */
export async function describeFaces(bitmap: ImageBitmap): Promise<DetectedFace[]> {
  await loadFaceModels();
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];
  ctx.drawImage(bitmap, 0, 0);

  const detections = await faceapi
    .detectAllFaces(canvas, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.4 }))
    .withFaceLandmarks()
    .withFaceDescriptors();

  return detections.map(d => ({
    embedding: embeddingToBase64(d.descriptor),
    bbox: {
      x: d.detection.box.x / canvas.width,
      y: d.detection.box.y / canvas.height,
      w: d.detection.box.width / canvas.width,
      h: d.detection.box.height / canvas.height,
    },
    score: Math.round(d.detection.score * 1000) / 1000,
  }));
}
