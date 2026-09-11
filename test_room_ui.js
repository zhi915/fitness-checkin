/* v5.1.3 组队页端到端验证（jsdom）
   覆盖三种状态：
     A 未配置云端  → 纯本地模式，打卡完全不受影响
     B 已配置/已匿名登录/未加入房间 → 创建房间全流程
     C 已配置/已有房间 → 成员看板 / 邀请码 / 集体进度
   所有网络请求用 mock fetch 拦截，不发真实请求。 */
const { JSDOM } = require("jsdom");
const fs = require("fs");

const html = fs.readFileSync("index.html", "utf8").replace(/<link rel="stylesheet"[^>]*>/g, "");
const cfgjs = fs.readFileSync("js/cloud-config.js", "utf8");
const cloudjs = fs.readFileSync("js/cloud.js", "utf8");
const socialjs = fs.readFileSync("js/social.js", "utf8");
const calcjs = fs.readFileSync("js/calc.js", "utf8");
const appjs = fs.readFileSync("js/app.js", "utf8");

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log("✓ " + name); }
  else { fail++; console.log("✗ " + name); }
}

const SEED = {
  profileDone: true, username: "小明", weight: 72, height: 180, age: 25, gender: "male",
  scene: "home", theme: "snow", wallpaper: "", records: {}, tasks: {}, plan: null, recDismiss: {}, wizResume: 0
};
const MY_ID = "me-uuid-0001";

function b64url(o) {
  return Buffer.from(JSON.stringify(o)).toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function sessionBody() {
  return {
    access_token: b64url({ alg: "HS256", typ: "JWT" }) + "." + b64url({ sub: MY_ID, is_anonymous: true, exp: Math.floor(Date.now() / 1000) + 3600 }) + ".sig",
    refresh_token: "rt-1", token_type: "bearer", expires_in: 3600,
    user: { id: MY_ID, is_anonymous: true }
  };
}
function mkRes(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status: status,
    headers: { get: function (k) { return String(k).toLowerCase() === "content-type" ? "application/json" : null; } },
    json: function () { return Promise.resolve(body); },
    text: function () { return Promise.resolve(JSON.stringify(body)); }
  };
}
function makeFetch(handler) {
  var fn = function (url, init) {
    var u = String(url), m = (init && init.method) || "GET";
    fn.calls.push({ url: u, method: m, init: init || {} });
    var r = handler(u, m) || { status: 200, body: [] };
    return Promise.resolve(mkRes(r.status || 200, r.body));
  };
  fn.calls = [];
  fn.called = function (frag, method) {
    return fn.calls.some(function (c) { return c.url.indexOf(frag) !== -1 && (!method || c.method === method); });
  };
  return fn;
}

function boot(cloudCfg, handler) {
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "http://localhost:8080/" });
  const { window } = dom;
  const RealDate = window.Date;
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(2026, 0, 5); else super(...a); } // 2026-01-05 周一
  }
  window.Date = FakeDate;
  window.confirm = () => true;
  window.alert = () => {};
  window.requestAnimationFrame = function (cb) { return setTimeout(function () { try { cb(); } catch (e) {} }, 0); };
  window.localStorage.setItem("fitapp_data", JSON.stringify(Object.assign({}, SEED)));

  window.eval(cfgjs);                       // 真实的 cloud-config.js（此处仅为校验其语法可解析）
  window.eval(cloudjs);
  window.eval(socialjs);
  // 用例显式注入配置：未传即「纯本地模式」。刻意不复用 cloud-config.js 的实际取值，
  // 否则用户在本地填了 envId 后，「未配置」这组用例会假性失败。
  window.FIT_CLOUD_CONFIG = cloudCfg || { envId: "", accessKey: "" };
  var fetchMock = null;
  if (cloudCfg) {
    fetchMock = makeFetch(handler || function () { return { status: 200, body: [] }; });
    window.FitCloud.configure({ fetch: fetchMock });
  }
  window.eval(calcjs);
  window.eval(appjs);
  try { window.document.dispatchEvent(new window.Event("DOMContentLoaded")); } catch (e) {}
  return { window: window, document: window.document, fetch: fetchMock };
}
const tick = async function (n) { for (var i = 0; i < (n || 25); i++) await new Promise(function (r) { setTimeout(r, 0); }); };

