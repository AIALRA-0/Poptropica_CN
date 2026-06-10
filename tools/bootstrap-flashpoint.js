const { parseArgs, printJson } = require("./lib/cli");
const { loadConfig } = require("./lib/config");
const { ensureFlashpointServices, ensureManagedWorkspace, mountSourceZip, verifyBasePhp } = require("./lib/flashpoint-runtime");
const { generateLaunchManifest } = require("./lib/launch-manifest");

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const preferredSource = String(args.source || "as3").toLowerCase();
  const workspace = ensureManagedWorkspace(config);
  const launchManifest = generateLaunchManifest(config);
  const services = await ensureFlashpointServices(config);

  let mounted = null;
  let basePhp = null;
  if (preferredSource === "as2" || preferredSource === "as3") {
    mounted = await mountSourceZip(config, preferredSource);
    basePhp = await verifyBasePhp(config, preferredSource);
  }

  printJson({
    workspace,
    launchManifest: launchManifest.summary,
    services,
    mounted: mounted
      ? {
          sourceGroup: mounted.sourceGroup,
          targetZipPath: mounted.targetZipPath,
          mountFileName: mounted.mountFileName,
          gameId: mounted.gameId,
          dataId: mounted.dataId
        }
      : null,
    basePhp: basePhp
      ? {
          statusCode: basePhp.statusCode,
          zipsvrFilename: basePhp.headers["zipsvr_filename"] || basePhp.headers["zipsvr-filename"] || null
        }
      : null
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
