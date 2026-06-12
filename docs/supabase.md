# Supabase 数据库配置

网站部署在 GitHub Pages，不能自己运行后端服务，所以本项目用 Supabase 保存数据。

## 1. 创建项目

1. 打开 https://supabase.com 并新建 Project。
2. 进入 Project Settings -> API。
3. 复制 `Project URL` 和 `anon public key`。
4. 打开 `config/supabase-config.js`，填入：

```js
window.KITCHEN_SUPABASE_CONFIG = {
  enabled: true,
  url: '你的 Project URL',
  anonKey: '你的 anon public key',
  stateId: 'main'
}
```

## 2. 建表 SQL

进入 Supabase 的 SQL Editor，执行：

```sql
create table if not exists public.kitchen_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.kitchen_audit_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  detail text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.kitchen_state enable row level security;
alter table public.kitchen_audit_logs enable row level security;

drop policy if exists "kitchen_state_public_read" on public.kitchen_state;
drop policy if exists "kitchen_state_public_write" on public.kitchen_state;
drop policy if exists "kitchen_state_public_update" on public.kitchen_state;
drop policy if exists "kitchen_logs_public_read" on public.kitchen_audit_logs;
drop policy if exists "kitchen_logs_public_write" on public.kitchen_audit_logs;

create policy "kitchen_state_public_read"
on public.kitchen_state for select
to anon
using (true);

create policy "kitchen_state_public_write"
on public.kitchen_state for insert
to anon
with check (true);

create policy "kitchen_state_public_update"
on public.kitchen_state for update
to anon
using (true)
with check (true);

create policy "kitchen_logs_public_read"
on public.kitchen_audit_logs for select
to anon
using (true);

create policy "kitchen_logs_public_write"
on public.kitchen_audit_logs for insert
to anon
with check (true);
```

## 3. 使用说明

- 未配置 Supabase 时，页面可以预览初始数据，但加入点菜单、提交订单、编辑菜品、调整库存等保存类操作会被拦截。
- 配好 Supabase 后，顾客端和厨师端会读取同一份数据库状态。
- 操作记录会写入页面内的“厨师工作台 -> 记录”，同时写入 `kitchen_audit_logs`。

## 4. 安全提醒

这个网站是情侣私用工具，上面的 RLS 策略为了部署简单，允许匿名读写。建议：

- GitHub Pages 仓库不要公开宣传。
- Supabase 项目只用于这个小工具。
- 后续如果要多人或公开使用，需要增加登录和更严格的行级权限策略。
