const fs = require("node:fs");
const path = require("node:path");
const { parseArgs, printJson } = require("./lib/cli");
const { loadConfig } = require("./lib/config");
const paths = require("./lib/paths");
const { ensureDirSync, writeJson } = require("./lib/fs-utils");
const { buildAs3DirectSceneUrl } = require("./lib/as3-direct-wrapper");
const { clearPoptropicaFlashState } = require("./lib/flash-state");
const { ensureQaDir, runPythonQa } = require("./lib/qa");
const {
  ensureFlashpointServices,
  ensureManagedWorkspace,
  mountSourceZip,
  spawnManagedRuntime,
  stopNavigatorProcesses
} = require("./lib/flashpoint-runtime");

const CHILD_CLASS = "Gecko";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function splitCsv(value, fallback = []) {
  const text = String(value || "").trim();
  if (!text) {
    return fallback;
  }
  return text.split(",").map((entry) => entry.trim()).filter(Boolean);
}

function flagEnabled(value) {
  return value === true || /^(1|true|yes|y)$/iu.test(String(value || ""));
}

function runtimeCmdlineContains(runtime) {
  try {
    const url = new URL(runtime.launchUrl || "");
    return `${url.pathname}${url.search}`;
  } catch (_error) {
    return "";
  }
}

function cjkTextOnly(text) {
  return String(text || "").replace(/[^\p{Script=Han}。，！？、……]/gu, "").trim();
}

function hanOnly(text) {
  return String(text || "").replace(/[^\p{Script=Han}]/gu, "").trim();
}

function countExpected(text, expected) {
  const source = String(text || "");
  const needle = String(expected || "");
  if (!needle) {
    return 0;
  }
  let count = 0;
  let offset = 0;
  while (offset < source.length) {
    const index = source.indexOf(needle, offset);
    if (index === -1) {
      break;
    }
    count += 1;
    offset = index + needle.length;
  }
  return count;
}

