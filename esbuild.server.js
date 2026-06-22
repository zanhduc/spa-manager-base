import esbuild from "esbuild";
import fs from "fs";

const SETUP_FUNCTION_ORDER = [
  "testCreateMockComboData",
  "runSpaBootstrapForEditorForceSeed",
  "runSpaBootstrapForEditor",
  "seedSpaBootstrapDemoData",
  "inspectSpaSheetsState",
  "normalizeSpaDateTimeFormat",
  "initSpaSheets",
  "setupQueueInfrastructure",
  "loadSpaPresetTlcData",
  "simplifySpaSheets",
  "processQueue",
];

function extractFunctionBlock(source, functionName) {
  const matcher = new RegExp(
    `(?:^|\\n)(?:async\\s+)?function\\s+${functionName}\\s*\\(`,
    "m",
  );
  const match = matcher.exec(source);
  if (!match) return null;

  const start = match.index + (match[0].startsWith("\n") ? 1 : 0);
  const braceStart = source.indexOf("{", start);
  if (braceStart < 0) return null;

  let i = braceStart;
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let inLineComment = false;
  let inBlockComment = false;

  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    const prev = source[i - 1];

    if (inLineComment) {
      if (ch === "\n") inLineComment = false;
      i++;
      continue;
    }
    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (inSingle) {
      if (ch === "'" && prev !== "\\") inSingle = false;
      i++;
      continue;
    }
    if (inDouble) {
      if (ch === '"' && prev !== "\\") inDouble = false;
      i++;
      continue;
    }
    if (inTemplate) {
      if (ch === "`" && prev !== "\\") inTemplate = false;
      i++;
      continue;
    }

    if (ch === "/" && next === "/") {
      inLineComment = true;
      i += 2;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlockComment = true;
      i += 2;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      i++;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      i++;
      continue;
    }
    if (ch === "`") {
      inTemplate = true;
      i++;
      continue;
    }
    if (ch === "{") {
      depth++;
      i++;
      continue;
    }
    if (ch === "}") {
      depth--;
      i++;
      if (depth === 0) break;
      continue;
    }

    i++;
  }

  if (depth !== 0) return null;

  let end = i;
  while (end < source.length && (source[end] === "\r" || source[end] === "\n" || source[end] === " " || source[end] === "\t")) {
    end++;
  }

  const block = source.slice(start, end).trim();
  const rest = source.slice(0, start) + source.slice(end);
  return { block, rest };
}

const result = await esbuild.build({
  entryPoints: ["src/client/api/adapters/gasAdapter.js"],
  bundle: true,
  outfile: "dist/Code.js",
  format: "esm",
  platform: "neutral",
  treeShaking: false,
  write: false,
  charset: "utf8",
  define: {
    "import.meta.env.DEV": "false",
    "import.meta.env.VITE_GAS_WEBAPP_URL": '""',
  },
});

// GAS does not support ES modules; strip exports/imports and client-only code.
let code = result.outputFiles[0].text;

// Remove export declarations.
code = code.replace(
  /^export\s+(async\s+)?(function|const|let|var|class)\s+/gm,
  "$1$2 ",
);
code = code.replace(/^export\s+default\s+/gm, "var _default = ");
code = code.replace(/^export\s*\{[^}]*\}\s*;?\s*$/gm, "");

// Remove import statements (already bundled).
code = code.replace(/^import\s+.*?from\s+["'].*?["'];?\s*$/gm, "");

// Remove client wrapper symbols that should not exist in GAS runtime.
code = code.replace(/^(?:var|let|const)\s+helloServerClient\s*=.*$/gm, "");
code = code.replace(/^(?:var|let|const)\s+loginClient\s*=.*$/gm, "");
code = code.replace(/^(?:var|let|const)\s+getUserInfoClient\s*=.*$/gm, "");
code = code.replace(/^(?:var|let|const)\s+getDemoAccountsClient\s*=.*$/gm, "");
code = code.replace(/^(?:var|let|const)\s+getGlobalNoticeClient\s*=.*$/gm, "");
code = code.replace(/^(?:var|let|const)\s+getNextOrderFormDefaultsClient\s*=.*$/gm, "");
code = code.replace(
  /^(?:var|let|const)\s+gasAdapter\s*=\s*\{[\s\S]*?\n\};?\s*$/m,
  "",
);

// Remove client-only transport code.
code = code.replace(/^(?:var|let|const)\s+IS_DEV\s*=.*$/gm, "");
code = code.replace(/^(?:var|let|const)\s+GAS_WEBAPP_URL\s*=.*$/gm, "");
code = code.replace(/^function\s+gasRun\b[\s\S]*?^\}/gm, "");
code = code.replace(/^async function\s+gasFetch\b[\s\S]*?^\}/gm, "");
code = code.replace(/^(?:var|let|const)\s+call\s*=[\s\S]*?^\};/gm, "");

// Move setup-related functions to the top of output for easier deployment checks.
const setupBlocks = [];
for (const functionName of SETUP_FUNCTION_ORDER) {
  const extracted = extractFunctionBlock(code, functionName);
  if (!extracted) continue;
  setupBlocks.push(extracted.block);
  code = extracted.rest;
}
if (setupBlocks.length > 0) {
  code = `${setupBlocks.join("\n\n")}\n\n${code.trimStart()}`;
}

fs.writeFileSync("dist/Code.js", code.trim());
fs.copyFileSync("appsscript.json", "dist/appsscript.json");

console.log("Server build complete", result.outputFiles[0].text.length, "bytes");


