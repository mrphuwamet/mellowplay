/**
 * On-device face embedding for the event-album "ค้นหารูปลูกของฉัน" search.
 *
 * The reference photo NEVER leaves the phone: it is downscaled, run through
 * face-api locally, and only the resulting 128-float descriptor (512 bytes)
 * is sent to the API. The recognition net must stay in lockstep with the CRM
 * indexer (mellow-play-crm-portal/src/utils/faceIndexer.ts) — same package
 * version, same model files — or the distances stop meaning anything.
 *
 * Everything here is loaded lazily via dynamic import: the ~7MB of model
 * weights and the face-api bundle are fetched only the first time someone
 * actually taps face search, then cached by the browser.
 */
export const FACE_MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model';

// The query photo is only used to find ONE face; 640px is plenty for the
// biggest face in a portrait and keeps detection fast on a mid-range phone.
const QUERY_MAX_DIM = 640;

let loading: Promise<typeof import('@vladmandic/face-api')> | null = null;
function loadFaceApi() {
  if (!loading) {
    loading = import('@vladmandic/face-api').then(async faceapi => {
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(FACE_MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(FACE_MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(FACE_MODEL_URL),
      ]);
      return faceapi;
    });
  }
  return loading;
}

const toBase64 = (descriptor: Float32Array): string => {
  const bytes = new Uint8Array(descriptor.buffer, descriptor.byteOffset, descriptor.byteLength);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
};

/**
 * Compute the embedding of the most prominent face in a photo the user
 * picked. Returns null when no face is found (the caller shows "ไม่พบใบหน้า
 * ในรูป ลองรูปที่เห็นหน้าชัดๆ").
 */
export async function embedReferencePhoto(file: File): Promise<string | null> {
  const faceapi = await loadFaceApi();

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, QUERY_MAX_DIM / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) { bitmap.close(); return null; }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const detections = await faceapi
    .detectAllFaces(canvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.3 }))
    .withFaceLandmarks()
    .withFaceDescriptors();
  if (detections.length === 0) return null;

  // The biggest face wins: a parent photographing their child fills the
  // frame with them, and any bystander face will be smaller.
  const best = detections.reduce((a, b) =>
    (b.detection.box.width * b.detection.box.height) > (a.detection.box.width * a.detection.box.height) ? b : a);
  return toBase64(best.descriptor);
}
