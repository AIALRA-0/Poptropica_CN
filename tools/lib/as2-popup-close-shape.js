const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const POPUP_CLOSE_LABEL_SHAPE_ID = 256;
const POPUP_CLOSE_ORIGINAL_PATH_MARKER = "M14.5 -5.25";
const POPUP_CLOSE_LABEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAEIAAAAOCAYAAACbzsr/AAAACXBIWXMAAAsTAAALEwEAmpwYAAAB70lEQVR4nO3W32uPURwH8GfzYzPzY0wZ89uWDflNMS2t5I4LRUlShHLhWi5E3HIhXMiNrb7zo5CJXEu58Se9dOzzreNpxtgjX+1dn57nOc/nnPP5vM/nxymKEjAXnViN9ej9z2QdlqO17Ps3YBaWVrT5vuy9HwMT6GzB2b9MSmeRQ3UE1OU5jsb7aTydQKcv9C7iOF7hRSafsa0C2xbVSVhQIQHbsQcncA078BgnsRu7Qm8TjuEA9sfYTlzI1hqLaJpuG9vrRKyqkIhTeJDJx9L3+dDbjA+luQOlyBmLqJkOu3qiTrSU02IF1oRCb4Xy8gfjfeHoldBJqfAOn/A60ulPiOiJ4r8M89FU/AyYjXlYGN2jKxbZ8BsGHMYgDoa8xZGS9GdE1OelFHmPkSlGxMY40K6wPfnQ8kuOTwVoyohqx+LYMIVZN9YGYfXIuoHrIXfwBXezsZtRAHMiUvcYxbmMiOTgm2jnK2O/dLod4Wxbsqv4F4HmIC3dS1pxFbfxMNKxLZNUsJ9Fj0/F9Eyc6v1svVpq8UWjAnNwCbeCnFRAh7G3dIepRfE8FN+pq9zLdEYbkgjjzqQi9ySezdm/wSiC6d6wJKKmlv1PXeQRhiJaLif9olFh/HQ7JomUrRlpQ5Osk4pqd5W2zmAGxXf4CiBYomwStwhJAAAAAElFTkSuQmCC";

function runChecked(command, args, label) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 128,
    timeout: 300000
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed: ${(result.stderr || result.stdout || result.error?.message || "").trim()}`);
  }
  return result;
}

function ensureEmptyDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
  fs.mkdirSync(dirPath, { recursive: true });
}

function patchAs2PopupCloseShape({ ffdecCli, inputSwf, outputSwf, workDir }) {
  const shapeDir = path.join(workDir, "popup-close-shape-export");
  ensureEmptyDir(shapeDir);
  runChecked(ffdecCli, ["-cli", "-export", "shape", shapeDir, inputSwf], "export AS2 popup close shapes");

  const sourceShapePath = path.join(shapeDir, `${POPUP_CLOSE_LABEL_SHAPE_ID}.svg`);
  if (!fs.existsSync(sourceShapePath)) {
    return {
      changed: false,
      reason: "missing-popup-close-label-shape",
      shapeId: POPUP_CLOSE_LABEL_SHAPE_ID
    };
  }

  const sourceShape = fs.readFileSync(sourceShapePath, "utf8");
  if (!sourceShape.includes(POPUP_CLOSE_ORIGINAL_PATH_MARKER)) {
    return {
      changed: false,
      reason: sourceShape.includes("fill-bitmapId") ? "already-bitmap-popup-close-label-shape" : "unexpected-popup-close-label-shape",
      shapeId: POPUP_CLOSE_LABEL_SHAPE_ID,
      sourceShapePath
    };
  }

  const pngPath = path.join(workDir, "popup-close-label-zh.png");
  fs.writeFileSync(pngPath, Buffer.from(POPUP_CLOSE_LABEL_PNG_BASE64, "base64"));
  runChecked(
    ffdecCli,
    ["-replace", inputSwf, outputSwf, String(POPUP_CLOSE_LABEL_SHAPE_ID), pngPath, "lossless2"],
    "replace AS2 popup close label shape"
  );

  return {
    changed: true,
    outputSwf,
    shapeId: POPUP_CLOSE_LABEL_SHAPE_ID,
    imagePath: pngPath,
    sourceShapePath,
    replacementKind: "shape-bitmap-asset"
  };
}

module.exports = {
  POPUP_CLOSE_LABEL_SHAPE_ID,
  patchAs2PopupCloseShape
};
