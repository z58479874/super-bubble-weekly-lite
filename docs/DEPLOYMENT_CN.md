# Lite静态看板 + Supabase单表部署说明

## 1. 架构

```text
每周Excel
  → Codex标准化、校验与聚合
  → public/data.js
  → 静态网站

主管/店长填写
  → localStorage立即缓存
  → 450ms防抖或失焦保存
  → Supabase PostgREST
  → weekly_report_edits
```

经营数据不进入Supabase。网页只携带计算后的周指标、前厅数据、抖音数据、趋势和经营结论。

## 2. 唯一Supabase表

执行[`../supabase/weekly_report_edits.sql`](../supabase/weekly_report_edits.sql)。

字段：

- `report_id`：如`20260907-20260913`
- `department`：`ops`、`front`、`admin`、`meeting`
- `section`
- `item_key`
- `value`：JSONB
- `status`：`empty`、`draft`、`confirmed`
- `editor_name`
- `updated_at`

唯一键：`report_id + department + section + item_key`。

RLS只允许anon/authenticated读取、新增、更新这一张表；不授予删除权限。前端只使用publishable/anon key。

## 3. 部门字段映射

| 页面字段 | section |
|---|---|
| 上周关键结果 | `key_result` |
| 本部门前三项问题 | `problems` |
| 跨部门/店长支持 | `support_requests` |
| 本周重点工作 | `weekly_actions` |
| 上周未完成事项 | `unfinished_items` |
| 主管建议 | `supervisor_suggestion` |
| 现场专项复盘 | `special_reviews` |
| 草稿/确认信息 | `meta` |

周会填写使用`department=meeting`，section分别为：

- `manager_key_actions`
- `manager_decisions`
- `owner_support`

## 4. localStorage

每周一个缓存键：

```text
super_bubble_lite_weekly_report_edits_v1:<report_id>
```

例如：

```text
super_bubble_lite_weekly_report_edits_v1:20260907-20260913
```

编辑人会话仅保存在当前标签页的sessionStorage：

```text
super_bubble_weekly_lite_editor_v1
```

## 5. 保存和读取

填写时：

1. 输入立即写localStorage。
2. 停止输入450ms后POST upsert到PostgREST。
3. 输入框失焦时立即补保存。
4. “保存草稿”和“标记已确认”继续保留。

刷新时：

1. 优先GET Supabase。
2. 云端成功则覆盖本机缓存。
3. 云端失败则读取localStorage，并显示“离线 / 本机缓存”。

同步时：

- 页面可见时每4秒GET一次最近4个`report_id`。
- 页面重新获得焦点时立即同步。
- 网络恢复时立即同步。
- 不使用Realtime/WebSocket。

## 6. 最近4周

`public/data.js`最多保留最近4期，并为每期生成`reportId`。前端查询Supabase时只查询这4个ID，更早周次不展示。

由于文字量很小，默认不开放前端删除。需要物理清理时，由Codex或管理员在SQL Editor删除最旧`report_id`，避免匿名用户获得删除权限。

## 7. 静态部署

```bash
pnpm build
```

发布目录：`dist/`。

可部署到GitHub Pages、国内对象存储静态网站或其他普通静态托管。国内员工使用前，需要分别实测：

1. 静态域名是否稳定打开。
2. 浏览器能否访问Supabase项目域名。
3. 浏览器A保存后，浏览器B在4秒内或刷新后能看到。
4. 断网填写后本机刷新是否仍能看到缓存。

注意：GitHub Pages和Supabase在中国大陆的网络稳定性无法由代码保证。若实测不稳定，页面仍可静态打开，但共享文字保存应迁移到大陆可达的兼容PostgREST/KV服务。

## 8. 店长每周实际步骤

1. 把Excel交给Codex。
2. Codex生成新的`public/data.js`并核对经营口径。
3. Codex构建并发布`dist/`。
4. 主管打开固定网址填写，内容自动保存。
5. 店长刷新周会页查看最新部门内容。

门店人员不需要上传Excel，不需要维护服务器，也不需要操作数据库。
