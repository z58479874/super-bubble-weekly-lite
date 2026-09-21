const config = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL || "",
  supabaseKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || "",
};

window.LITE_RUNTIME_CONFIG = config;

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
  await load(`${publicBase}app.js`);
} catch (error) {
  document.querySelector("#app").innerHTML = `<main style="max-width:680px;margin:80px auto;padding:24px;font-family:system-ui;color:#25324a"><h1>看板启动失败</h1><p>${error.message}</p></main>`;
}
