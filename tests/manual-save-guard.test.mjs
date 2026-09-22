import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync("public/app.js", "utf8");
const cloudClient = fs.readFileSync("public/cloud-client.js", "utf8");

test("部门周报不再通过输入、失焦或定时器自动提交", () => {
  assert.doesNotMatch(app, /reportAutosaveTimer/);
  assert.doesNotMatch(app, /focusout[\s\S]{0,240}saveReport/);
  assert.doesNotMatch(app, /setTimeout\(\(\)\s*=>\s*saveReport/);
  assert.match(app, /form\.addEventListener\('input',updateRow\)/);
  assert.match(app, /markReportDirty\(next/);
});

test("后台不再轮询或用远端数据覆盖正在编辑的周报", () => {
  assert.doesNotMatch(app, /CloudSync\.startPolling\(weeks\)/);
  assert.doesNotMatch(cloudClient, /setInterval\(/);
  assert.doesNotMatch(cloudClient, /window\.addEventListener\("focus", poll\)/);
});

test("刷新或离开页面只走静默兜底，并保留独立本地草稿", () => {
  assert.match(app, /window\.addEventListener\('pagehide',persistUnsavedReportOnLeave\)/);
  assert.match(app, /检测到未同步草稿/);
  assert.match(app, /保存并切换/);
  assert.match(cloudClient, /saveLocalDraft/);
  assert.match(cloudClient, /clearLocalDraft/);
});
