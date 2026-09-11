-- ============================================================
--  健身打卡 App · 腾讯云开发 CloudBase 建表脚本（v5.1.0）
-- ------------------------------------------------------------
--  用法：CloudBase 控制台 → 数据库 → SQL 编辑器 → 新建查询 →
--        把本文件全部内容粘进去 → 执行。可重复执行（幂等）。
--  前置：环境必须是「上海地域 + PostgreSQL 数据库」类型。
-- ------------------------------------------------------------
--  ⚠️ 四处与「通用 Supabase 写法」的关键差异（1 号是踩过的坑，务必知悉）：
--
--   1. auth.uid() 返回 text，不是 uuid ！
--      CloudBase 里它的定义就是：
--        create function auth.uid() returns text as
--        $$ select current_setting('request.jwt.claims', true)::json->>'sub' $$;
--      所以「uuid 列 = auth.uid()」会直接报
--        ERROR: operator does not exist: uuid = text (SQLSTATE 42883)
--      对策：本脚本所有身份列一律用 text —— 官方同样建议 varchar(64)/text，
--      因为 CloudBase 的 auth.users.id 就是 varchar(64)。这与 Supabase 不同。
--
--   2. 策略里刻意不写「TO authenticated」。
--      CloudBase 的 anon 角色 = 「Publishable Key / 匿名身份」，而本 App 的
--      默认登录方式恰恰是匿名登录 —— 一旦限定 TO authenticated，匿名设备账号
--      会被整条策略拒掉。故一律不给角色限定，只用 auth.uid() 表达式判定：
--      未登录时 auth.uid() 为 null，策略自然为假，等同拒绝。
--
--   3. 策略里用 (select auth.uid()) 而不是裸 auth.uid()。
--      裸调用会被 PostgreSQL 按「结果集每行」各求值一次；包成子查询后被识别为
--      常量、只算一次。官方文档称大表下可差数个数量级，成本为零，照做即可。
--
--   4. profiles.id 不建 auth.users 外键、也不在 auth.users 上装触发器 ——
--      认证 schema 由平台托管，各家可访问性不同；改由客户端登录后 upsert 建档
--      （App 侧 cloudInit 已先 pushProfile，时序上早于任何房间操作）。
-- ------------------------------------------------------------
--  设计口径：云端只存「摘要」——某天有没有打卡、完成几项、估算消耗多少。
--           动作明细（每组的重量/次数）永远留在本机 localStorage，不上云。
--  数据模型：
--    profiles       用户资料（id 即令牌里的 sub，匿名与正式账号通用）
--    rooms          组队房间（6 位邀请码）
--    room_members   房间成员关系
--    day_summaries  每人每天的打卡摘要（唯一事实源在本地，这里是投影）
-- ============================================================

-- gen_random_uuid()：PostgreSQL 13+ 内置；更早版本需 pgcrypto。
-- 若报「function gen_random_uuid() does not exist」，取消下一行注释后重跑：
-- create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 0. 重建（一次性）
-- ------------------------------------------------------------
-- 若你的环境里执行过把 id 建成 uuid 的旧版脚本（报 42883），
-- 或想彻底重来，下面四条 drop 会把四张表清空重建。
-- 这样做是安全的：云端只是本机数据的投影，重建后 App 会自动重新上传。
-- 唯一代价：**房间与成员关系会丢失，需要重新建房 / 重新输入邀请码加入**。
-- 首次执行时这些表本来就不存在，drop 无副作用。
drop table if exists public.day_summaries cascade;
drop table if exists public.room_members  cascade;
drop table if exists public.rooms         cascade;
drop table if exists public.profiles      cascade;

-- ------------------------------------------------------------
-- 1. 用户资料
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id          text primary key default auth.uid(),  -- = 令牌中的 sub（text！见文首坑 1）
  nickname    text        not null default '健身伙伴',
  emoji       text        not null default '💪',
  streak      int         not null default 0,   -- 当前连续打卡天数（客户端算好上传）
  total_days  int         not null default 0,   -- 累计打卡天数
  updated_at  timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2. 房间
