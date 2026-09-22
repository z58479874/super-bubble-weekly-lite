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

test("保存返回当前周，不误取缓存中的上周同部门记录", async () => {
  await window.CloudSync.saveReport('ops',{departmentId:'ops',weekId:'period-a',status:'草稿',result_explanation:'上周'});
  const result=await window.CloudSync.saveReport('ops',{departmentId:'ops',weekId:'period-b',status:'草稿',result_explanation:'本周'});
  assert.equal(result.report.weekId,'period-b');
  assert.equal(result.report.result_explanation,'本周');
});

test("云端优先读取，失败时回退本机缓存", async () => {
  const online = await window.CloudSync.bootstrap(weeks);
  assert.equal(online.source, "cloud");
  assert.equal(online.reports.find(r=>r.departmentId==='front'&&r.weekId==='period-b').result_explanation, "转化率提升");
  networkFails = true;
  const offline = await window.CloudSync.bootstrap(weeks);
  assert.equal(offline.source, "cache");
  assert.equal(offline.offline, true);
  assert.equal(offline.reports.find(r=>r.departmentId==='front'&&r.weekId==='period-b').result_explanation, "转化率提升");
  networkFails = false;
});

test("离线草稿只保存在本机，重新读取不会自动写入云端", async () => {
  const record = { departmentId: "front", weekId: "period-b", status: "草稿", result_explanation: "离线修改" };
  window.CloudSync.saveLocalDraft("front", record);
  const local = window.CloudSync.getLocalDraft("front", "period-b");
  assert.equal(local.record.result_explanation, "离线修改");
  const before = serverRows.filter((row) => row.item_key === "result_explanation" && row.value === "离线修改").length;
  await window.CloudSync.bootstrap(weeks);
  const after = serverRows.filter((row) => row.item_key === "result_explanation" && row.value === "离线修改").length;
  assert.equal(after, before);
  window.CloudSync.clearLocalDraft("front", "period-b");
  assert.equal(window.CloudSync.getLocalDraft("front", "period-b"), null);
});

test("店长周会内容使用同一张表", async () => {
  await window.CloudSync.login("manager", "", "店长");
  const result = await window.CloudSync.saveMeeting({ weekId: "period-b", actions: [{ title: "周末排班" }], decisions: [], ownerSupport: [], managerJudgement: "本周先恢复周末客流" });
  assert.equal(result.meeting.actions[0].title, "周末排班");
  assert.equal(result.meeting.managerJudgement, "本周先恢复周末客流");
  assert.ok(serverRows.some((row) => row.department === "meeting" && row.section === "manager_key_actions"));
  assert.ok(serverRows.some((row) => row.department === "meeting" && row.section === "manager_judgement"));
});

test('事项数组保存、删除、排序、跨浏览器读取和确认历史互不覆盖',async()=>{
  const record={departmentId:'ops',weekId:'period-b',status:'已确认',confirmedAt:'2026-09-21T02:00:00.000Z',confirmedBy:'李主管',closure_template:1,closure_plans:[{id:'a',title:'培训'},{id:'b',title:'盘点'},{id:'c',title:'检修'},{id:'d',title:'复训'}]};
  await CloudSync.saveReport('ops',record);
  await CloudSync.saveReport('ops',{...record,status:'草稿',confirmedAt:'',confirmedBy:'',closure_plans:[{id:'d',title:'复训'},{id:'a',title:'培训'}]});
  localStorage=new MemoryStorage(); // 第二个浏览器没有本机缓存
  let report=(await CloudSync.bootstrap(weeks)).reports.find(r=>r.departmentId==='ops'&&r.weekId==='period-b');
  assert.deepEqual(report.closure_plans.map(x=>x.id),['d','a']);assert.equal(report.status,'草稿');
  assert.equal(report.confirmationHistory.length,1);assert.equal(report.confirmationHistory[0].report.closure_plans.length,4);
  await CloudSync.saveReport('ops',{...report,status:'已确认',confirmedAt:'2026-09-21T03:00:00.000Z',confirmedBy:'李主管'});
  report=(await CloudSync.bootstrap(weeks)).reports.find(r=>r.departmentId==='ops'&&r.weekId==='period-b');
  assert.equal(report.confirmationHistory.length,2);assert.equal(report.status,'已确认');
});

test('旧版已确认记录重新编辑前可归档，归档不改变草稿状态',async()=>{
  const old={departmentId:'admin',weekId:'period-a',status:'已确认',result_explanation:'旧版结果',confirmedAt:'2026-09-06T12:00:00.000Z'};
  await CloudSync.saveReport('admin',{...old,status:'草稿'});
  await CloudSync.archiveConfirmed('admin',old);
  const report=(await CloudSync.bootstrap(weeks)).reports.find(r=>r.departmentId==='admin');
  assert.equal(report.status,'草稿');assert.equal(report.confirmationHistory[0].report.result_explanation,'旧版结果');
});
