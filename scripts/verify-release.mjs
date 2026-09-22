import { createServer } from "node:http";
import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import process from "node:process";

const root = resolve(import.meta.dirname, "..");
const publicDir = join(root, "public");
const distDir = join(root, "dist");
const basePath = "/super-bubble-weekly-lite/";
const browserPath = join(root, ".playwright-browsers");
const node = process.execPath;
const mime = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function fail(message) {
  throw new Error(message);
}

function listJavaScript(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = join(directory, entry.name);
    if (entry.isDirectory()) return listJavaScript(target);
    return entry.isFile() && entry.name.endsWith(".js") ? [target] : [];
  });
}

function run(command, args, label) {
  console.log(`\n▶ ${label}`);
  execFileSync(command, args, { cwd: root, stdio: "inherit" });
}

function checkSyntax(files) {
  console.log("\n▶ 检查 public 下 JavaScript 语法");
  for (const file of files) execFileSync(node, ["--check", file], { cwd: root, stdio: "inherit" });
  console.log(`✓ 已通过 ${files.length} 个 public JavaScript 文件的语法检查`);
}

function startStaticServer() {
  const server = createServer((request, response) => {
    const requestPath = decodeURIComponent((request.url || "/").split("?")[0]);
    if (!requestPath.startsWith(basePath)) {
      response.writeHead(404).end("GitHub Pages 子路径不匹配");
      return;
    }
    let relativePath = requestPath.slice(basePath.length) || "index.html";
    let target = resolve(distDir, relativePath);
    if (!target.startsWith(distDir)) {
      response.writeHead(403).end("禁止访问");
      return;
    }
    if (existsSync(target) && statSync(target).isDirectory()) target = join(target, "index.html");
    if (!existsSync(target)) {
      response.writeHead(404).end(`找不到资源：${relativePath}`);
      return;
    }
    response.writeHead(200, { "content-type": mime[extname(target)] || "application/octet-stream" });
    createReadStream(target).pipe(response);
  });
  return new Promise((resolveServer) => server.listen(0, "127.0.0.1", () => resolveServer(server)));
}

async function assertPage(page, pageId, title) {
  await page.locator(`[data-nav="${pageId}"]`).click();
  await page.locator("h1").first().waitFor({ state: "visible" });
  const visibleTitle = (await page.locator("h1").first().textContent())?.trim();
  if (visibleTitle !== title) fail(`${title} 未能打开，当前页面标题为“${visibleTitle || "空白"}”`);
  const empty = await page.locator("#app").evaluate((element) => !element.children.length || !element.textContent?.trim());
  if (empty) fail(`${title} 渲染为空白`);
  const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (overflows) fail(`${title} 在当前视口存在页面级横向溢出`);
}

async function browserCheck() {
  console.log("\n▶ 真实浏览器验证（模拟 GitHub Pages 子路径）");
  process.env.PLAYWRIGHT_BROWSERS_PATH = browserPath;
  const { chromium } = await import("playwright");
  const server = await startStaticServer();
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}${basePath}`;
  const browser = await chromium.launch({ headless: true });
  const errors = [];

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    page.on("pageerror", (error) => errors.push(`未捕获异常：${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`控制台错误：${message.text()}`);
    });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });

    await page.getByRole("heading", { name: "周经营总览", exact: true }).waitFor({ state: "visible", timeout: 15_000 });
    if ((await page.locator("#app").textContent())?.trim().length === 0) fail("首页 #app 为空，页面未渲染");
    for (const pageCheck of [
      ["overview", "周经营总览"],
      ["frontDouyin", "前厅与抖音"],
      ["douyinTopic", "抖音经营详情"],
      ["reports", "部门周报"],
      ["meeting", "周会与老板汇报"],
    ]) await assertPage(page, ...pageCheck);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: "domcontentloaded", timeout: 15_000 });
    for (const pageCheck of [
      ["overview", "周经营总览"],
      ["frontDouyin", "前厅与抖音"],
      ["douyinTopic", "抖音经营详情"],
      ["reports", "部门周报"],
      ["meeting", "周会与老板汇报"],
    ]) await assertPage(page, ...pageCheck);

    if (errors.length) fail(errors.join("\n"));
    console.log(`✓ 生产页面可在 GitHub Pages 子路径打开：${url}`);
    console.log("✓ 桌面端与 390px 手机端五个页面均通过渲染与横向溢出检查");
  } finally {
    await browser.close();
    await new Promise((resolveClose) => server.close(resolveClose));
  }
}

try {
  checkSyntax(listJavaScript(publicDir));
  const tests = readdirSync(join(root, "tests")).filter((file) => file.endsWith(".test.mjs")).map((file) => join("tests", file));
  run(node, ["--test", ...tests], "执行自动化测试");
  run(node, [join("node_modules", "vite", "bin", "vite.js"), "build", "--base=/super-bubble-weekly-lite/"], "生产构建");
  await browserCheck();
  console.log("\n✅ verify:release 全部通过：允许发布。");
} catch (error) {
  console.error(`\n❌ verify:release 失败：${error.message}`);
  console.error("发布已阻止：请修复以上问题后重新执行验证。");
  process.exitCode = 1;
}
