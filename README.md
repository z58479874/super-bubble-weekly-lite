# 超级泡泡周经营看板 Lite

Lite采用“静态经营数据 + 极简共享填写”模式：

- Codex每周读取Excel，生成`public/data.js`。
- 用户打开网页直接看到经营数据，不在浏览器导入Excel。
- Supabase只保留`weekly_report_edits`一张表，用于主管和店长填写的少量文字。
- localStorage即时缓存，停止输入450ms后写入Supabase，失焦立即补保存。
- 页面可见时每4秒轮询；窗口重新获得焦点或网络恢复时立即同步。
- 不使用Edge Function、Realtime、Service Role Key或自建服务器。

## 本地运行

```powershell
Copy-Item .env.example .env.local
pnpm install
pnpm dev
```

`.env.local`：

```dotenv
VITE_SUPABASE_URL=https://你的项目.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=你的publishable或anon key
```

禁止把`service_role`写入前端环境变量。

## Supabase

在Supabase SQL Editor执行：

[`supabase/weekly_report_edits.sql`](supabase/weekly_report_edits.sql)

该脚本只建立`weekly_report_edits`，并通过RLS只开放这张表的匿名读取、新增和更新。删除操作不开放。

## 每周更新

```bash
pnpm data:generate "运营报表.xlsx" "销售办卡.xlsx" "新版直播.xlsx" "新版商品.xlsx" "订单成交明细.xlsx" "核销明细.xlsx" "售后明细.xlsx" "短视频.xlsx"
pnpm build
```

生成器更新`public/data.js`并保留最近4期聚合数据；Excel和原始交易明细不会进入Supabase。

发布目录为`dist/`。完整说明见[`docs/DEPLOYMENT_CN.md`](docs/DEPLOYMENT_CN.md)。
