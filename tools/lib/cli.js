function camelCaseKey(key) {
  return String(key || "").replace(/-([a-z0-9])/giu, (_match, char) => String(char).toUpperCase());
}

function assignArg(args, key, value) {
  args[key] = value;
  const alias = camelCaseKey(key);
  if (alias !== key && args[alias] === undefined) {
    args[alias] = value;
  }
}

function parseArgs(argv) {
  const args = {
    _: []
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      args._.push(token);
      continue;
    }

    const rawKey = token.slice(2);
    const equalsIndex = rawKey.indexOf("=");
    if (equalsIndex !== -1) {
      const key = rawKey.slice(0, equalsIndex);
      assignArg(args, key, rawKey.slice(equalsIndex + 1));
      continue;
    }

    const key = rawKey;
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      assignArg(args, key, true);
      continue;
    }

    assignArg(args, key, next);
    index += 1;
  }

  return args;
}

function asArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === undefined || value === null || value === false) {
    return [];
  }
  return [value];
}

function printJson(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

module.exports = {
  asArray,
  parseArgs,
  printJson
};