-- ------------------------------------------------------------
create table if not exists public.rooms (
  id          text primary key default gen_random_uuid()::text,  -- 自家生成的房间号，uuid 转字符串
  code        text        not null unique,       -- 6 位邀请码（大写字母+数字，无易混字符）
  name        text        not null,
  owner       text        not null default auth.uid()
                          references public.profiles(id) on delete cascade,
  goal_kind   text        not null default 'days',  -- 本版仅 days：全队累计打卡天数
  goal_value  int         not null default 30,
  created_at  timestamptz not null default now()
);
create index if not exists rooms_code_idx on public.rooms (upper(code));

-- ------------------------------------------------------------
-- 3. 成员关系
-- ------------------------------------------------------------
create table if not exists public.room_members (
  room_id    text        not null references public.rooms(id)    on delete cascade,
  user_id    text        not null default auth.uid()
                         references public.profiles(id)          on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index if not exists room_members_user_idx on public.room_members (user_id);

-- ------------------------------------------------------------
-- 4. 每日摘要（仅摘要，不含动作明细）
-- ------------------------------------------------------------
create table if not exists public.day_summaries (
  user_id     text        not null default auth.uid()
                          references public.profiles(id) on delete cascade,
  day         date        not null,
  checked     boolean     not null default false,
  done_count  int         not null default 0,
  total       int         not null default 0,
  kcal        int         not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (user_id, day)
);
create index if not exists day_summaries_day_idx on public.day_summaries (day);

-- ------------------------------------------------------------
-- 5. 可见性判定函数（security definer：内部查询绕过 RLS，避免策略自递归）
--    · is_room_member(room)  —— 我是否在该房间内
--    · is_roommate(user)     —— 该用户是否与我在同一房间（组队可见性的核心）
--    参数类型是 text（不是 uuid），与身份列保持一致。
-- ------------------------------------------------------------
create or replace function public.is_room_member(p_room text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.room_members
    where room_id = p_room and user_id = (select auth.uid())
  );
$$;

create or replace function public.is_roommate(target text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select target = (select auth.uid()) or exists (
    select 1
    from public.room_members a
    join public.room_members b on a.room_id = b.room_id
    where a.user_id = (select auth.uid()) and b.user_id = target
  );
$$;

-- ------------------------------------------------------------
-- 6. 建房即自动入队（触发器） + 凭码加入房间 RPC
-- ------------------------------------------------------------
-- 6.1 建房者必须同时成为成员 —— 可见性判定全部依赖成员表，
--     若房主不在成员表里，他自己反而看不到队友的摘要。
--     客户端创建房间后也会显式插一次成员关系，这里用 on conflict do nothing
--     兜底：即使客户端那一步因网络抖动失败，房间与成员关系也不会不一致。
--     （security definer 让触发器的写入不受 RLS 阻拦；即便受阻拦，
--       策略条件 user_id = auth.uid() 对房主本就成立，两条路都通。）
create or replace function public.rooms_autoadd_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.room_members (room_id, user_id)
  values (new.id, new.owner)
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists rooms_autoadd_owner on public.rooms;
create trigger rooms_autoadd_owner
  after insert on public.rooms
  for each row execute function public.rooms_autoadd_owner();

-- 6.2 用邀请码加入；因为调用者此刻还不是成员，
--     普通 RLS 查不到 rooms，所以用 security definer 函数统一处理。
create or replace function public.join_room_by_code(p_code text)
returns table (id text, name text, code text, goal_kind text, goal_value int)
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.rooms;
  v_uid text;
begin
  v_uid := (select auth.uid());
  if v_uid is null or v_uid = '' then raise exception '请先登录'; end if;

  select * into r from public.rooms
   where upper(rooms.code) = upper(trim(p_code))
   limit 1;

  if not found then raise exception '房间不存在，请检查邀请码'; end if;

  insert into public.room_members (room_id, user_id)
  values (r.id, v_uid)
  on conflict do nothing;

  return query select r.id, r.name, r.code, r.goal_kind, r.goal_value;
end;
$$;

-- ------------------------------------------------------------
-- 7. 行级安全（RLS）
--    总原则：自己的数据自己写；同房间成员的**摘要**互相可见。
--    策略不给角色限定（见文首坑 2），一律用 auth.uid() 判定 ——
--    未登录时 auth.uid() 为 null，所有策略自然为假，等同拒绝。
-- ------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.rooms         enable row level security;
alter table public.room_members  enable row level security;
alter table public.day_summaries enable row level security;

-- profiles：登录用户可读（只有昵称/表情/连胜这类摘要），只能改自己
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using ((select auth.uid()) is not null);

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert with check (id = (select auth.uid()));

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- rooms：房主或房内成员可见；只有房主能建/改/删
drop policy if exists rooms_select on public.rooms;
create policy rooms_select on public.rooms
  for select using (owner = (select auth.uid()) or public.is_room_member(id));

drop policy if exists rooms_insert on public.rooms;
create policy rooms_insert on public.rooms
  for insert with check (owner = (select auth.uid()));

drop policy if exists rooms_update on public.rooms;
create policy rooms_update on public.rooms
  for update using (owner = (select auth.uid())) with check (owner = (select auth.uid()));

drop policy if exists rooms_delete on public.rooms;
create policy rooms_delete on public.rooms
  for delete using (owner = (select auth.uid()));

-- room_members：同房间成员互相可见；只能插入自己（建房场景），只能删自己（退房）
drop policy if exists room_members_select on public.room_members;
create policy room_members_select on public.room_members
  for select using (user_id = (select auth.uid()) or public.is_room_member(room_id));

drop policy if exists room_members_insert on public.room_members;
create policy room_members_insert on public.room_members
  for insert with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.rooms r where r.id = room_id and r.owner = (select auth.uid()))
  );

