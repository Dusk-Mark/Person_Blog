-- NILING_DUSK 博客数据库一键初始化脚本。
-- 1. 先在 Supabase Authentication > Users 中创建管理员账号。
-- 2. 修改本文件末尾 admin_email 的值。
-- 3. 在 Supabase SQL Editor 中以 postgres 角色执行整份脚本。
-- 本脚本可以重复执行，不会删除现有文章或覆盖文章内容。
-- 访客只能读取已发布文章；草稿和写入操作仅管理员可用。
begin;

create table if not exists public.blog_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.blog_admins enable row level security;
revoke all on public.blog_admins from anon, authenticated;
grant select on public.blog_admins to authenticated;
drop policy if exists "Read own admin membership" on public.blog_admins;
create policy "Read own admin membership" on public.blog_admins
  for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.is_blog_admin()
returns boolean language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blog_admins where user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_blog_admin() from public, anon;
grant execute on function public.is_blog_admin() to authenticated;

create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  excerpt text not null default '' check (char_length(excerpt) <= 500),
  category text not null default '软件工程' check (category in ('加密货币', '美股', '软件工程', '生活随笔')),
  content text not null default '' check (char_length(content) <= 200000),
  cover_url text not null default '' check (cover_url = '' or cover_url ~ '^https://'),
  status text not null default 'draft' check (status in ('draft', 'published')),
  author_id uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.blog_posts enable row level security;
revoke all on public.blog_posts from anon, authenticated;
grant select, insert, update, delete on public.blog_posts to authenticated;
grant select on public.blog_posts to anon;
drop policy if exists "Public read published posts" on public.blog_posts;
create policy "Public read published posts" on public.blog_posts
  for select to anon, authenticated using (status = 'published');
drop policy if exists "Admins manage posts" on public.blog_posts;
create policy "Admins manage posts" on public.blog_posts
  for all to authenticated
  using ((select public.is_blog_admin()))
  with check ((select public.is_blog_admin()));

create or replace function public.touch_blog_post()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists blog_post_updated on public.blog_posts;
create trigger blog_post_updated before update on public.blog_posts
for each row execute function public.touch_blog_post();
create index if not exists blog_posts_updated_idx on public.blog_posts(updated_at desc);

create table if not exists public.portfolio_holdings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source text not null check (source in ('gate', 'manual')),
  asset text not null check (asset = upper(asset) and char_length(asset) between 2 and 20),
  account text not null default 'spot',
  amount numeric not null default 0 check (amount >= 0),
  avg_price_usd numeric check (avg_price_usd is null or avg_price_usd >= 0),
  price_usd numeric check (price_usd is null or price_usd >= 0),
  value_usd numeric generated always as (case when price_usd is null then null else amount * price_usd end) stored,
  is_public boolean not null default true,
  synced_at timestamptz not null default now(),
  unique (owner_id, source, account, asset)
);
alter table public.portfolio_holdings add column if not exists entry_price_usd numeric check (entry_price_usd is null or entry_price_usd >= 0);
alter table public.portfolio_holdings add column if not exists mark_price_usd numeric check (mark_price_usd is null or mark_price_usd >= 0);
alter table public.portfolio_holdings add column if not exists leverage numeric check (leverage is null or leverage > 0);
alter table public.portfolio_holdings enable row level security;
revoke all on public.portfolio_holdings from anon, authenticated;
grant select on public.portfolio_holdings to anon, authenticated;
grant insert, update, delete on public.portfolio_holdings to authenticated;
drop policy if exists "Public read public holdings" on public.portfolio_holdings;
create policy "Public read public holdings" on public.portfolio_holdings
  for select to anon, authenticated using (is_public = true);
drop policy if exists "Admins manage holdings" on public.portfolio_holdings;
create policy "Admins manage holdings" on public.portfolio_holdings
  for all to authenticated using ((select public.is_blog_admin()))
  with check ((select public.is_blog_admin()));
create index if not exists portfolio_holdings_public_idx on public.portfolio_holdings(is_public, synced_at desc);

-- 图床：封面链接公开可访问，草稿数据仍然仅管理员可读取。
-- 只允许 JPEG / PNG / WebP / GIF，最大 5MB，禁止 SVG。
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('blog-covers', 'blog-covers', true, 5242880,
  array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Admins upload blog covers" on storage.objects;
create policy "Admins upload blog covers" on storage.objects
for insert to authenticated with check (
  bucket_id = 'blog-covers' and (select public.is_blog_admin())
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
drop policy if exists "Admins read blog covers" on storage.objects;
create policy "Admins read blog covers" on storage.objects
for select to authenticated using (
  bucket_id = 'blog-covers' and (select public.is_blog_admin())
);
drop policy if exists "Admins delete blog covers" on storage.objects;
create policy "Admins delete blog covers" on storage.objects
for delete to authenticated using (
  bucket_id = 'blog-covers' and (select public.is_blog_admin())
);

-- 管理员授权。开源使用者只需修改这里的邮箱。
-- 如果该邮箱尚未创建为 Auth 用户，脚本会给出 NOTICE，其他初始化仍会成功。
do $admin_setup$
declare
  admin_email constant text := 'person_blog@nilingdusk.com';
  admin_user_id uuid;
begin
  select id into admin_user_id
  from auth.users
  where lower(email) = lower(admin_email)
  limit 1;

  if admin_user_id is null then
    raise notice '未找到 Auth 用户 %。请先创建该用户，再重新执行本脚本。', admin_email;
  else
    insert into public.blog_admins (user_id)
    values (admin_user_id)
    on conflict (user_id) do nothing;
    raise notice '管理员权限已授予 %。', admin_email;
  end if;
end
$admin_setup$;

commit;

-- 可选：撤销管理员时单独执行，并替换邮箱。
-- delete from public.blog_admins
-- where user_id = (select id from auth.users where lower(email) = lower('管理员邮箱'));
