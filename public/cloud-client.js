(function () {
  const TABLE = "weekly_report_edits";
  const CACHE_PREFIX = "super_bubble_lite_weekly_report_edits_v1:";
  const USER_KEY = "super_bubble_weekly_lite_editor_v1";
  const LOCAL_DRAFT_PREFIX = "super_bubble_lite_unsynced_report_draft_v1:";
  const config = window.LITE_RUNTIME_CONFIG || {};
  const listeners = new Set();

  const session = () => {
    try { return JSON.parse(sessionStorage.getItem(USER_KEY) || "null"); } catch (_) { return null; }
  };
  const notify = (event) => listeners.forEach((listener) => listener(event));
  const reportId = (week) => week?.reportId || `${String(week?.startDate || "").replaceAll("-", "")}-${String(week?.endDate || "").replaceAll("-", "")}`;
  const recentWeeks = (weeks = window.LITE_DATA?.weeks || []) => weeks.slice(-4);
  const cacheKey = (id) => `${CACHE_PREFIX}${id}`;
  const localDraftKey = (reportId, department) => `${LOCAL_DRAFT_PREFIX}${reportId}:${department}`;
  const rowKey = (row) => [row.report_id, row.department, row.section, row.item_key].join("|");
  const dbStatus = (status) => status === "已确认" ? "confirmed" : status === "草稿" ? "draft" : "empty";
  const uiStatus = (status) => status === "confirmed" ? "已确认" : status === "draft" ? "草稿" : "未填写";
  const updatedMs = (row) => Date.parse(row?.updated_at || "") || 0;

  function sectionFor(key) {
    if (["status", "confirmedBy", "confirmedAt"].includes(key)) return "meta";
    if (key === "result_explanation") return "key_result";
    if (key.startsWith("problems_")) return "problems";
    if (key.startsWith("support_")) return "support_requests";
    if (key.startsWith("focus_")) return "weekly_actions";
    if (key.startsWith("undone_")) return "unfinished_items";
    if (key === "advice") return "supervisor_suggestion";
    if (key.startsWith("review_")) return "special_reviews";
    if (key.startsWith("specific_")) return "department_specific";
    return "report_fields";
  }

  function readCachedRows(weeks = recentWeeks()) {
    return weeks.flatMap((week) => {
      try { return JSON.parse(localStorage.getItem(cacheKey(reportId(week))) || "[]"); } catch (_) { return []; }
    });
  }

  function replaceCachedRows(rows, weeks = recentWeeks()) {
    for (const week of weeks) {
      const id = reportId(week);
      try { localStorage.setItem(cacheKey(id), JSON.stringify(rows.filter((row) => row.report_id === id))); } catch (_) {}
    }
  }

  function mergeCachedRows(rows) {
    const weeks = recentWeeks();
    const merged = new Map(readCachedRows(weeks).map((row) => [rowKey(row), row]));
    for (const row of rows) {
      const old = merged.get(rowKey(row));
      if (!old || updatedMs(row) >= updatedMs(old)) merged.set(rowKey(row), row);
    }
    replaceCachedRows([...merged.values()], weeks);
  }

  const pendingRows = () => readCachedRows(recentWeeks()).filter((row) => row._pending);
  const serverRows = (rows) => rows.map(({ _pending, ...row }) => row);

  function headers(extra = {}) {
    return {
      apikey: config.supabaseKey,
      Authorization: `Bearer ${config.supabaseKey}`,
      "content-type": "application/json",
      ...extra,
    };
  }

  function assertConfigured() {
    if (!config.supabaseUrl || !config.supabaseKey) throw new Error("Supabase共享保存尚未配置，当前使用本机缓存。");
  }

  async function fetchRows(weeks = recentWeeks()) {
    assertConfigured();
    const ids = weeks.map(reportId).filter(Boolean);
    if (!ids.length) return [];
    const url = new URL(`${config.supabaseUrl.replace(/\/$/, "")}/rest/v1/${TABLE}`);
    url.searchParams.set("select", "report_id,department,section,item_key,value,status,editor_name,updated_at");
    url.searchParams.set("report_id", `in.(${ids.join(",")})`);
    url.searchParams.set("order", "updated_at.asc");
    const response = await fetch(url, { headers: headers() });
    const data = await response.json().catch(() => []);
    if (!response.ok) throw new Error(data?.message || data?.error || `共享内容读取失败（${response.status}）`);
    return Array.isArray(data) ? data : [];
  }

  async function upsertRows(rows, { keepalive = false } = {}) {
    assertConfigured();
    if (!rows.length) return [];
    const url = new URL(`${config.supabaseUrl.replace(/\/$/, "")}/rest/v1/${TABLE}`);
    url.searchParams.set("on_conflict", "report_id,department,section,item_key");
    const response = await fetch(url, {
      method: "POST",
      headers: headers({ Prefer: "resolution=merge-duplicates,return=representation" }),
      body: JSON.stringify(serverRows(rows)),
      keepalive,
    });
    const data = await response.json().catch(() => []);
    if (!response.ok) throw new Error(data?.message || data?.error || `共享内容保存失败（${response.status}）`);
    return Array.isArray(data) && data.length ? data : rows;
  }

  function reportRows(department, record, now = new Date().toISOString()) {
    const who = session()?.name || record.editorName || "未填写";
    const status = dbStatus(record.status);
    const id = record.reportId || reportId((window.LITE_DATA?.weeks || []).find((week) => week.id === record.weekId));
    const normalized = { ...record };
    if (record.status === "已确认") {
      normalized.confirmedBy = record.confirmedBy || who;
      normalized.confirmedAt = record.confirmedAt || now;
    }
    const ignored = new Set(["departmentId", "weekId", "reportId", "version", "updatedAt", "savedAt", "editorName", "confirmationHistory"]);
    const rows = Object.entries(normalized)
      .filter(([key]) => !ignored.has(key))
      .map(([key, value]) => ({ report_id: id, department, section: sectionFor(key), item_key: key, value: value ?? "", status, editor_name: who, updated_at: now }));
    if (!rows.some((row) => row.item_key === "status")) rows.push({ report_id: id, department, section: "meta", item_key: "status", value: record.status || "未填写", status, editor_name: who, updated_at: now });
    if (normalized.status === '已确认') {
      const { confirmationHistory, ...snapshot } = normalized;
      rows.push({report_id:id,department,section:'confirmation_history',item_key:`confirmed_${normalized.confirmedAt}`,value:snapshot,status:'confirmed',editor_name:normalized.confirmedBy,updated_at:normalized.confirmedAt});
    }
    return rows;
  }

  function meetingRows(record, now = new Date().toISOString()) {
    const who = session()?.name || record.editorName || "未填写";
    const id = record.reportId || reportId((window.LITE_DATA?.weeks || []).find((week) => week.id === record.weekId));
    return ["actions", "decisions", "ownerSupport", "managerJudgement"].map((key) => ({
      report_id: id,
      department: "meeting",
      section: key === "actions" ? "manager_key_actions" : key === "decisions" ? "manager_decisions" : key === "ownerSupport" ? "owner_support" : "manager_judgement",
      item_key: key,
      value: record[key] ?? (key === "managerJudgement" ? "" : []),
      status: "draft",
      editor_name: who,
      updated_at: now,
    }));
  }

  function assemble(rows, weeks = recentWeeks()) {
    const weekByReport = new Map(weeks.map((week) => [reportId(week), week]));
    const reports = new Map();
    const meetings = new Map();
    let latest = "";
    for (const row of rows) {
      if (!weekByReport.has(row.report_id)) continue;
      if (!latest || updatedMs(row) > Date.parse(latest)) latest = row.updated_at;
      if (row.department === "meeting") {
        const meeting = meetings.get(row.report_id) || { actions: [], decisions: [], ownerSupport: [] };
        meeting[row.item_key] = row.value;
        meeting.updatedAt = row.updated_at;
        meeting.editorName = row.editor_name;
        meetings.set(row.report_id, meeting);
        continue;
      }
      const key = `${row.report_id}|${row.department}`;
      const week = weekByReport.get(row.report_id);
      const report = reports.get(key) || { departmentId: row.department, weekId: week.id, reportId: row.report_id, status: "未填写" };
      if(row.section==='confirmation_history'){
        report.confirmationHistory=[...(report.confirmationHistory||[]),{id:row.item_key,report:row.value}].sort((a,b)=>(a.report.confirmedAt||'').localeCompare(b.report.confirmedAt||''));
        reports.set(key,report);continue;
      }
      report[row.item_key] = row.value;
      report.status = uiStatus(row.status);
      report.editorName = row.editor_name;
      if (!report.updatedAt || updatedMs(row) >= Date.parse(report.updatedAt)) report.updatedAt = row.updated_at;
      reports.set(key, report);
    }
    const currentId = reportId(weeks.at(-1));
    return { reports: [...reports.values()], meeting: meetings.get(currentId) || { actions: [], decisions: [], ownerSupport: [] }, updatedAt: latest };
  }

  async function bootstrap(weeks = recentWeeks()) {
    const retained = recentWeeks(weeks);
    try {
      const rows = await fetchRows(retained);
      replaceCachedRows(rows, retained);
      return { ...assemble(rows, retained), source: "cloud", offline: false };
    } catch (error) {
      return { ...assemble(readCachedRows(retained), retained), source: "cache", offline: true, error: error.message };
    }
  }

  function saveLocalDraft(department, record) {
    const id = record.reportId || reportId((window.LITE_DATA?.weeks || []).find((week) => week.id === record.weekId));
    if (!id || !department) return;
    try { localStorage.setItem(localDraftKey(id, department), JSON.stringify({ record, savedAt: new Date().toISOString() })); } catch (_) {}
  }

  function getLocalDraft(department, weekId) {
    const id = reportId((window.LITE_DATA?.weeks || []).find((week) => week.id === weekId));
    if (!id || !department) return null;
    try {
      const value = JSON.parse(localStorage.getItem(localDraftKey(id, department)) || "null");
      return value?.record ? value : null;
    } catch (_) { return null; }
  }

  function clearLocalDraft(department, weekId) {
    const id = reportId((window.LITE_DATA?.weeks || []).find((week) => week.id === weekId));
    if (!id || !department) return;
    try { localStorage.removeItem(localDraftKey(id, department)); } catch (_) {}
  }

  window.CloudSync = {
    cachePrefix: CACHE_PREFIX,
    session,
    reportId,
    on(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async login(role, _password, name) {
      const user = { role: role === "manager" ? "manager" : "editor", name: String(name || "未填写").trim() || "未填写" };
      sessionStorage.setItem(USER_KEY, JSON.stringify(user));
      notify({ type: "session", session: user });
      return user;
    },
    logout() { sessionStorage.removeItem(USER_KEY); notify({ type: "session", session: null }); },
    bootstrap,
    // 保留空实现避免旧页面调用；Lite 不再轮询或自动提交周报。
    startPolling() { return () => {}; },
    async archiveConfirmed(department,record){
      if(record.status!=='已确认')return;
      const fixed={...record,confirmedAt:record.confirmedAt||record.updatedAt||new Date().toISOString(),confirmedBy:record.confirmedBy||record.editorName||session()?.name};
      const rows=reportRows(department,fixed).filter(row=>row.section==='confirmation_history');
      const saved=await upsertRows(rows);mergeCachedRows(saved.map(row=>({...row,_pending:false})));
    },
    cacheReport(department, record) { mergeCachedRows(reportRows(department, record).map((row) => ({ ...row, _pending: true }))); },
    saveLocalDraft,
    getLocalDraft,
    clearLocalDraft,
    cacheMeeting(record) { mergeCachedRows(meetingRows(record).map((row) => ({ ...row, _pending: true }))); },
    async saveReport(department, record, options = {}) {
      const rows = reportRows(department, record);
      mergeCachedRows(rows.map((row) => ({ ...row, _pending: true })));
      const saved = await upsertRows(rows, options);
      mergeCachedRows(saved.map((row) => ({ ...row, _pending: false })));
      const payload = assemble(readCachedRows(recentWeeks()), recentWeeks());
      const report = payload.reports.find((item) => item.departmentId === department && item.weekId === record.weekId) || { ...record, updatedAt: new Date().toISOString() };
      return { report };
    },
    async saveMeeting(record) {
      const rows = meetingRows(record);
      mergeCachedRows(rows.map((row) => ({ ...row, _pending: true })));
      const saved = await upsertRows(rows);
      mergeCachedRows(saved.map((row) => ({ ...row, _pending: false })));
      return { meeting: assemble(saved, recentWeeks()).meeting };
    },
  };
})();
