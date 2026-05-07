import esbuild from "esbuild";
import fs from "fs";

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

fs.writeFileSync("dist/Code.js", code.trim());
fs.copyFileSync("appsscript.json", "dist/appsscript.json");

console.log("Server build complete", result.outputFiles[0].text.length, "bytes");


