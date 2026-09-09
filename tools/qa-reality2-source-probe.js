const http = require("node:http");
const https = require("node:https");
const path = require("node:path");
const { parseArgs, printJson } = require("./lib/cli");
const { readJson, writeJson } = require("./lib/fs-utils");
const paths = require("./lib/paths");

const HOSTS = ["www.poptropica.com"];
const SCENE_FOLDER = "reality2";
const ROOM = "mainStreet";
const EXPECTED_DATA_FILES = [
  "blimp.xml",
  "custom.xml",
  "dialog.xml",
  "doors.xml",
  "hits.xml",
  "items.xml",
  "npcs.xml",
  "scene.xml",
  "sounds.xml"
];
const EXPECTED_ASSET_FILES = [
  "backdrop.swf",
  "background.swf",
  "foreground.swf",
  "interactive.swf",
  "interactive2.swf"
];

function buildExpectedResources() {
  return [
    ...EXPECTED_DATA_FILES.map((fileName) => ({
      type: "data",
      path: `game/data/scenes/${SCENE_FOLDER}/${ROOM}/${fileName}`
    })),
    ...EXPECTED_ASSET_FILES.map((fileName) => ({
      type: "asset",
      path: `game/assets/scenes/${SCENE_FOLDER}/${ROOM}/${fileName}`
    }))
  ];
}

function buildCdxUrls() {
  return [
    `www.poptropica.com/game/data/scenes/${SCENE_FOLDER}/${ROOM}/*`,
    `www.poptropica.com/game/assets/scenes/${SCENE_FOLDER}/${ROOM}/*`,
    `www.poptropica.com/game/data/scenes/${SCENE_FOLDER}/*`,
    `www.poptropica.com/game/assets/scenes/${SCENE_FOLDER}/*`,
    "www.poptropica.com/game/sound/music/Safari_Extended.mp3",
    "www.poptropica.com/game/sound/music/Train_Finale.mp3"
  ];
}

function requestSample(url, options = {}, redirectCount = 0) {
  const timeoutMs = Number(options.timeoutMs || 12000);
  const maxBytes = Number(options.maxBytes || 8192);
  return new Promise((resolve) => {
    let parsed = null;
    try {
      parsed = new URL(url);
    } catch (error) {
      resolve({
        ok: false,
        url,
        finalUrl: url,
        status: null,
        headers: {},
        sampleText: "",
        sampleHex: "",
        sampledBytes: 0,
        truncated: false,
        error: error.message
      });
      return;
    }

    const transport = parsed.protocol === "http:" ? http : https;
    const request = transport.request(parsed, {
      method: "GET",
      headers: {
        "Range": `bytes=0-${Math.max(0, maxBytes - 1)}`,
        "User-Agent": "POPTROPICA_FLASH reality2 source probe"
      },
      timeout: timeoutMs
    }, (response) => {
      const location = response.headers.location;
      if ([301, 302, 303, 307, 308].includes(Number(response.statusCode)) && location && redirectCount < 5) {
        response.resume();
        const nextUrl = new URL(location, parsed).href;
        requestSample(nextUrl, options, redirectCount + 1).then((result) => {
          resolve({
            ...result,
            redirects: [
              ...(result.redirects || []),
              { from: url, to: nextUrl, status: response.statusCode }
            ]
          });
        });
        return;
      }

      const chunks = [];
      let sampledBytes = 0;
      let resolved = false;
      function finish(truncated = false) {
        if (resolved) {
          return;
        }
        resolved = true;
        const buffer = Buffer.concat(chunks, sampledBytes);
        resolve({
          ok: true,
          url,
          finalUrl: response.responseUrl || url,
          status: response.statusCode,
          headers: response.headers,
          sampleText: buffer.toString("utf8"),
          sampleHex: buffer.toString("hex", 0, Math.min(buffer.length, 16)),
          sampledBytes,
          truncated,
          error: null
        });
      }

      response.on("data", (chunk) => {
        if (resolved) {
          return;
        }
        const remaining = maxBytes - sampledBytes;
        if (remaining <= 0) {
          finish(true);
          response.destroy();
          return;
        }
        const slice = chunk.length > remaining ? chunk.subarray(0, remaining) : chunk;
        chunks.push(slice);
        sampledBytes += slice.length;
        if (sampledBytes >= maxBytes) {
          finish(true);
          response.destroy();
        }
      });
      response.on("end", () => finish(false));
      response.on("error", (error) => {
        if (!resolved) {
          resolve({
            ok: false,
            url,
            finalUrl: url,
            status: response.statusCode || null,
            headers: response.headers || {},
            sampleText: "",
            sampleHex: "",
            sampledBytes,
            truncated: false,
            error: error.message
          });
        }
      });
    });

    request.on("timeout", () => {
      request.destroy(new Error(`Timed out after ${timeoutMs}ms`));
    });
    request.on("error", (error) => {
      resolve({
        ok: false,
        url,
        finalUrl: url,
        status: null,
        headers: {},
        sampleText: "",
        sampleHex: "",
        sampledBytes: 0,
        truncated: false,
        error: error.message
      });
    });
    request.end();
  });
}