drop policy if exists room_members_delete on public.room_members;
create policy room_members_delete on public.room_members
  for delete using (user_id = (select auth.uid()));

-- day_summaries：只能写自己的；同房间成员的摘要可读
drop policy if exists day_summaries_select on public.day_summaries;
create policy day_summaries_select on public.day_summaries
  for select using (user_id = (select auth.uid()) or public.is_roommate(user_id));

drop policy if exists day_summaries_insert on public.day_summaries;
create policy day_summaries_insert on public.day_summaries
  for insert with check (user_id = (select auth.uid()));

drop policy if exists day_summaries_update on public.day_summaries;
create policy day_summaries_update on public.day_summaries
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ------------------------------------------------------------
-- 8. 表级与函数级授权
--    RLS 只管「行」的过滤，能连上表还得先有表级 GRANT。
--    Supabase 会自动授予，CloudBase 需要显式授予 —— 这里统一给到 PUBLIC
--    （PUBLIC 已涵盖 anon 与 authenticated 两个角色），并额外显式给 anon，
--    因为匿名登录是本 App 的默认路径。四张表都已开 RLS，真正的边界由策略把关。
--    （每段用 exception 包住，兼容「角色不存在」等平台差异，不会中断脚本）
-- ------------------------------------------------------------
do $$
begin
  begin
    grant usage on schema public to public;
    grant select, insert, update, delete on all tables in schema public to public;
    grant usage, select on all sequences in schema public to public;
    grant execute on all functions in schema public to public;
  exception when others then null;
  end;
  begin
    grant usage on schema public to anon;
    grant select, insert, update, delete on all tables in schema public to anon;
    grant execute on all functions in schema public to anon;
  exception when others then null;
  end;
  begin
    grant usage on schema public to authenticated;
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant usage, select on all sequences in schema public to authenticated;
    grant execute on all functions in schema public to authenticated;
  exception when others then null;
  end;
end $$;

-- ------------------------------------------------------------
-- 9. 自检（把下面几行取消注释单独跑一次，可确认结果）
-- ------------------------------------------------------------
-- 9.1 四张表都在、RLS 都开着
-- select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename;
-- 9.2 身份列的类型必须是 text（若显示 uuid，说明旧脚本残留，需重跑本文件）
-- select table_name, column_name, data_type from information_schema.columns
--  where table_schema = 'public' and column_name in ('id','owner','user_id') order by 1,2;
-- 9.3 策略都建好了
-- select tablename, policyname from pg_policies where schemaname = 'public' order by 1,2;
-- 9.4 确认本环境的 auth.* 辅助函数齐备（应有 uid / role / jwt / email）
-- select proname from pg_proc where pronamespace = 'auth'::regnamespace order by 1;
