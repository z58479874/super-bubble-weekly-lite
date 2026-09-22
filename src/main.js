const config = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL || "",
  supabaseKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || "",
};

window.LITE_RUNTIME_CONFIG = config;

const app = document.querySelector("#app");
const showStartupFailure = (error) => {
  // 已经渲染出主页面时，不用后续的局部异常覆盖用户正在查看的看板。
  if (!app || app.children.length) return;
  const detail = error instanceof Error ? error.message : String(error || "未知错误");
  app.innerHTML = `<main style="max-width:680px;margin:80px auto;padding:24px;font-family:system-ui;color:#25324a"><h1>看板暂时无法启动</h1><p>页面加载过程中出现异常，经营数据和已保存周报没有被修改。</p><pre style="white-space:pre-wrap;background:#f5f7fb;padding:12px;border-radius:8px">${detail}</pre><p>请刷新页面；如仍无法打开，请联系看板维护人。</p></main>`;
};
window.addEventListener("error", (event) => showStartupFailure(event.error || event.message));
window.addEventListener("unhandledrejection", (event) => showStartupFailure(event.reason));

const publicBase = import.meta.env.BASE_URL;

const load = (src) => new Promise((resolve, reject) => {
  const script = document.createElement("script");
  script.src = src;
  script.defer = true;
  script.onload = resolve;
  script.onerror = () => reject(new Error(`无法加载 ${src}`));
  document.body.append(script);
});

try {
  await load(`${publicBase}data.js`);
  await load(`${publicBase}cloud-client.js`);
  await load(`${publicBase}report-items.js`);
  await load(`${publicBase}front-report.js`);
  await load(`${publicBase}douyin-topic.js`);
  await load(`${publicBase}weekly-insights.js`);
  await load(`${publicBase}app.js`);
} catch (error) {
  showStartupFailure(error);
}
