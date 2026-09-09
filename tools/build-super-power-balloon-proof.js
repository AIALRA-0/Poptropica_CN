const path = require("node:path");
const paths = require("./lib/paths");
const { writeJson } = require("./lib/fs-utils");
const { printJson } = require("./lib/cli");

const report = {
  ok: true,
  generatedAt: new Date().toISOString(),
  noOp: true,
  policy: "Native translatable resources remain localized. Static scene signs and bitmap art are not translated with TextField overlays.",
  note: "The previous Super Power static sign overlay proof was retired because static art translation by overlay is no longer an accepted requirement."
};

const reportPath = path.join(paths.qaDir, "super-power", "super-power-balloon-proof-retired.json");
writeJson(reportPath, report);
printJson({ ...report, reportPath });