function hasChinese(text) {
  return /\p{Script=Han}{2,}/u.test(String(text || ""));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  process.env.POPTROPICA_QA_MUTE_RUNTIME = "1";
  process.env.POPTROPICA_QA_MUTE_SECONDS = String(Math.max(3600, Number(process.env.POPTROPICA_QA_MUTE_SECONDS || 43200)));
  process.env.POPTROPICA_QA_MUTE_INTERVAL_MS = String(Math.max(100, Number(process.env.POPTROPICA_QA_MUTE_INTERVAL_MS || 150)));
  process.env.POPTROPICA_QA_MONITOR = String(args.targetMonitor || args.monitor || process.env.POPTROPICA_QA_MONITOR || "G32QC");
  process.env.POPTROPICA_QA_NO_FOREGROUND = "1";
  process.env.POPTROPICA_QA_POST_MESSAGE_CLICKS = "1";

  const config = loadConfig();
  ensureManagedWorkspace(config);
  await ensureFlashpointServices(config);
  await mountSourceZip(config, "as3");

  const startedAt = new Date().toISOString();
  const runId = Date.now();
  const runDir = ensureQaDir("as3", "dialogue-stability", `run-${runId}`);
  const reportPath = path.join(paths.qaDir, "as3", "dialogue-stability", `as3-dialogue-stability-${runId}.json`);
  const latestPath = path.join(paths.qaDir, "as3", "dialogue-stability", "as3-dialogue-stability-latest.json");
  const scene = String(args.scene || args.overrideScene || args["override-scene"] || "game.scenes.timmy.mainStreet.MainStreet");
  const npc = String(args.qaDialogNpc || args["qa-dialog-npc"] || "player");
  const dialogId = String(args.qaDialogId || args["qa-dialog-id"] || "be_careful");
  const expected = String(args.expected || args.expectedText || args["expected-text"] || "").trim();
  const sampleMs = splitCsv(args.sampleMs || args["sample-ms"], ["0", "1000", "2000", "3000", "4000"]).map((value) => Number(value));
  const settleMs = Number(args.settleMs || args["settle-ms"] || 12000);
  const windowTimeoutMs = Number(args.windowTimeoutMs || args["window-timeout-ms"] || 90000);

  stopNavigatorProcesses();
  clearPoptropicaFlashState({ reason: `qa-as3-dialogue-stability:${npc}:${dialogId}` });

  const launchUrl = buildAs3DirectSceneUrl(scene, {
    seedIsland: args.seedIsland || args["seed-island"] || "timmy",
    seedEvents: args.seedEvents || args["seed-events"] || "intro_complete",
    qaDialogNpc: npc,
    qaDialogId: dialogId
  });
  const runtime = spawnManagedRuntime(config, "as3", launchUrl, {
    detach: true,
    playerKey: "flashpointnavigator-as3"
  });
  runtime.launchUrl = launchUrl;

  const qaErrors = [];
  const windowPath = path.join(runDir, "window.json");
  const sequenceDir = path.join(runDir, "sequence");
  const sequenceMetadataPath = path.join(runDir, "sequence.json");
  let runtimeWindow = null;
  let sequence = null;
  const samples = [];

  try {
    const waitArgs = [
      "wait-window",
      "--process-names",
      runtime.processNames.join(","),
      "--title-contains",
      "poptropica",
      "--pid",
      String(runtime.pid),
      "--target-monitor",
      process.env.POPTROPICA_QA_MONITOR,
      "--timeout-ms",
      String(windowTimeoutMs),
      "--output",
      windowPath
    ];
    const cmdlineContains = runtimeCmdlineContains(runtime);
    if (cmdlineContains) {
      waitArgs.push("--cmdline-contains", cmdlineContains);
    }
    runtimeWindow = runPythonQa(waitArgs, { timeoutMs: windowTimeoutMs + 5000 });
    await sleep(settleMs);

    const sequenceArgs = [
      "capture-window-sequence",
      "--handle",
      String(runtimeWindow.match.handle),
      "--process-names",
      runtime.processNames.join(","),
      "--title-contains",
      "poptropica",
      "--pid",
      String(runtime.pid),
      "--output-dir",
      sequenceDir,
      "--stem",
      "dialogue",
      "--sample-ms",
      sampleMs.join(","),
      "--metadata-output",
      sequenceMetadataPath,
      "--client-only",
      "--child-class-contains",
      CHILD_CLASS,
      "--no-foreground"
    ];
    const sequenceCmdlineContains = runtimeCmdlineContains(runtime);
    if (sequenceCmdlineContains) {
      sequenceArgs.push("--cmdline-contains", sequenceCmdlineContains);
    }
    sequence = runPythonQa(sequenceArgs, { timeoutMs: Math.max(60000, Math.max(...sampleMs, 0) + 45000) });

    for (const sample of sequence?.samples || []) {
      const stem = `dialogue-${sample.delayMs}`;
      const ocrPath = path.join(runDir, `${stem}-ocr.json`);
      const stagePath = path.join(runDir, `${stem}-stage.json`);
      const visualGuardPath = path.join(runDir, `${stem}-visual-guard.json`);
      let ocr = null;
      let stage = null;
      let visualGuard = null;
      try {
        ocr = runPythonQa(["ocr-image", "--input", sample.savedTo, "--output", ocrPath], { timeoutMs: 120000 });
      } catch (error) {
        qaErrors.push({ step: `${stem}:ocr`, message: String(error.message || error) });
      }
      try {
        stage = runPythonQa(["analyze-stage", "--input", sample.savedTo, "--output", stagePath], { timeoutMs: 30000 });
      } catch (error) {
        qaErrors.push({ step: `${stem}:stage`, message: String(error.message || error) });
      }
      try {
        visualGuard = runPythonQa(["analyze-visual-guard", "--input", sample.savedTo, "--output", visualGuardPath], { timeoutMs: 30000 });
      } catch (error) {
        qaErrors.push({ step: `${stem}:visual-guard`, message: String(error.message || error) });
      }
      samples.push({
        delayMs: sample.delayMs,
        screenshotPath: sample.savedTo,
        imageSize: sample.imageSize,
        ocrPath,
        stagePath,
        visualGuardPath,
        ocrText: String(ocr?.text || ""),
        cjkText: cjkTextOnly(ocr?.text || ""),
        containsChinese: Boolean(ocr?.containsChinese || hasChinese(ocr?.text)),
        expectedCount: expected ? countExpected(ocr?.text || "", expected) : null,
        stageOk: Boolean(stage?.ok),
        visualOk: Boolean(visualGuard?.ok)
      });
    }
  } catch (error) {
    qaErrors.push({ step: "dialogue-stability", message: String(error.message || error) });
  } finally {
    if (!flagEnabled(args.keepRuntime || args["keep-runtime"])) {
      stopNavigatorProcesses();
    }
  }

  const chineseSamples = samples.filter((sample) => sample.containsChinese);
  const exactSamples = expected ? samples.filter((sample) => sample.expectedCount === 1) : [];
  const duplicateSamples = expected
    ? samples.filter((sample) => Number(sample.expectedCount || 0) > 1)
    : [];
  const uniqueCjk = [...new Set(samples.map((sample) => sample.cjkText).filter(Boolean))];
  const expectedHan = hanOnly(expected);
  const uniqueHan = [...new Set(samples.map((sample) => hanOnly(sample.cjkText)).filter(Boolean))];
  const expectedHanMatched = !expectedHan || uniqueHan.some((text) => text.includes(expectedHan) || expectedHan.includes(text));
  const requiredStableSamples = Math.max(3, Math.min(3, samples.length));
  const stableCjk = uniqueCjk.length === 1 && uniqueHan.length === 1 && chineseSamples.length >= requiredStableSamples;
  const stableText = expected
    ? (exactSamples.length >= requiredStableSamples || (stableCjk && expectedHanMatched)) && duplicateSamples.length === 0
    : stableCjk;
  const visualStable = samples.length > 0 && samples.every((sample) => sample.stageOk && sample.visualOk);
  const ok = qaErrors.length === 0 && samples.length >= 3 && stableText && visualStable;

  const report = {
    ok,
    generatedAt: new Date().toISOString(),
    startedAt,
    runDir,
    launchUrl,
    target: { scene, npc, dialogId, expected: expected || null },
    runtime: {
      pid: runtime.pid || null,
      processNames: runtime.processNames
    },
    runtimeWindow,
    settleMs,
    sampleMs,
    sequenceMetadataPath,
    samples,
    checks: {
      sampleCount: samples.length,
      chineseSampleCount: chineseSamples.length,
      exactExpectedSampleCount: expected ? exactSamples.length : null,
      duplicateExpectedSampleCount: expected ? duplicateSamples.length : null,
      uniqueCjk,
      uniqueHan,
      expectedHan: expectedHan || null,
      expectedHanMatched,
      stableText,
      visualStable
    },
    qaErrors
  };
  writeJson(reportPath, report);
  writeJson(latestPath, report);
  printJson({ ...report, reportPath, latestPath });
  process.exitCode = ok ? 0 : 1;
}

main().catch((error) => {
  printJson({ ok: false, error: String(error.message || error), stack: error.stack });
  process.exitCode = 1;
});
