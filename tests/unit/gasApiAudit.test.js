import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("gas api audit", () => {
  it("client call() khớp public server function và dist/Code.js", () => {
    execSync("node scripts/audit-gas-api.cjs", {
      cwd: root,
      stdio: "pipe",
      encoding: "utf8",
    });
  });
});
