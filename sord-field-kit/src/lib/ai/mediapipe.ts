export interface DetectionBox {
  label: string;
  score: number;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

let detectorPromise: Promise<any> | null = null;
let detectorInstance: any = null;
const WASM_BASE =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite";

async function loadDetector() {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const vision = await import("@mediapipe/tasks-vision");
      const { FilesetResolver, ObjectDetector } = vision;
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
      detectorInstance = await ObjectDetector.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: MODEL_URL,
        },
        runningMode: "VIDEO",
        scoreThreshold: 0.5,
      });
      return detectorInstance;
    })();
  }
  return detectorPromise;
}

export async function ensureDetector() {
  return loadDetector();
}

export async function detectObjects(
  video: HTMLVideoElement
): Promise<DetectionBox[]> {
  if (!video.videoWidth || !video.videoHeight) {
    return [];
  }
  const detector = await loadDetector();
  const result = detector.detectForVideo(video, performance.now());
  const width = video.videoWidth;
  const height = video.videoHeight;
  return (result.detections ?? [])
    .map((d: any) => {
      if (!d.boundingBox) return null;
      const category = d.categories?.[0];
      return {
        label: category?.categoryName ?? "object",
        score: category?.score ?? 0,
        bbox: {
          x: d.boundingBox.originX / width,
          y: d.boundingBox.originY / height,
          width: d.boundingBox.width / width,
          height: d.boundingBox.height / height,
        },
      };
    })
    .filter(Boolean) as DetectionBox[];
}

export function releaseDetector() {
  if (detectorInstance && typeof detectorInstance.close === "function") {
    detectorInstance.close();
  }
  detectorInstance = null;
  detectorPromise = null;
}