function classifyDirectProbe(resource, response) {
  const contentType = String(response.headers?.["content-type"] || "").toLowerCase();
  const text = String(response.sampleText || "").trimStart().toLowerCase();
  const hex = String(response.sampleHex || "").toLowerCase();
  const statusOk = Number(response.status) >= 200 && Number(response.status) < 300;
  const htmlFallback = /text\/html/u.test(contentType) || /^<!doctype html/u.test(text) || /^<html/u.test(text);
  const xmlLike = resource.type === "data" && (/xml/u.test(contentType) || /^<\?xml/u.test(text) || /^</u.test(text)) && !htmlFallback;
  const swfLike = resource.type === "asset" && (/x-shockwave-flash/u.test(contentType) || /^(465753|435753|5a5753)/u.test(hex));
  return {
    statusOk,
    contentType,
    htmlFallback,
    playableResourceLike: statusOk && (xmlLike || swfLike),
    reason: !statusOk
      ? `status_${response.status || "none"}`
      : htmlFallback
        ? "html_fallback"
        : xmlLike || swfLike
          ? "resource_signature"
          : "unexpected_signature"
  };
}

async function probeDirectResources(resources, args) {
  const probes = [];
  for (const host of HOSTS) {
    for (const resource of resources) {
      const url = `https://${host}/${resource.path}`;
      const response = await requestSample(url, {
        timeoutMs: args.timeoutMs,
        maxBytes: args.maxBytes
      });
      probes.push({
        ...resource,
        url,
        response: {
          ok: response.ok,
          status: response.status,
          finalUrl: response.finalUrl,
          contentType: response.headers?.["content-type"] || null,
          contentLength: response.headers?.["content-length"] || null,
          sampledBytes: response.sampledBytes,
          truncated: response.truncated,
          error: response.error,
          sampleHex: response.sampleHex,
          sampleTextPrefix: String(response.sampleText || "").slice(0, 120)
        },
        classification: classifyDirectProbe(resource, response)
      });
    }
  }
  return probes;
}

function buildCdxQuery(wildcard, limit) {
  const params = new URLSearchParams({
    url: wildcard,
    output: "json",
    fl: "timestamp,original,statuscode,mimetype,digest,length",
    filter: "statuscode:200",
    collapse: "urlkey",
    limit: String(limit || 100)
  });
  return `https://web.archive.org/cdx?${params.toString()}`;
}

function parseCdxJson(text) {
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return [];
  }
  const [header, ...rows] = parsed;
  return rows.map((row) => Object.fromEntries(header.map((key, index) => [key, row[index] || null])));
}

