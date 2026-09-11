const paths = require("./paths");
const { readJson, writeJson } = require("./fs-utils");

const DEFAULT_ISLAND_VERIFICATION = {
  generatedAt: null,
  islands: {}
};

const DEFAULT_PLAYER_COMPATIBILITY = {
  generatedAt: null,
  players: {
    as3: {
      preferredPlayer: "flashpointnavigator-as3",
      summary: "AS3 继续默认走 Flashpoint Navigator，等单岛闭环稳定后再扩展。",
      audioStatus: "待验证",
      graphicsStatus: "待验证",
      performanceStatus: "待验证",
      lastVerifiedAt: null,
      candidates: []
    },
    as2: {
      preferredPlayer: "flashpointnavigator-as2",
      summary: "AS2 当前默认仍走 Flashpoint Navigator，但 Super Power 会用矩阵验收后自动切到更稳的运行器。",
      audioStatus: "待验证",
      graphicsStatus: "待验证",
      performanceStatus: "待验证",
      lastVerifiedAt: null,
      candidates: []
    }
  }
};

const DEFAULT_WINDOW_AUDIT = {
  generatedAt: null,
  summary: {
    visibleWindowCount: 0,
    shellPopupCount: 0
  },
  windows: [],
  processes: []
};

const ACCEPTANCE_LEVELS = Object.freeze({
  smoke: "启动烟测通过",
  interaction: "基础交互通过",
  route: "完整路线通过",
  final: "最终验收通过"
});

function acceptanceEvidenceComplete(evidence = {}) {
  return evidence.fullRouteVerified === true &&
    evidence.saveReloadVerified === true &&
    evidence.renderedChineseVerified === true &&
    evidence.windowStableVerified === true;
}

function derivePlayabilityStatus({
  available = true,
  smokeVerified = false,
  interactionVerified = false,
  evidence = {},
  failed = false
} = {}) {
  if (!available) {
    return "未导入";
  }
  if (failed) {
    return "已知损坏";
  }
  if (acceptanceEvidenceComplete(evidence)) {
    return ACCEPTANCE_LEVELS.final;
  }
  if (evidence.fullRouteVerified === true) {
    return ACCEPTANCE_LEVELS.route;
  }
  if (interactionVerified) {
    return ACCEPTANCE_LEVELS.interaction;
  }
  if (smokeVerified) {
    return ACCEPTANCE_LEVELS.smoke;
  }
  return "待验证";
}

function loadIslandVerification() {
  return readJson(paths.islandVerificationPath, DEFAULT_ISLAND_VERIFICATION);
}

function saveIslandVerification(payload) {
  return writeJson(paths.islandVerificationPath, {
    ...DEFAULT_ISLAND_VERIFICATION,
    ...payload,
    generatedAt: new Date().toISOString(),
    islands: {
      ...DEFAULT_ISLAND_VERIFICATION.islands,
      ...(payload?.islands || {})
    }
  });
}

function loadPlayerCompatibility() {
  return readJson(paths.playerCompatibilityPath, DEFAULT_PLAYER_COMPATIBILITY);
}

function savePlayerCompatibility(payload) {
  return writeJson(paths.playerCompatibilityPath, {
    ...DEFAULT_PLAYER_COMPATIBILITY,
    ...payload,
    generatedAt: new Date().toISOString(),
    players: {
      ...DEFAULT_PLAYER_COMPATIBILITY.players,
      ...(payload?.players || {})
    }
  });
}

function loadWindowAudit() {
  return readJson(paths.windowAuditPath, DEFAULT_WINDOW_AUDIT);
}

function saveWindowAudit(payload) {
  return writeJson(paths.windowAuditPath, {
    ...DEFAULT_WINDOW_AUDIT,
    ...payload,
    generatedAt: new Date().toISOString()
  });
}

module.exports = {
  ACCEPTANCE_LEVELS,
  acceptanceEvidenceComplete,
  derivePlayabilityStatus,
  loadIslandVerification,
  loadPlayerCompatibility,
  loadWindowAudit,
  saveIslandVerification,
  savePlayerCompatibility,
  saveWindowAudit
};
