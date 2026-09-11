/* ============================================================
   cloudbase/schema.sql 的离线验证器
   ------------------------------------------------------------
   为什么需要它：SQL 的错误是「静默」的 —— 前端 347 项测试全绿也照不出
   RLS 策略写错、列类型不匹配。本项目已踩过一次：
   照搬 Supabase 的 uuid 列 + auth.uid()（CloudBase 返回 text），
   在控制台报 `operator does not exist: uuid = text (SQLSTATE 42883)`。
   于是这里用一个本地 WASM PostgreSQL（PGlite）把脚本真跑一遍。

   它做两件事：
     1. 在本地 PostgreSQL 里执行 cloudbase/schema.sql，验证语法与类型；
     2. 模拟两个用户真实走一遍 RLS：建档 → 建房 → 入房 → 跨用户可见性
        → 越权写入必须被拒 → 未登录必须全拒。

   用法（PGlite 是可选的开发期依赖，装在托管的 node workspace 里）：
     NODE_PATH="C:/Users/Lenovo/.workbuddy/binaries/node/workspace/node_modules" \
       "C:/Users/Lenovo/.workbuddy/binaries/node/versions/22.22.2-3/node.exe" tools/check_schema.js
   未安装 PGlite 时本脚本会明确跳过（退出码 0），不会误报失败。
   安装：cd <托管 workspace> && npm install @electric-sql/pglite

   注意：本脚本不参与 run_all_tests.js —— 应用本身保持「零依赖」，
   这里只是开发期的一次性校验工具。
   ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SCHEMA = path.join(ROOT, "cloudbase", "schema.sql");

let PGlite = null;
try {
  PGlite = require("@electric-sql/pglite").PGlite;
} catch (e) {
  console.log("跳过：未安装 @electric-sql/pglite（可选开发期依赖）。");
  console.log("如需校验，先执行：cd <托管 node workspace> && npm install @electric-sql/pglite");
  process.exit(0);
}
if (!PGlite) { console.log("跳过：@electric-sql/pglite 的导出结构与预期不符。"); process.exit(0); }

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (detail ? "   → " + detail : "")); }
}
const UID_A = "11111111-1111-4111-8111-111111111111";
const UID_B = "22222222-2222-4222-8222-222222222222";

async function setUser(db, uid) {
  await db.exec("set role authenticated;");
  await db.query("select set_config('request.jwt.claims', $1, false)",
                 [JSON.stringify({ sub: uid, role: "authenticated" })]);
}
async function resetUser(db) { await db.exec("reset role;"); }
async function scalar(db, sql, params) {
  const r = await db.query(sql, params);
  return r.rows.length ? Number(Object.values(r.rows[0])[0]) : NaN;
}

(async () => {
  const db = new PGlite();

  /* CloudBase 平台自带 auth schema 与 auth.uid()，这里照官方定义复原。
     关键：返回 text（不是 Supabase 的 uuid）—— 这正是被验证的那个差异。 */
  await db.exec(`
    create schema if not exists auth;
    create or replace function auth.uid() returns text language sql stable as $$
      select current_setting('request.jwt.claims', true)::json->>'sub'
    $$;
    create role anon nologin;
    create role authenticated nologin;
  `);

  console.log("【1】执行 cloudbase/schema.sql");
  try {
    await db.exec(fs.readFileSync(SCHEMA, "utf8"));
    ok("整体执行无报错", true);
  } catch (e) {
    ok("整体执行无报错", false, e.message);
    console.log("\n结果: " + pass + " 通过, " + fail + " 失败");
    process.exit(1);
  }

  console.log("【2】结构断言");
  const tables = (await db.query(
    "select tablename, rowsecurity from pg_tables where schemaname='public' order by tablename")).rows;
  ok("四张表都在", tables.length === 4, tables.map(t => t.tablename).join(","));
  ok("四张表都开了 RLS", tables.every(r => r.rowsecurity === true));

  const cols = (await db.query(
    "select table_name, column_name, data_type from information_schema.columns " +
    "where table_schema='public' and column_name in ('id','owner','user_id') order by 1,2")).rows;
  ok("身份列全部是 text（不是 uuid，CloudBase 的 auth.uid() 返回 text）",
     cols.length === 5 && cols.every(r => r.data_type === "text"),
     cols.map(c => c.table_name + "." + c.column_name + ":" + c.data_type).join(" "));

  const pols = (await db.query(
    "select tablename, policyname from pg_policies where schemaname='public'")).rows;
  ok("策略共 13 条已建立", pols.length === 13, "实际 " + pols.length + " 条");

  const fns = (await db.query(
    "select proname from pg_proc where pronamespace='public'::regnamespace")).rows.map(r => r.proname);
  ok("三个函数都在（is_room_member / is_roommate / join_room_by_code / rooms_autoadd_owner）",
     ["is_room_member", "is_roommate", "join_room_by_code", "rooms_autoadd_owner"].every(n => fns.indexOf(n) !== -1),
     fns.join(","));

  console.log("【3】用户 A：建档 → 建房 → 写摘要");
  await setUser(db, UID_A);
  const aid = (await db.query("insert into public.profiles (nickname) values ('小明') returning id")).rows[0].id;
  ok("建档成功且 id 自动取自 auth.uid()", aid === UID_A);
  const room = (await db.query(
    "insert into public.rooms (code, name) values ('K7X2QM','晨练小分队') returning id, owner")).rows[0];
  ok("建房成功且 owner 自动取自 auth.uid()", room.owner === UID_A);
  ok("触发器让房主自动成为成员", (await scalar(db,
     "select count(*) from public.room_members where room_id = $1", [room.id])) === 1);
  await db.query("insert into public.day_summaries (day, checked, done_count, total, kcal) " +
                 "values ('2026-09-10', true, 5, 5, 250)");
  ok("A 能读到自己的摘要", (await scalar(db,
     "select count(*) from public.day_summaries where user_id = $1", [UID_A])) === 1);

  console.log("【4】用户 B：入房前互相不可见");
  await resetUser(db);
  await setUser(db, UID_B);
  await db.query("insert into public.profiles (nickname) values ('阿强')");
  ok("B 未入房时看不到 A 的摘要", (await scalar(db, "select count(*) from public.day_summaries")) === 0);
  ok("B 未入房时看不到 A 的房间", (await scalar(db, "select count(*) from public.rooms")) === 0);

  console.log("【5】B 凭邀请码入房（RPC）");
  let joined = null;
  try { joined = (await db.query("select * from public.join_room_by_code($1)", ["k7x2qm"])).rows[0]; }
  catch (e) { joined = { err: e.message }; }
  ok("RPC 凭码入房成功（大小写不敏感）", !!joined && !joined.err && joined.code === "K7X2QM");
  ok("入房后 B 能看到 A 的摘要（组队可见性生效）",
     (await scalar(db, "select count(*) from public.day_summaries")) === 1);
  ok("入房后 B 能看到房间", (await scalar(db, "select count(*) from public.rooms")) === 1);
  ok("入房后 B 能看到 2 个成员", (await scalar(db, "select count(*) from public.room_members")) === 2);

  console.log("【6】越权必须失败");
  let wrongCode = "";
  try { await db.query("select * from public.join_room_by_code('ZZZZZZ')"); } catch (e) { wrongCode = e.message; }
  ok("错误邀请码被拒绝", /房间不存在/.test(wrongCode));

  let crossWrite = "";
  try {
    await db.query("insert into public.day_summaries (user_id, day, kcal) values ($1,'2026-09-11',999)", [UID_A]);
  } catch (e) { crossWrite = e.message; }
  ok("不能替别人写摘要（被 RLS 拒绝）", /row-level security|violates/i.test(crossWrite), crossWrite);

  const before = await scalar(db, "select count(*) from public.day_summaries where user_id = $1", [UID_A]);
  await db.query("update public.day_summaries set kcal = 0 where user_id = $1", [UID_A]);
  const after = await scalar(db,
    "select count(*) from public.day_summaries where user_id = $1 and kcal = 0", [UID_A]);
  ok("不能改别人的摘要（影响 0 行）", before === 1 && after === 0);

  await db.query("delete from public.rooms where code = 'K7X2QM'");
  ok("非房主不能删房间（影响 0 行）", (await scalar(db, "select count(*) from public.rooms")) === 1);

  console.log("【7】未登录（claims 无 sub）一律拒绝");
  await resetUser(db);
  await db.exec("set role authenticated;");
  await db.query("select set_config('request.jwt.claims', $1, false)", ["{}"]);
  ok("读不到任何摘要", (await scalar(db, "select count(*) from public.day_summaries")) === 0);
  ok("读不到任何房间", (await scalar(db, "select count(*) from public.rooms")) === 0);
  let wrote = false;
  try { await db.query("insert into public.day_summaries (day) values ('2026-09-12')"); wrote = true; }
  catch (e) { wrote = false; }
  ok("写不进去", wrote === false);
  await resetUser(db);

  console.log("\n结果: " + pass + " 通过, " + fail + " 失败");
  await db.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log("异常: " + (e && e.stack || e)); process.exit(1); });
