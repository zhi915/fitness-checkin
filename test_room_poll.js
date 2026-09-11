/* v5.1.3 组队看板自动刷新（轮询）验证
   ------------------------------------------------------------
   背景：CloudBase 的 PG 模式没有 Realtime 订阅，队友加入 / 打卡不会推送过来。
        修这个 bug 之前，成员列表只在「切到组队页那一刻」拉一次，
        于是「后加入的人看得到先来的，先来的看不到后加入的」。
   本文件锁住轮询的正确行为：
     A 进房后自动开启轮询
     B 队友加入 → pollRoom 能拉到并渲染出来
     C 数据没变化时不重绘（重绘会清掉正在输入的内容）
     D 页面在后台时不去拉（省流量，也避免在后台标签页空转）
     E 切回前台立刻拉一次（后台期间攒下的变化要补上）
     F 退出房间后停止轮询
   全部走 mock fetch，不发真实请求。 */
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

const MY_ID = "me-uuid-0001";
const MATE_ID = "mate-uuid-0002";
const ROOM = { id: "room-9", code: "ABC123", name: "晨练小分队", goal_kind: "days", goal_value: 30 };
let members = [
  { user_id: MY_ID, joined_at: "2026-01-01", profiles: { nickname: "小明", emoji: "💪", streak: 5, total_days: 12 } }
];

function b64url(o) {
  return Buffer.from(JSON.stringify(o)).toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function sessionBody() {
  return {
    access_token: b64url({ alg: "HS256", typ: "JWT" }) + "." +
      b64url({ sub: MY_ID, is_anonymous: true, exp: Math.floor(Date.now() / 1000) + 3600 }) + ".sig",
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

function boot(handler) {
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
  window.localStorage.setItem("fitapp_data", JSON.stringify({
    profileDone: true, username: "小明", weight: 72, height: 180, age: 25, gender: "male",
    scene: "home", theme: "snow", wallpaper: "", records: {}, tasks: {}, plan: null, recDismiss: {}, wizResume: 0
  }));
  /* jsdom 默认 visibilityState = "prerender" → document.hidden 为 true，
     这会让「后台不拉取」的短路永久生效。真实浏览器里正常，测试里显式置为可见。 */
  Object.defineProperty(window.document, "hidden", { value: false, configurable: true });

  window.eval(cfgjs);
  window.eval(cloudjs);
  window.eval(socialjs);
  window.FIT_CLOUD_CONFIG = { envId: "demo-env", accessKey: "k".repeat(40) };
  var fetchMock = makeFetch(handler);
  window.FitCloud.configure({ fetch: fetchMock });
  window.eval(calcjs);
  window.eval(appjs);
  try { window.document.dispatchEvent(new window.Event("DOMContentLoaded")); } catch (e) {}
  return { window: window, document: window.document, fetch: fetchMock };
}
const tick = async function (n) { for (var i = 0; i < (n || 25); i++) await new Promise(function (r) { setTimeout(r, 0); }); };

function handler(u, m) {
  if (u.indexOf("/auth/v1/signin/anonymously") !== -1) return { body: sessionBody() };
  if (u.indexOf("/v1/rdb/rest/profiles") !== -1) return { body: [{ id: MY_ID }] };
  if (u.indexOf("/v1/rdb/rest/room_members") !== -1) {
    if (m === "POST" || m === "DELETE") return { body: [] };
    /* loadRoom 的嵌套查询带 rooms(...)，返回房间；loadRoomData 的带 profiles(...) */
    if (u.indexOf("rooms(") !== -1) return { body: [{ room_id: ROOM.id, joined_at: "2026-01-01", rooms: ROOM }] };
    return { body: members };
  }
  if (u.indexOf("/v1/rdb/rest/day_summaries") !== -1) return { body: [] };
  return { status: 404, body: { message: "unhandled " + m + " " + u } };
}

(async function run() {

/* ==================== A. 进房后自动开启轮询 ==================== */
var T = boot(handler);
var doc = T.document;
await tick(50);
ok("A · 已识别所属房间", !!(T.window.__fit.cloud.room && T.window.__fit.cloud.room.id === "room-9"));
ok("A · 已自动开启轮询", T.window.__fit.isPolling() === true);
doc.querySelector('.nav-btn[data-tab="room"]').click();
await tick(10);
ok("A · 看板初始 1 人", doc.querySelectorAll("#roomBody .room-member").length === 1);

/* ==================== B. 队友加入后能被拉到（核心场景） ==================== */
members = members.concat([
  { user_id: MATE_ID, joined_at: "2026-01-05", profiles: { nickname: "阿强", emoji: "🔥", streak: 2, total_days: 3 } }
]);
var changed = await T.window.__fit.pollRoom();
await tick(20);
ok("B · pollRoom 检测到数据变化", changed === true);
ok("B · 成员变为 2 人", T.window.__fit.cloud.members.length === 2);
ok("B · 看板渲染出 2 人", doc.querySelectorAll("#roomBody .room-member").length === 2);
ok("B · 能看到后加入队友的昵称", doc.getElementById("roomBody").textContent.indexOf("阿强") !== -1);
ok("B · 给出「有队友加入」提示", doc.getElementById("toast").textContent.indexOf("队友加入") !== -1);

/* ==================== C. 数据没变化时不要重绘 ==================== */
var again = await T.window.__fit.pollRoom();
await tick(10);
ok("C · 无变化时 pollRoom 返回 false（不重绘）", again === false);
ok("C · 成员数没被破坏", T.window.__fit.cloud.members.length === 2);

/* ==================== D. 页面在后台时不拉取 ==================== */
Object.defineProperty(doc, "hidden", { value: true, configurable: true });
var beforeCalls = T.fetch.calls.length;
var whenHidden = await T.window.__fit.pollRoom();
await tick(10);
ok("D · 后台时 pollRoom 直接返回 false", whenHidden === false);
ok("D · 后台时没有发起请求", T.fetch.calls.length === beforeCalls);
Object.defineProperty(doc, "hidden", { value: false, configurable: true });

/* ==================== E. 切回前台立刻补一次 ==================== */
members = members.slice(0, 1);   // 队友中途退出了房间
doc.dispatchEvent(new doc.defaultView.Event("visibilitychange"));
await tick(30);
ok("E · 回到前台自动刷新：成员回到 1 人", T.window.__fit.cloud.members.length === 1);
ok("E · 看板同步为 1 人", doc.querySelectorAll("#roomBody .room-member").length === 1);

/* ==================== F. 退出房间后停止轮询 ==================== */
await T.window.__fit.leaveRoom();
await tick(30);
ok("F · 退出房间后 cloud.room 已清空", T.window.__fit.cloud.room === null);
ok("F · 退出房间后轮询已停止", T.window.__fit.isPolling() === false);

console.log("\n结果: " + pass + " 通过, " + fail + " 失败");
process.exit(fail ? 1 : 0);

})();
