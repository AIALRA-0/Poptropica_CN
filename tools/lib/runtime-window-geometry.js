const AS3_SAFE_MAXIMIZE_WIDTH = 2300;
const AS3_SAFE_MAXIMIZE_HEIGHT = 1320;
const WORK_AREA_SENTINEL_SIZE = 99999;

function flagEnabled(value) {
  if (value === true) {
    return true;
  }
  if (value === false || value === undefined || value === null) {
    return false;
  }
  return /^(1|true|yes|on)$/iu.test(String(value).trim());
}

function parsePositiveInt(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseWindowSizeArgs(args = {}) {
  const sizeMatch = String(args.windowSize || args["window-size"] || "").match(/^(\d+)x(\d+)$/iu);
  const width = parsePositiveInt(args.windowWidth || args["window-width"] || (sizeMatch ? sizeMatch[1] : null));
  const height = parsePositiveInt(args.windowHeight || args["window-height"] || (sizeMatch ? sizeMatch[2] : null));
  return {
    width,
    height,
    hasExplicitSize: Boolean(width && height)
  };
}

function resolveCliWindowGeometry(args = {}, sourceGroup) {
  const normalized = String(sourceGroup || "").toLowerCase();
  const parsedSize = parseWindowSizeArgs(args);
  const maximize = flagEnabled(args.maximizeWindow || args["maximize-window"] || args.maximize);
  const unsafeMaximize = flagEnabled(args.trueMaximize || args["true-maximize"] || args.unsafeMaximize || args["unsafe-maximize"]);

  if (parsedSize.hasExplicitSize) {
    return {
      mode: "explicit",
      width: parsedSize.width,
      height: parsedSize.height
    };
  }

  if (!maximize) {
    return null;
  }

  if (normalized === "as3" && !unsafeMaximize) {
    const safeWidth = parsePositiveInt(args.safeMaximizeWidth || args["safe-maximize-width"]) || AS3_SAFE_MAXIMIZE_WIDTH;
    const safeHeight = parsePositiveInt(args.safeMaximizeHeight || args["safe-maximize-height"]) || AS3_SAFE_MAXIMIZE_HEIGHT;
    return {
      mode: "as3-safe-maximize",
      width: safeWidth,
      height: safeHeight
    };
  }

  return {
    mode: normalized === "as3" ? "as3-unsafe-workarea" : "workarea",
    width: WORK_AREA_SENTINEL_SIZE,
    height: WORK_AREA_SENTINEL_SIZE,
    reportedWidth: null,
    reportedHeight: null
  };
}

function resolveLauncherRuntimeWindowGeometry(sourceGroup, env = process.env) {
  const width = parsePositiveInt(env.POPTROPICA_WINDOW_WIDTH);
  const height = parsePositiveInt(env.POPTROPICA_WINDOW_HEIGHT);
  if (width && height) {
    return {
      mode: "inherited",
      width,
      height
    };
  }
  if (String(sourceGroup || "").toLowerCase() === "as3") {
    return {
      mode: "as3-safe-maximize",
      width: AS3_SAFE_MAXIMIZE_WIDTH,
      height: AS3_SAFE_MAXIMIZE_HEIGHT
    };
  }
  return null;
}

function applyWindowGeometryEnv(geometry, env = process.env) {
  if (!geometry?.width || !geometry?.height) {
    delete env.POPTROPICA_WINDOW_WIDTH;
    delete env.POPTROPICA_WINDOW_HEIGHT;
    return;
  }
  env.POPTROPICA_WINDOW_WIDTH = String(geometry.width);
  env.POPTROPICA_WINDOW_HEIGHT = String(geometry.height);
}

function withWindowGeometryEnv(geometry, callback, env = process.env) {
  const previousWidth = env.POPTROPICA_WINDOW_WIDTH;
  const previousHeight = env.POPTROPICA_WINDOW_HEIGHT;
  try {
    applyWindowGeometryEnv(geometry, env);
    return callback();
  } finally {
    if (previousWidth === undefined) {
      delete env.POPTROPICA_WINDOW_WIDTH;
    } else {
      env.POPTROPICA_WINDOW_WIDTH = previousWidth;
    }
    if (previousHeight === undefined) {
      delete env.POPTROPICA_WINDOW_HEIGHT;
    } else {
      env.POPTROPICA_WINDOW_HEIGHT = previousHeight;
    }
  }
}

module.exports = {
  AS3_SAFE_MAXIMIZE_HEIGHT,
  AS3_SAFE_MAXIMIZE_WIDTH,
  WORK_AREA_SENTINEL_SIZE,
  applyWindowGeometryEnv,
  flagEnabled,
  parsePositiveInt,
  resolveCliWindowGeometry,
  resolveLauncherRuntimeWindowGeometry,
  withWindowGeometryEnv
};
