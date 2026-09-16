-- Lite唯一共享表。经营数字仍在静态data.js中，不进入Supabase。
create table if not exists public.weekly_report_edits (
  report_id text not null check (report_id ~ '^[0-9]{8}-[0-9]{8}$'),
  department text not null check (department in ('ops', 'front', 'admin', 'meeting')),
  section text not null check (char_length(section) between 1 and 64),
  item_key text not null check (char_length(item_key) between 1 and 128),
  value jsonb not null default 'null'::jsonb,
  status text not null default 'draft' check (status in ('empty', 'draft', 'confirmed')),
  editor_name text not null default '' check (char_length(editor_name) <= 80),
  updated_at timestamptz not null default now(),
  primary key (report_id, department, section, item_key),
  check (octet_length(value::text) <= 200000)
);

create index if not exists weekly_report_edits_report_idx
  on public.weekly_report_edits (report_id, department, updated_at desc);

alter table public.weekly_report_edits enable row level security;

revoke all on table public.weekly_report_edits from anon, authenticated;
grant select, insert, update on table public.weekly_report_edits to anon, authenticated;

drop policy if exists "lite_public_read" on public.weekly_report_edits;
create policy "lite_public_read"
  on public.weekly_report_edits for select
  to anon, authenticated
  using (true);

drop policy if exists "lite_public_insert" on public.weekly_report_edits;
create policy "lite_public_insert"
  on public.weekly_report_edits for insert
  to anon, authenticated
  with check (
    department in ('ops', 'front', 'admin', 'meeting')
    and report_id ~ '^[0-9]{8}-[0-9]{8}$'
  );

drop policy if exists "lite_public_update" on public.weekly_report_edits;
create policy "lite_public_update"
  on public.weekly_report_edits for update
  to anon, authenticated
  using (true)
  with check (
    department in ('ops', 'front', 'admin', 'meeting')
    and report_id ~ '^[0-9]{8}-[0-9]{8}$'
  );

-- 不授予DELETE权限；最近4周由前端report_id过滤，更早记录不加载。
-- 如需清理，由Codex/管理员在Supabase SQL Editor中按report_id执行。
