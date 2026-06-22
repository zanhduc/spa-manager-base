/**
 * deploy-prod.mjs
 * Cross-platform deploy script (Mac + Windows)
 * Thay thế toàn bộ bash pipeline trong deploy:prod
 *
 * Usage:
 *   node deploy-prod.mjs
 *   DEPLOYMENT_ID=AKfycb... node deploy-prod.mjs   (chỉ định deployment cụ thể)
 */

import fs from "node:fs";
import { execSync } from "node:child_process";

// ─── Helpers ────────────────────────────────────────────────────────────────

function run(cmd, opts = {}) {
  console.log(`\n> ${cmd}`);
  return execSync(cmd, { stdio: opts.capture ? "pipe" : "inherit", encoding: "utf8" });
}

function runCapture(cmd) {
  return run(cmd, { capture: true }) || "";
}

function abort(msg) {
  console.error(`\nERROR: ${msg}`);
  process.exit(1);
}

// ─── Step 1: Patch appsscript.json ──────────────────────────────────────────

const APPSSCRIPT_PATH = "appsscript.json";
const json = JSON.parse(fs.readFileSync(APPSSCRIPT_PATH, "utf8"));
json.webapp = {
  ...(json.webapp || {}),
  executeAs: "USER_DEPLOYING",
  access: "ANYONE_ANONYMOUS",
};
fs.writeFileSync(APPSSCRIPT_PATH, JSON.stringify(json, null, 2) + "\n");
console.log("✅ appsscript.json configured: USER_DEPLOYING + ANYONE_ANONYMOUS");

// ─── Step 2: Build ──────────────────────────────────────────────────────────

run("npm run build");

// ─── Step 3: clasp push ─────────────────────────────────────────────────────

run("clasp push");

// ─── Step 4: clasp version → lấy version number ─────────────────────────────

const now = new Date();
// Format: YYYY-MM-DD HH:MM:SS — cross-platform, không dùng `date` shell
const pad = (n) => String(n).padStart(2, "0");
const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
const versionLabel = `prod update ${dateStr}`;

const versionOutput = runCapture(`clasp version "${versionLabel}"`);
// Output dạng: "Created version 12."
const versionMatch = versionOutput.match(/Created version (\d+)/);
if (!versionMatch) {
  abort(`Không parse được version number từ output:\n${versionOutput}`);
}
const versionNumber = versionMatch[1];
console.log(`✅ Created version: ${versionNumber}`);

// ─── Step 5: Lấy Deployment ID ──────────────────────────────────────────────

let deploymentId = process.env.DEPLOYMENT_ID || "";

if (!deploymentId) {
  const deploymentsOutput = runCapture("clasp deployments");
  // Output mỗi dòng dạng: "- AKfycbXXX @3 - prod"
  // Lấy deployment có version number cao nhất (mới nhất)
  const lines = deploymentsOutput.split("\n");
  let latestVersion = -1;
  let latestId = "";

  for (const line of lines) {
    // Match: "- <id> @<version>"
    const m = line.match(/^-\s+(\S+)\s+@(\d+)/);
    if (m) {
      const id = m[1];
      const ver = parseInt(m[2], 10);
      if (ver > latestVersion) {
        latestVersion = ver;
        latestId = id;
      }
    }
  }

  if (!latestId) {
    abort(
      "Không tìm thấy deployment đang tồn tại.\n" +
      "Hãy truyền DEPLOYMENT_ID=<id> hoặc tạo deployment trước bằng: clasp deploy"
    );
  }

  deploymentId = latestId;
  console.log(`✅ Auto-detected deployment: ${deploymentId} (was @${latestVersion})`);
} else {
  console.log(`✅ Using DEPLOYMENT_ID from env: ${deploymentId}`);
}

// ─── Step 6: clasp update ───────────────────────────────────────────────────

console.log(`\n🚀 Update deployment: ${deploymentId} (version ${versionNumber})`);
run(`clasp update -i "${deploymentId}" -V "${versionNumber}"`);

console.log("\n✅ Deploy thành công!");