function classifyCdxCapture(capture) {
  const original = String(capture.original || "");
  const mimetype = String(capture.mimetype || "").toLowerCase();
  const resourceLike =
    /\/game\/data\/scenes\/reality2\/mainStreet\/[^/?#]+\.xml(?:$|[?#])/u.test(original) ||
    /\/game\/assets\/scenes\/reality2\/mainStreet\/[^/?#]+\.swf(?:$|[?#])/u.test(original) ||
    /\/game\/sound\/music\/(?:Safari_Extended|Train_Finale)\.mp3(?:$|[?#])/u.test(original) ||
    /xml|x-shockwave-flash|octet-stream/u.test(mimetype);
  return {
    resourceLike,
    expectedRoomPath: /\/reality2\/mainStreet\//u.test(original),
    soundResource: /\/game\/sound\/music\/(?:Safari_Extended|Train_Finale)\.mp3(?:$|[?#])/u.test(original),
    mimetype
  };
}

function toRawReplayUrl(capture) {
  return capture.timestamp && capture.original
    ? `https://web.archive.org/web/${capture.timestamp}id_/${capture.original}`
    : null;
}

async function queryCdx(wildcards, args) {
  const queries = [];
  const captures = [];
  const seen = new Set();
  for (const wildcard of wildcards) {
    const url = buildCdxQuery(wildcard, args.cdxLimit);
    let response = null;
    let rows = [];
    let parseError = null;
    let attempt = 0;
    const maxAttempts = Math.max(1, Number(args.cdxRetries || 1) + 1);
    while (attempt < maxAttempts) {
      attempt += 1;
      response = await requestSample(url, {
        timeoutMs: args.timeoutMs,
        maxBytes: args.cdxMaxBytes || 1024 * 1024
      });
      if (response.ok && Number(response.status) >= 200 && Number(response.status) < 300) {
        break;
      }
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, Number(args.cdxRetryDelayMs || 1500)));
      }
    }
    const statusOk = response && response.ok && Number(response.status) >= 200 && Number(response.status) < 300;
    if (statusOk) {
      try {
        rows = parseCdxJson(response.sampleText);
      } catch (error) {
        parseError = error.message;
      }
    }
    for (const row of rows) {
      const key = `${row.timestamp}:${row.original}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      captures.push({
        ...row,
        classification: classifyCdxCapture(row),
        replayUrl: row.timestamp && row.original ? `https://web.archive.org/web/${row.timestamp}/${row.original}` : null,
        rawReplayUrl: toRawReplayUrl(row)
      });
    }
    queries.push({
      wildcard,
      url,
      ok: statusOk && !parseError,
      status: response.status,
      attempts: attempt,
      rowCount: rows.length,
      error: parseError || response.error || (statusOk ? null : `HTTP ${response.status || "none"}`)
    });
  }
  return { queries, captures };
}

function extractPathFromOriginal(original) {
  try {
    const parsed = new URL(original);
    return parsed.pathname.replace(/^\/+/u, "");
  } catch (_error) {
    return String(original || "").replace(/^https?:\/\/[^/]+\//iu, "");
  }
}

function parseSceneXmlResourceRefs(sceneXml) {
  const dataFiles = [];
  const dataMatch = String(sceneXml || "").match(/<data>([\s\S]*?)<\/data>/iu);
  if (dataMatch) {
    for (const token of dataMatch[1].split(",")) {
      const fileName = token.trim();
      if (fileName) {
        dataFiles.push(fileName);
      }
    }
  }
  const assetFiles = [];
  const assetPattern = /<asset(?:\s[^>]*)?>([\s\S]*?)<\/asset>/giu;
  let assetMatch = null;
  while ((assetMatch = assetPattern.exec(String(sceneXml || "")))) {
    const fileName = assetMatch[1].trim();
    if (fileName && /\.swf$/iu.test(fileName)) {
      assetFiles.push(fileName);
    }
  }
  return [
    ...[...new Set(dataFiles)].map((fileName) => ({
      type: "data",
      fileName,
      path: `game/data/scenes/${SCENE_FOLDER}/${ROOM}/${fileName}`
    })),
    ...[...new Set(assetFiles)].map((fileName) => ({
      type: "asset",
      fileName,
      path: `game/assets/scenes/${SCENE_FOLDER}/${ROOM}/${fileName}`
    }))
  ];
}

async function inspectArchivedSceneManifest(cdx, args) {
  const sceneCapture = cdx.captures
    .filter((capture) => /\/game\/data\/scenes\/reality2\/mainStreet\/scene\.xml(?:$|[?#])/u.test(String(capture.original || "")))
    .sort((left, right) => String(left.timestamp || "").localeCompare(String(right.timestamp || "")))[0] || null;
  if (!sceneCapture?.rawReplayUrl) {
    return {
      ok: false,
      sceneCapture: null,
      fetch: null,
      declaredResources: [],
      coverage: null,
      error: "No archived mainStreet scene.xml capture was found."
    };
  }

  const response = await requestSample(sceneCapture.rawReplayUrl, {
    timeoutMs: args.timeoutMs,
    maxBytes: args.maxBytes || 64 * 1024
  });
  const declaredResources = response.ok && Number(response.status) >= 200 && Number(response.status) < 300
    ? parseSceneXmlResourceRefs(response.sampleText)
    : [];
  const capturePaths = new Set(cdx.captures.map((capture) => extractPathFromOriginal(capture.original)));
  const declared = declaredResources.map((resource) => ({
    ...resource,
    archivedCaptureFound: capturePaths.has(resource.path)
  }));
  const missing = declared.filter((resource) => !resource.archivedCaptureFound);

  return {
    ok: response.ok && declared.length > 0,
    sceneCapture: {
      timestamp: sceneCapture.timestamp,
      original: sceneCapture.original,
      mimetype: sceneCapture.mimetype,
      length: sceneCapture.length,
      replayUrl: sceneCapture.replayUrl,
      rawReplayUrl: sceneCapture.rawReplayUrl
    },
    fetch: {
      ok: response.ok,
      status: response.status,
      contentType: response.headers?.["content-type"] || null,
      sampledBytes: response.sampledBytes,
      error: response.error
    },
    declaredResources: declared,
    coverage: {
      declaredResourceCount: declared.length,
      coveredDeclaredResourceCount: declared.filter((resource) => resource.archivedCaptureFound).length,
      missingDeclaredResourceCount: missing.length,
      missingDeclaredResources: missing.map((resource) => resource.path)
    },
    error: null
  };
}

function summarize({ resources, directProbes, cdx, archivedSceneManifest }) {
  const directPlayableCount = directProbes.filter((probe) => probe.classification.playableResourceLike).length;
  const directHtmlFallbackCount = directProbes.filter((probe) => probe.classification.htmlFallback).length;
  const cdxResourceLike = cdx.captures.filter((capture) => capture.classification.resourceLike);
  const cdxExpectedRoom = cdxResourceLike.filter((capture) => capture.classification.expectedRoomPath);
  const cdxSound = cdx.captures.filter((capture) => capture.classification.soundResource);
  const declaredCoverage = archivedSceneManifest?.coverage || null;
  return {
    expectedResourceCount: resources.length,
    expectedDataResourceCount: resources.filter((resource) => resource.type === "data").length,
    expectedAssetResourceCount: resources.filter((resource) => resource.type === "asset").length,
    directProbeCount: directProbes.length,
    directPlayableResourceLikeCount: directPlayableCount,
    directHtmlFallbackCount,
    cdxQueryCount: cdx.queries.length,
    cdxQueryOkCount: cdx.queries.filter((query) => query.ok).length,
    cdxQueryErrorCount: cdx.queries.filter((query) => !query.ok).length,
    cdxCaptureCount: cdx.captures.length,
    cdxResourceLikeCount: cdxResourceLike.length,
    cdxExpectedRoomResourceLikeCount: cdxExpectedRoom.length,
    cdxSoundResourceCount: cdxSound.length,
    archivedSceneManifestFetched: archivedSceneManifest?.ok === true,
    archivedDeclaredResourceCount: declaredCoverage?.declaredResourceCount || 0,
    archivedDeclaredResourceCoverageCount: declaredCoverage?.coveredDeclaredResourceCount || 0,
    archivedDeclaredResourceMissingCount: declaredCoverage?.missingDeclaredResourceCount || 0,
    externalPlayableSourceProved: directPlayableCount === resources.length,
    archivedDeclaredMainStreetSourceFound: Boolean(
      declaredCoverage &&
      declaredCoverage.declaredResourceCount > 0 &&
      declaredCoverage.missingDeclaredResourceCount === 0
    ),
    archivedCandidateFound: cdxExpectedRoom.length > 0
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const resources = buildExpectedResources();
  const directProbes = await probeDirectResources(resources, {
    timeoutMs: Number(args.timeoutMs || args["timeout-ms"] || 12000),
    maxBytes: Number(args.maxBytes || args["max-bytes"] || 8192)
  });
  const cdx = await queryCdx(buildCdxUrls(), {
    timeoutMs: Number(args.timeoutMs || args["timeout-ms"] || 12000),
    cdxLimit: Number(args.cdxLimit || args["cdx-limit"] || 100),
    cdxMaxBytes: Number(args.cdxMaxBytes || args["cdx-max-bytes"] || 1024 * 1024),
    cdxRetries: Number(args.cdxRetries || args["cdx-retries"] || 2),
    cdxRetryDelayMs: Number(args.cdxRetryDelayMs || args["cdx-retry-delay-ms"] || 2500)
  });
  const archivedSceneManifest = await inspectArchivedSceneManifest(cdx, {
    timeoutMs: Number(args.timeoutMs || args["timeout-ms"] || 12000),
    maxBytes: Number(args.sceneMaxBytes || args["scene-max-bytes"] || 64 * 1024)
  });
  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    policy: {
      downloadsAssets: false,
      note: "This probe records current URL signatures, Internet Archive CDX metadata, and the archived scene.xml manifest only; it does not bulk-download game assets."
    },
    identifiers: {
      canonicalKey: "reality-tv-wild-safari",
      sceneFolder: SCENE_FOLDER,
      room: ROOM
    },
    summary: summarize({ resources, directProbes, cdx, archivedSceneManifest }),
    expectedResources: resources,
    directProbes,
    cdx,
    archivedSceneManifest
  };
  const outputPath = args.output || args.report || path.join(paths.qaDir, "reality2-source-probe-latest.json");
  writeJson(outputPath, report);
  printJson({
    ok: report.ok,
    generatedAt: report.generatedAt,
    summary: report.summary,
    reportPath: outputPath
  });
}

if (require.main === module) {
  main().catch((error) => {
    const outputPath = path.join(paths.qaDir, "reality2-source-probe-latest.json");
    const report = {
      ok: false,
      generatedAt: new Date().toISOString(),
      error: error.stack || error.message
    };
    writeJson(outputPath, report);
    printJson(report);
    process.exitCode = 1;
  });
}

module.exports = {
  buildExpectedResources,
  buildCdxUrls,
  classifyDirectProbe,
  classifyCdxCapture,
  parseCdxJson,
  requestSample
};
