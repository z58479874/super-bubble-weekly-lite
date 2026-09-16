import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

class MemoryStorage {
  #values = new Map();
  getItem(key) { return this.#values.has(key) ? this.#values.get(key) : null; }
  setItem(key, value) { this.#values.set(key, String(value)); }
  removeItem(key) { this.#values.delete(key); }
}

const weeks = [
  { id: "period-a", startDate: "2026-09-01", endDate: "2026-09-06", reportId: "20260901-20260906" },
  { id: "period-b", startDate: "2026-09-07", endDate: "2026-09-13", reportId: "20260907-20260913" },
];

globalThis.window = globalThis;
globalThis.localStorage = new MemoryStorage();
globalThis.sessionStorage = new MemoryStorage();
globalThis.document = { visibilityState: "visible", addEventListener() {} };
globalThis.addEventListener = () => {};
globalThis.LITE_DATA = { weeks };
globalThis.LITE_RUNTIME_CONFIG = { supabaseUrl: "https://example.supabase.co", supabaseKey: "publishable-test-key" };

let serverRows = [];
let networkFails = false;
let lastRequest = null;
globalThis.fetch = async (url, options = {}) => {
  lastRequest = { url: String(url), options };
  if (networkFails) throw new Error("offline");
  if ((options.method || "GET") === "POST") {
    const incoming = JSON.parse(options.body);
    const byKey = new Map(serverRows.map((row) => [[row.report_id, row.department, row.section, row.item_key].join("|"), row]));
    for (const row of incoming) byKey.set([row.report_id, row.department, row.section, row.item_key].join("|"), row);
    serverRows = [...byKey.values()];
    return new Response(JSON.stringify(incoming), { status: 201, headers: { "content-type": "application/json" } });
  }
  return new Response(JSON.stringify(serverRows), { status: 200, headers: { "content-type": "application/json" } });
};

await import(`${pathToFileURL(path.resolve("public/cloud-client.js")).href}?test=1`);

test("report_id按周日期生成", () => {
  assert.equal(window.CloudSync.reportId(weeks[1]), "20260907-20260913");
});

test("部门周报写localStorage并通过PostgREST upsert", async () => {
  await window.CloudSync.login("editor", "", "前厅主管");
  const record = {
    departmentId: "front",
    weekId: "period-b",
    status: "草稿",
    result_explanation: "转化率提升",
    problems_0: "家庭归属不完整",
    focus_0_title: "补齐接待统计",
  };
  window.CloudSync.cacheReport("front", record);
  const cache = JSON.parse(localStorage.getItem("super_bubble_lite_weekly_report_edits_v1:20260907-20260913"));
  assert.ok(cache.some((row) => row.section === "key_result" && row.value === "转化率提升"));
  const result = await window.CloudSync.saveReport("front", record);
  assert.equal(result.report.status, "草稿");
  assert.equal(result.report.result_explanation, "转化率提升");
  assert.match(lastRequest.url, /weekly_report_edits\?on_conflict=/);
  assert.equal(lastRequest.options.headers.apikey, "publishable-test-key");
  assert.ok(serverRows.every((row) => row.report_id === "20260907-20260913"));
});

test("云端优先读取，失败时回退本机缓存", async () => {
  const online = await window.CloudSync.bootstrap(weeks);
  assert.equal(online.source, "cloud");
  assert.equal(online.reports[0].result_explanation, "转化率提升");
  networkFails = true;
  const offline = await window.CloudSync.bootstrap(weeks);
  assert.equal(offline.source, "cache");
  assert.equal(offline.offline, true);
  assert.equal(offline.reports[0].result_explanation, "转化率提升");
  networkFails = false;
});

test("离线修改保留为待同步，网络恢复后自动补写", async () => {
  networkFails = true;
  const record = { departmentId: "front", weekId: "period-b", status: "草稿", result_explanation: "离线修改" };
  window.CloudSync.cacheReport("front", record);
  await assert.rejects(window.CloudSync.saveReport("front", record));
  const cached = JSON.parse(localStorage.getItem("super_bubble_lite_weekly_report_edits_v1:20260907-20260913"));
  assert.ok(cached.some((row) => row.item_key === "result_explanation" && row._pending));
  networkFails = false;
  const recovered = await window.CloudSync.bootstrap(weeks);
  assert.equal(recovered.reports[0].result_explanation, "离线修改");
  assert.ok(serverRows.some((row) => row.item_key === "result_explanation" && row.value === "离线修改"));
});

test("店长周会内容使用同一张表", async () => {
  await window.CloudSync.login("manager", "", "店长");
  const result = await window.CloudSync.saveMeeting({ weekId: "period-b", actions: [{ title: "周末排班" }], decisions: [], ownerSupport: [] });
  assert.equal(result.meeting.actions[0].title, "周末排班");
  assert.ok(serverRows.some((row) => row.department === "meeting" && row.section === "manager_key_actions"));
});
