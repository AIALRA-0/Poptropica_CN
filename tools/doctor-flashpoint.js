const paths = require("./lib/paths");
const { printJson } = require("./lib/cli");
const { loadConfig } = require("./lib/config");
const { fileExists, readJson, writeJson } = require("./lib/fs-utils");
const { ensureFlashpointServices, ensureManagedWorkspace, getFlashpointPaths, getPoptropicaRecords, verifyBasePhp } = require("./lib/flashpoint-runtime");
const { generateLaunchManifest, loadLaunchManifest } = require("./lib/launch-manifest");
const { DatabaseSync } = require("node:sqlite");

function readManagedMountRows() {
  if (!fileExists(paths.managedDbPath)) {
    return [];
  }
  const db = new DatabaseSync(paths.managedDbPath);
  const rows = db.prepare(`
    SELECT g.title, g.activeDataId, gd.id, gd.path, gd.presentOnDisk
    FROM game g
    JOIN game_data gd ON gd.gameId = g.id
    ORDER BY g.title, gd.id
  `).all();
  db.close();
  return rows;
}

async function main() {
  const config = loadConfig();
  const flashpoint = getFlashpointPaths(config);
  const workspace = ensureManagedWorkspace(config);
  const services = await ensureFlashpointServices(config);
  const records = getPoptropicaRecords(config);
  const launchManifest = loadLaunchManifest() || generateLaunchManifest(config);
  const runtimeState = readJson(paths.flashpointRuntimeStatePath, {}) || {};

  let basePhp = null;
  try {
    if (config.sources.as3Gamezip) {
      basePhp = await verifyBasePhp(config, "as3");
    } else if (config.sources.as2Gamezip) {
      basePhp = await verifyBasePhp(config, "as2");
    }
  } catch (error) {
    basePhp = {
      statusCode: 0,
      error: error.message
    };
  }

  const report = {
    generatedAt: new Date().toISOString(),
    configuredSources: config.sources,
    flashpointPaths: {
      root: flashpoint.root,
      launcherExe: flashpoint.launcherExe,
      navigatorExe: flashpoint.navigatorExe,
      gameServerExe: flashpoint.gameServerExe,
      phpExe: flashpoint.phpExe,
      dbPath: flashpoint.dbPath,
      dataGamesDir: flashpoint.dataGamesDir
    },
    workspace: {
      workspaceDir: workspace.workspaceDir,
      managedDbPath: workspace.managedDbPath,
      managedDbExists: fileExists(workspace.managedDbPath),
      managedMountRows: readManagedMountRows()
    },
    services,
    records,
    runtimeState,
    launchManifest: launchManifest
      ? launchManifest.summary
      : null,
    basePhp: basePhp
      ? {
          statusCode: basePhp.statusCode,
          zipsvrFilename: basePhp.headers?.["zipsvr_filename"] || basePhp.headers?.["zipsvr-filename"] || null,
          error: basePhp.error || null
        }
      : null
  };

  writeJson(paths.doctorReportPath, report);
  printJson(report);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
