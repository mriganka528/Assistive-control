import {
  FaceLandmarker,
  FilesetResolver,
} from "@mediapipe/tasks-vision";

let faceLandmarker: FaceLandmarker | null = null;

export async function initializeFaceLandmarker() {
  if (faceLandmarker) {
    return faceLandmarker;
  }

  const vision = await FilesetResolver.forVisionTasks(
    new URL("./wasm", document.baseURI).href
  );

  faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: new URL("./models/face_landmarker.task", document.baseURI).href,
    },

    runningMode: "VIDEO",

    numFaces: 1,

    outputFaceBlendshapes: true,

    outputFacialTransformationMatrixes: true,

    minFaceDetectionConfidence: 0.5,

    minFacePresenceConfidence: 0.5,

    minTrackingConfidence: 0.5,
  });

  return faceLandmarker;
}

export function getFaceLandmarker() {
  return faceLandmarker;
}
