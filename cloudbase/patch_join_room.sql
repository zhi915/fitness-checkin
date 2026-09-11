-- ============================================================
--  增量补丁 v5.1.1 · 修复「加入房间报外键错误」
-- ------------------------------------------------------------
--  背景：room_members.user_id 有指向 profiles(id) 的外键。
--        若加入者还没推过资料（例如刚匿名登录就输邀请码进房），
--        插入成员关系会报
--          insert or update on table "room_members"
--          violates foreign key constraint "room_members_user_id_fkey"
--        （HTTP 409 / SQLSTATE 23503），表现为「加入房间失败」。
--  修复：在 join_room_by_code 函数里兜底建一条 profiles 记录。
--        该函数是 security definer，写入不受 RLS 影响；on conflict 保证幂等。
--  用法：云开发控制台 → 数据库 → SQL 编辑器 → 粘贴执行。
--        不会重建任何表，已有房间和成员关系不受影响。
-- ============================================================

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

  -- ↓↓↓ 本次新增：资料兜底，消除 23503 外键违规 ↓↓↓
  -- ⚠️ on conflict 后不要写列名：本函数 OUT 参数就叫 id，
  --    写成 on conflict (id) 会报 column reference "id" is ambiguous，整个函数失效。
  insert into public.profiles (id) values (v_uid)
  on conflict do nothing;
  -- ↑↑↑

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
-- 可选：清理「重复创建」留下的孤儿房间
-- ------------------------------------------------------------
-- 修 bug 之前，每次点「创建房间」都会在服务端真的建成一个房间
-- （客户端报 409 失败，但房间已落库）。跑下面这段可以先看看有多少：
--
--   select r.code, r.name, r.created_at,
--          (select count(*) from public.room_members m where m.room_id = r.id) as 成员数
--     from public.rooms r order by r.created_at desc;
--
-- 确认是孤儿（成员数 = 1，只有你自己）后，按邀请码删除：
--
--   delete from public.rooms where code in ('XXXXXX', 'YYYYYY');
--
-- ⚠️ 删掉的房间队友也会看不到，只删你确定没人在用的。
-- ------------------------------------------------------------