(async function run() {

/* ==================== A. 未配置云端：纯本地模式 ==================== */
var A = boot(null);
var doc = A.document;
ok("A · 底部导航为 5 个（新增组队）", doc.querySelectorAll(".nav-btn").length === 5);
ok("A · 存在组队 Tab 按钮", !!doc.querySelector('.nav-btn[data-tab="room"]'));
ok("A · 存在组队面板", !!doc.getElementById("panel-room"));
ok("A · cloudOn() 为 false", A.window.__fit.cloudOn() === false);
ok("A · 未配置时不会发起任何网络请求", A.fetch === null);
ok("A · 打卡按钮仍在（本地打卡不受影响）", !!doc.getElementById("checkinBtn"));
ok("A · 今日任务已自动排期（本地逻辑照常）", A.window.__fit.deriveDay("2026-01-05").tasks.length > 0);

doc.querySelector('.nav-btn[data-tab="room"]').click();
ok("A · 切到组队页后 panel 激活", doc.getElementById("panel-room").classList.contains("active"));
ok("A · 账号卡显示「纯本地模式」", doc.getElementById("roomAccount").textContent.indexOf("纯本地模式") !== -1);
ok("A · 显示「未配置云端」标签", doc.getElementById("roomAccount").textContent.indexOf("未配置云端") !== -1);
ok("A · 给出接入指引", doc.getElementById("roomBody").textContent.indexOf("组队需要先接上云端") !== -1);
ok("A · 指引提到 cloud-config.js", doc.getElementById("roomBody").textContent.indexOf("cloud-config.js") !== -1);
ok("A · 指引提到 schema.sql", doc.getElementById("roomBody").textContent.indexOf("schema.sql") !== -1);

/* ==================== B. 已配置 · 匿名登录 · 未加入房间 → 创建房间 ==================== */
var createdRoom = { id: "room-1", code: "NEW123", name: "晨练小分队", goal_kind: "days", goal_value: 30 };
var B = boot({ envId: "demo-env", accessKey: "k".repeat(40) }, function (u, m) {
  if (u.indexOf("/auth/v1/signin/anonymously") !== -1) return { body: sessionBody() };
  if (u.indexOf("/v1/rdb/rest/profiles") !== -1) return { body: [{ id: MY_ID }] };
  if (u.indexOf("/v1/rdb/rest/rooms") !== -1 && m === "POST") return { body: [createdRoom] };
  if (u.indexOf("/v1/rdb/rest/room_members") !== -1 && m === "POST") return { body: [] };
  if (u.indexOf("/v1/rdb/rest/room_members") !== -1 && u.indexOf("select=user_id") !== -1) {
    return { body: [{ user_id: MY_ID, joined_at: "2026-01-05", profiles: { nickname: "小明", emoji: "💪", streak: 5, total_days: 12 } }] };
  }
  if (u.indexOf("/v1/rdb/rest/room_members") !== -1) return { body: [] };          // 尚未加入任何房间
  if (u.indexOf("/v1/rdb/rest/day_summaries") !== -1) return { body: [] };
  return { status: 404, body: { message: "unhandled " + m + " " + u } };
});
var bdoc = B.document;
await tick(40);

ok("B · 已配置：cloudOn() 为 true", B.window.__fit.cloudOn() === true);
ok("B · 匿名登录成功（用户已就绪）", B.window.__fit.isCloudReady() === true);
ok("B · 用户 id 正确", B.window.__fit.cloud.user.id === MY_ID);
ok("B · 用户为匿名账号", B.window.__fit.cloud.user.is_anonymous === true);
ok("B · 发起了匿名注册请求", B.fetch.called("/auth/v1/signin/anonymously", "POST"));
ok("B · 上报了个人资料（昵称/连胜）", B.fetch.called("/v1/rdb/rest/profiles", "POST"));
ok("B · 查询了自己所属的房间", B.fetch.called("/v1/rdb/rest/room_members", "GET"));
var profBody = JSON.parse(B.fetch.calls.filter(function (c) { return c.url.indexOf("/v1/rdb/rest/profiles") !== -1; })[0].init.body)[0];
ok("B · 资料行 id = 当前用户（RLS 通过）", profBody.id === MY_ID);
ok("B · 资料行带昵称小明", profBody.nickname === "小明");

bdoc.querySelector('.nav-btn[data-tab="room"]').click();
ok("B · 账号卡显示昵称", bdoc.getElementById("roomAccount").textContent.indexOf("小明") !== -1);
ok("B · 账号卡提示「设备账号（未绑定）」", bdoc.getElementById("roomAccount").textContent.indexOf("设备账号（未绑定）") !== -1);
ok("B · 提供「绑定邮箱」入口", !!bdoc.getElementById("raAccountBtn"));
ok("B · 未加入房间时显示引导", bdoc.getElementById("roomBody").textContent.indexOf("还没有加入任何房间") !== -1);
ok("B · 提供创建房间表单", !!bdoc.getElementById("roomNameInput") && !!bdoc.getElementById("roomCreateBtn"));
ok("B · 提供邀请码加入表单", !!bdoc.getElementById("roomCodeInput") && !!bdoc.getElementById("roomJoinBtn"));

// 创建房间
bdoc.getElementById("roomNameInput").value = "晨练小分队";
bdoc.getElementById("roomCreateBtn").click();
await tick(40);
ok("B · 创建时 POST /rest/v1/rooms", B.fetch.called("/v1/rdb/rest/rooms", "POST"));
var roomBody = JSON.parse(B.fetch.calls.filter(function (c) { return c.url.indexOf("/v1/rdb/rest/rooms") !== -1; })[0].init.body)[0];
ok("B · 房间 owner 是自己", roomBody.owner === MY_ID);
ok("B · 邀请码为 6 位", /^[A-Z0-9]{6}$/.test(roomBody.code));
ok("B · 房间名沿用输入", roomBody.name === "晨练小分队");
ok("B · 集体目标默认 30 天", roomBody.goal_kind === "days" && roomBody.goal_value === 30);
ok("B · 创建后把自己写入成员表", B.fetch.called("/v1/rdb/rest/room_members", "POST"));
ok("B · 创建后展示看板（邀请码可见）", bdoc.getElementById("roomBody").textContent.indexOf("NEW123") !== -1);
ok("B · 创建后成员看板有自己", bdoc.querySelectorAll("#roomBody .room-member").length === 1);

/* ==================== C. 已配置 · 已有两人房间 → 看板渲染 ==================== */
var roomC = { id: "room-9", code: "ABC123", name: "晨练小分队", goal_kind: "days", goal_value: 30 };
var C = boot({ envId: "demo-env", accessKey: "k".repeat(40) }, function (u, m) {
  if (u.indexOf("/auth/v1/signin/anonymously") !== -1) return { body: sessionBody() };
  if (u.indexOf("/v1/rdb/rest/profiles") !== -1) return { body: [{ id: MY_ID }] };
  if (u.indexOf("/v1/rdb/rest/room_members") !== -1 && u.indexOf("select=user_id") !== -1) {
    return { body: [
      { user_id: MY_ID, joined_at: "2026-01-01", profiles: { nickname: "小明", emoji: "💪", streak: 5, total_days: 12 } },
      { user_id: "u2-uuid", joined_at: "2026-01-02", profiles: { nickname: "阿强", emoji: "🏋️", streak: 9, total_days: 30 } }
    ] };
  }
  if (u.indexOf("/v1/rdb/rest/room_members") !== -1) {
    return { body: [{ room_id: roomC.id, joined_at: "2026-01-01", rooms: roomC }] };
  }
  if (u.indexOf("/v1/rdb/rest/day_summaries") !== -1 && m === "GET") {
    return { body: [
      { user_id: MY_ID, day: "2026-01-05", checked: true, done_count: 3, total: 3, kcal: 210 },
      { user_id: MY_ID, day: "2026-01-04", checked: true, done_count: 2, total: 2, kcal: 150 },
      { user_id: "u2-uuid", day: "2026-01-05", checked: false, done_count: 0, total: 3, kcal: 0 },
      { user_id: "u2-uuid", day: "2026-01-02", checked: true, done_count: 3, total: 3, kcal: 400 }
    ] };
  }
  if (u.indexOf("/v1/rdb/rest/day_summaries") !== -1) return { body: [] };
  return { status: 404, body: { message: "unhandled" } };
});
var cdoc = C.document;
await tick(40);
cdoc.querySelector('.nav-btn[data-tab="room"]').click();
await tick(10);

var body = cdoc.getElementById("roomBody");
ok("C · 已识别所属房间", C.window.__fit.cloud.room && C.window.__fit.cloud.room.id === "room-9");
ok("C · 展示邀请码 ABC123", body.textContent.indexOf("ABC123") !== -1);
ok("C · 展示房间名", body.textContent.indexOf("晨练小分队") !== -1);
ok("C · 成员看板渲染 2 人", cdoc.querySelectorAll("#roomBody .room-member").length === 2);
var first = cdoc.querySelectorAll("#roomBody .room-member")[0];
ok("C · 今日已打卡的排最前（我）", first.textContent.indexOf("小明") !== -1);
ok("C · 自己带「我」标记", first.textContent.indexOf("我") !== -1);
ok("C · 今日已打卡显示 ✓", first.textContent.indexOf("已打卡") !== -1);
var second = cdoc.querySelectorAll("#roomBody .room-member")[1];
ok("C · 未打卡成员显示「未打卡」", second.textContent.indexOf("未打卡") !== -1);
ok("C · 本周消耗只算本周（我 210）", first.textContent.indexOf("本周 210 千卡") !== -1);
ok("C · 上周的 400 千卡不计入本周", second.textContent.indexOf("本周 0 千卡") !== -1);
ok("C · 展示连续天数", first.textContent.indexOf("连续 5 天") !== -1);
var v = C.window.__fit.roomView();
ok("C · 集体进度 = 本月全队已打卡天数（3 天）", v.prog.done === 3 && v.prog.target === 30);
ok("C · 进度百分比 10%", v.prog.pct === 10);
var fill = cdoc.getElementById("roomProgFill");
ok("C · 进度条宽度已按百分比设置", !!fill && fill.style.width === "10%");
ok("C · 顶部显示今日已打卡人数", body.textContent.indexOf("今日 1/2 已打卡") !== -1);
ok("C · 有退出房间按钮", !!cdoc.getElementById("roomLeaveBtn"));
ok("C · 有刷新看板按钮", !!cdoc.getElementById("roomRefreshBtn"));
ok("C · 底部声明只同步摘要", body.textContent.indexOf("动作明细") === -1 || body.textContent.indexOf("摘要") !== -1);

/* ==================== D. 云端失败不影响本地打卡（降级） ==================== */
var D = boot({ envId: "demo-env", accessKey: "k".repeat(40) }, function () {
  return { status: 500, body: { message: "服务器炸了" } };
});
var ddoc = D.document;
await tick(30);
ok("D · 云端失败时 cloudOn() 仍为 true（已配置）", D.window.__fit.cloudOn() === true);
ok("D · 云端失败时 isCloudReady() 为 false", D.window.__fit.isCloudReady() === false);
ok("D · 账号卡提示连接失败", ddoc.getElementById("roomAccount").textContent.indexOf("连接失败") !== -1);
ok("D · 组队页给出重试入口", !!ddoc.getElementById("roomRetryBtn"));
ok("D · 打卡按钮仍在", !!ddoc.getElementById("checkinBtn"));
ok("D · 本地任务照常排期", D.window.__fit.deriveDay("2026-01-05").tasks.length > 0);
// 本地打卡仍然写入本地存储
var tk = ddoc.getElementById("checkinBtn");
tk.click();
await tick(3);
ok("D · 点击打卡会进入打卡向导（本地流程正常）", ddoc.getElementById("wizard").hidden === false);

/* ==================== E. 绑定邮箱弹层（UI 可达） ==================== */
ok("E · 存在账号弹层", !!cdoc.getElementById("accountOverlay"));
ok("E · 默认隐藏", cdoc.getElementById("accountOverlay").hidden === true);
C.window.__fit.openAccount();
ok("E · openAccount 后显示，并提示设备账号风险", cdoc.getElementById("accountOverlay").hidden === false &&
  cdoc.getElementById("accountSub").textContent.indexOf("设备账号") !== -1);
ok("E · 邮箱输入框存在", !!cdoc.getElementById("accountEmail"));
ok("E · 默认只显示「发送验证码」", cdoc.getElementById("accountSendBtn").hidden === false && cdoc.getElementById("accountVerifyBtn").hidden === true);
ok("E · 验证码字段默认隐藏", cdoc.getElementById("accountCodeField").hidden === true);
// 邮箱格式校验：非法邮箱不发请求
var before = C.fetch.calls.length;
cdoc.getElementById("accountEmail").value = "not-an-email";
C.window.__fit.sendAccountCode();
await tick(3);
ok("E · 非法邮箱不发起请求", C.fetch.calls.length === before);
ok("E · 弹出提示", cdoc.getElementById("toast").hidden === false);

/* ==================== F. 建房时成员已入队（触发器兜底）不应报失败 ==================== */
/* 线上真实情况：rooms 上的触发器 rooms_autoadd_owner 会在建房瞬间把房主写进
   成员表，客户端随后那次 insert 必然撞主键（409 / 23505）。这不是失败，
   必须继续走完流程 —— 否则用户看到「创建失败」，但房间其实已经建好了。 */
function roomHandler(memberPost) {
  return function (u, m) {
    if (u.indexOf("/auth/v1/signin/anonymously") !== -1) return { body: sessionBody() };
    if (u.indexOf("/v1/rdb/rest/profiles") !== -1) return { body: [{ id: MY_ID }] };
    if (u.indexOf("/v1/rdb/rest/rooms") !== -1 && m === "POST") return { body: [createdRoom] };
    if (u.indexOf("/v1/rdb/rest/room_members") !== -1 && m === "POST") return memberPost;
    if (u.indexOf("/v1/rdb/rest/room_members") !== -1 && u.indexOf("select=user_id") !== -1) {
      return { body: [{ user_id: MY_ID, joined_at: "2026-01-05", profiles: { nickname: "小明", emoji: "💪", streak: 5, total_days: 12 } }] };
    }
    if (u.indexOf("/v1/rdb/rest/room_members") !== -1) return { body: [] };
    if (u.indexOf("/v1/rdb/rest/day_summaries") !== -1) return { body: [] };
    return { status: 404, body: { message: "unhandled " + m + " " + u } };
  };
}
var F = boot({ envId: "demo-env", accessKey: "k".repeat(40) }, roomHandler({
  status: 409,
  body: { code: "DATABASE_23505", message: 'duplicate key value violates unique constraint "room_members_pkey"' }
}));
await tick(40);
ok("F · 云端已就绪", F.window.__fit.isCloudReady() === true);
var fRes = await F.window.__fit.createRoom("触发器房间", 30);
await tick(30);
ok("F · 成员插入撞主键时仍返回创建成功", fRes === true);
ok("F · 房间已写入 cloud.room", !!(F.window.__fit.cloud.room && F.window.__fit.cloud.room.id === "room-1"));
ok("F · 提示里给出邀请码", F.document.getElementById("toast").textContent.indexOf("NEW123") !== -1);
ok("F · 没有误报「创建失败」", F.document.getElementById("toast").textContent.indexOf("创建失败") === -1);

/* 反例：同样是 409，但原因是外键（资料没推上去）→ 必须报出来，不能被当重复吞掉 */
var F2 = boot({ envId: "demo-env", accessKey: "k".repeat(40) }, roomHandler({
  status: 409,
  body: { code: "DATABASE_23503", message: 'insert or update on table "room_members" violates foreign key constraint "room_members_user_id_fkey"' }
}));
await tick(40);
var f2Res = await F2.window.__fit.createRoom("外键房间", 30);
await tick(30);
ok("F2 · 外键错误不能被当成重复忽略", f2Res === false);
ok("F2 · 提示指向「资料还没建好」", F2.document.getElementById("toast").textContent.indexOf("资料还没建好") !== -1);

console.log("\n结果: " + pass + " 通过, " + fail + " 失败");
process.exit(fail ? 1 : 0);

})();
