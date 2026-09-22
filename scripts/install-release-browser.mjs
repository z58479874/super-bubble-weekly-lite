import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import process from "node:process";

const root = resolve(import.meta.dirname, "..");
const env = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: join(root, ".playwright-browsers") };
execFileSync(process.execPath, [join("node_modules", "playwright", "cli.js"), "install", "--with-deps", "chromium"], {
  cwd: root,
  env,
  stdio: "inherit",
});
