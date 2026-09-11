/* v5.1.3 自定义头像验证
   ------------------------------------------------------------
   覆盖两条路径：
     · 预设 emoji：选择 → 本地持久化 → 顶部入口与看板即时更新 → 上云 profiles.emoji
     · 自定义图片：setAvatarImage → 持久化 → 渲染成 <img> → 上云 profiles.avatar
   以及两个容错：
     · 老库没有 avatar 列（42703）→ 自动降级为「不带该列」重试，云端照常可用
     · 队友的图片头像能被拉到并渲染（换头像后 20 秒轮询自然同步）
   jsdom 没有 canvas，图片压缩流程不在本文件覆盖（只覆盖存储与渲染层）。 */
const { JSDOM } = require("jsdom");
const fs = require("fs");

const html = fs.readFileSync("index.html", "utf8").replace(/<link rel="stylesheet"[^>]*>/g, "");
const cfgjs = fs.readFileSync("js/cloud-config.js", "utf8");
const cloudjs = fs.readFileSync("js/cloud.js", "utf8");
const socialjs = fs.readFileSync("js/social.js", "utf8");
const calcjs = fs.readFileSync("js/calc.js", "utf8");
const appjs = fs.readFileSync("js/app.js", "utf8");

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("✓ " + name); }
  else { fail++; console.log("✗ " + name + (detail ? "   → " + detail : "")); }
}

const MY_ID = "me-uuid-0001";
const MATE_ID = "mate-uuid-0002";
const ROOM = { id: "room-9", code: "ABC123", name: "晨练小分队", goal_kind: "days", goal_value: 30 };
const FAKE_IMG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD//gATQ1JFQVRPUg==";
const FAKE_IMG2 = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD//gBNQVRF";

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
    fn.calls.push({ url: u, method: m, init: init || {}, body: init && init.body ? String(init.body) : "" });
    var r = handler(u, m, init) || { status: 200, body: [] };
    return Promise.resolve(mkRes(r.status || 200, r.body));
  };
  fn.calls = [];
  fn.called = function (frag, method) {
    return fn.calls.some(function (c) { return c.url.indexOf(frag) !== -1 && (!method || c.method === method); });
  };
  return fn;
}

const SEED = {
  profileDone: true, username: "小明", weight: 72, height: 180, age: 25, gender: "male",
  scene: "home", theme: "snow", wallpaper: "", records: {}, tasks: {}, plan: null, recDismiss: {}, wizResume: 0
};
function boot(handler, seed) {
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
  window.localStorage.setItem("fitapp_data", JSON.stringify(Object.assign({}, SEED, seed || {})));
  Object.defineProperty(window.document, "hidden", { value: false, configurable: true });

  window.eval(cfgjs);
  window.eval(cloudjs);
  window.eval(socialjs);
  window.FIT_CLOUD_CONFIG = { envId: "demo-env", accessKey: "k".repeat(40) };
  var fetchMock = makeFetch(handler || function () { return { status: 200, body: [] }; });
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
    if (u.indexOf("rooms(") !== -1) return { body: [{ room_id: ROOM.id, joined_at: "2026-01-01", rooms: ROOM }] };
    return { body: members };
  }
  if (u.indexOf("/v1/rdb/rest/day_summaries") !== -1) return { body: [] };
  return { status: 404, body: { message: "unhandled " + m + " " + u } };
}
/* 取出最近一次上报 profiles 的行 */
function lastProfileRow(T) {
  var calls = T.fetch.calls.filter(function (c) { return c.url.indexOf("/v1/rdb/rest/profiles") !== -1 && c.method === "POST"; });
  if (!calls.length) return null;
  try { return JSON.parse(calls[calls.length - 1].body)[0]; } catch (e) { return null; }
}

(async function run() {

/* ==================== A. 默认头像 ==================== */
var T = boot(handler);
var doc = T.document;
await tick(50);
ok("A · 云端已就绪", T.window.__fit.isCloudReady() === true);
ok("A · 默认头像是 💪", T.window.__fit.myAvatarEmoji() === "💪");
ok("A · 默认没有图片头像", T.window.__fit.myAvatarImage() === "");
ok("A · 顶部入口显示默认 emoji", doc.getElementById("headerAccountBtn").textContent === "💪");

/* ==================== B. emoji 头像选择 ==================== */
T.window.__fit.openAccount();
await tick(10);
let grid = doc.getElementById("avatarGrid");
ok("B · 账号弹层有头像区", !!grid);
ok("B · 渲染出 30 个预设 emoji", grid.querySelectorAll(".avatar-opt").length === 30);
ok("B · 默认选中 💪", grid.querySelectorAll(".avatar-opt.sel").length === 1 &&
  grid.querySelector(".avatar-opt.sel").textContent === "💪");
ok("B · 预览显示当前头像", doc.getElementById("avatarPreview").textContent === "💪");
ok("B · 有「上传图片」按钮", !!doc.getElementById("avatarUploadBtn"));
ok("B · 没有图片时不显示「用回表情」", doc.getElementById("avatarClearBtn").hidden === true);

// 点第 3 个 emoji
var third = grid.querySelectorAll(".avatar-opt")[2];
var picked = third.textContent;
third.click();
await tick(30);
ok("B · 选择后 myAvatarEmoji 已更新", T.window.__fit.myAvatarEmoji() === picked);
ok("B · 顶部入口同步更新", doc.getElementById("headerAccountBtn").textContent === picked);
ok("B · 预览同步更新", doc.getElementById("avatarPreview").textContent === picked);
ok("B · 选中态跟着走", grid.querySelector(".avatar-opt.sel").textContent === picked);
var stored = JSON.parse(T.window.localStorage.getItem("fitapp_data"));
ok("B · 已写入 localStorage", stored.avatar === picked);
var row = lastProfileRow(T);
ok("B · 已上报到云端 profiles.emoji", !!row && row.emoji === picked);

/* ==================== C. 自定义图片头像 ==================== */
T.window.__fit.setAvatarImage(FAKE_IMG);
await tick(30);
ok("C · myAvatarImage 已更新", T.window.__fit.myAvatarImage() === FAKE_IMG);
ok("C · 顶部入口渲染成 <img>", !!doc.getElementById("headerAccountBtn").querySelector("img"));
ok("C · img 的 src 就是头像", doc.getElementById("headerAccountBtn").querySelector("img").src === FAKE_IMG);
ok("C · 顶部入口带上 has-img 类", doc.getElementById("headerAccountBtn").classList.contains("has-img"));
ok("C · 预览渲染成 <img>", !!doc.getElementById("avatarPreview").querySelector("img"));
ok("C · 「用回表情」按钮出现", doc.getElementById("avatarClearBtn").hidden === false);
stored = JSON.parse(T.window.localStorage.getItem("fitapp_data"));
ok("C · 图片已写入 localStorage", stored.avatarImage === FAKE_IMG);
row = lastProfileRow(T);
ok("C · 已上报到云端 profiles.avatar", !!row && row.avatar === FAKE_IMG);

/* 换 emoji 会清掉图片（两者互斥） */
grid.querySelectorAll(".avatar-opt")[0].click();
await tick(30);
ok("C · 改选 emoji 会清掉图片", T.window.__fit.myAvatarImage() === "");
ok("C · 顶部入口回到文本 emoji", !doc.getElementById("headerAccountBtn").querySelector("img") &&
  doc.getElementById("headerAccountBtn").textContent === "💪");
row = lastProfileRow(T);
ok("C · 云端 avatar 被清空", !!row && row.avatar === "");

/* 用回表情按钮 */
T.window.__fit.setAvatarImage(FAKE_IMG);
await tick(20);
doc.getElementById("avatarClearBtn").click();
await tick(20);
ok("C · 「用回表情」清掉图片", T.window.__fit.myAvatarImage() === "");
ok("C · 「用回表情」按钮重新隐藏", doc.getElementById("avatarClearBtn").hidden === true);

/* ==================== D. 重启后保持（含旧数据迁移） ==================== */
var T2 = boot(handler, { avatar: "🔥", avatarImage: FAKE_IMG });
await tick(40);
ok("D · 重启后 emoji 头像保持", T2.window.__fit.myAvatarEmoji() === "🔥");
ok("D · 重启后图片头像保持", T2.window.__fit.myAvatarImage() === FAKE_IMG);
ok("D · 重启后顶部入口是图片", !!T2.document.getElementById("headerAccountBtn").querySelector("img"));

/* 旧备份里没有 avatar 字段 → 不能报错，回落到默认 */
var T3 = boot(handler, {});
await tick(40);
ok("D · 旧数据缺 avatar 字段不报错", T3.window.__fit.myAvatarEmoji() === "💪");
ok("D · 旧数据缺 avatarImage 不报错", T3.window.__fit.myAvatarImage() === "");

/* ==================== E. 老库没有 avatar 列 → 自动降级 ==================== */
let profileCalls = 0;
var T4 = boot(function (u, m) {
  if (u.indexOf("/auth/v1/signin/anonymously") !== -1) return { body: sessionBody() };
  if (u.indexOf("/v1/rdb/rest/profiles") !== -1) {
    profileCalls++;
    /* 第一次带 avatar 会被拒（列不存在），第二次不带即可通过 */
    if (profileCalls === 1) {
      return { status: 400, body: { code: "42703", message: 'column "avatar" of relation "profiles" does not exist' } };
    }
    return { body: [{ id: MY_ID }] };
  }
  if (u.indexOf("/v1/rdb/rest/room_members") !== -1) {
    if (u.indexOf("rooms(") !== -1) return { body: [{ room_id: ROOM.id, joined_at: "2026-01-01", rooms: ROOM }] };
    return { body: members };
  }
  if (u.indexOf("/v1/rdb/rest/day_summaries") !== -1) return { body: [] };
  return { status: 404, body: { message: "unhandled " + m + " " + u } };
});
await tick(60);
ok("E · 降级后云端仍然可用", T4.window.__fit.isCloudReady() === true);
/* 只数真正的上报请求（GET 联表查询的 URL 里也含 profiles 字样，要排除）。
   注意：测试环境里 init() 会被触发两次（jsdom 自己派发一次 + 本文件手动派发一次），
   所以请求条数不固定，这里断言行为而不是条数。 */
var profilePosts = T4.fetch.calls.filter(function (c) {
  return c.url.indexOf("/v1/rdb/rest/profiles") !== -1 && c.method === "POST";
});
ok("E · 首次上报会尝试带 avatar 列", profilePosts.length > 0 && /"avatar"/.test(profilePosts[0].body));
/* 找到「第一次不带 avatar」的位置，要求它之后的所有上报都不再带 —— 这样断言不依赖请求条数 */
var firstClean = -1;
profilePosts.forEach(function (c, i) { if (firstClean === -1 && !/"avatar"/.test(c.body)) firstClean = i; });
ok("E · 被拒后自动降级（一旦降级之后都不再带 avatar）",
  firstClean > 0 && profilePosts.slice(firstClean).every(function (c) { return !/"avatar"/.test(c.body); }),
  "共 " + profilePosts.length + " 次上报，第 " + (firstClean + 1) + " 次起降级");
var row4 = lastProfileRow(T4);
ok("E · 降级后不再携带 avatar 列", !!row4 && !("avatar" in row4));
ok("E · 降级后 emoji 照常上报", !!row4 && row4.emoji === "💪");
var selCalls = T4.fetch.calls.filter(function (c) {
  return c.url.indexOf("/v1/rdb/rest/room_members") !== -1 && c.method === "GET";
});
ok("E · 之后的查询也不再选 avatar 列",
  selCalls.every(function (c) { return c.url.indexOf("avatar") === -1; }));

/* ==================== F. 队友的图片头像能被拉到 ==================== */
members = [
  { user_id: MY_ID, joined_at: "2026-01-01", profiles: { nickname: "小明", emoji: "💪", streak: 5, total_days: 12 } },
  { user_id: MATE_ID, joined_at: "2026-01-05", profiles: { nickname: "阿强", emoji: "🔥", streak: 2, total_days: 3, avatar: FAKE_IMG2 } }
];
var T5 = boot(handler);
var d5 = T5.document;
await tick(50);
d5.querySelector('.nav-btn[data-tab="room"]').click();
await tick(20);
var avatars = d5.querySelectorAll("#roomBody .rm-avatar");
ok("F · 看板渲染 2 个头像", avatars.length === 2);
/* 看板按今日打卡/连续天数排序：我（连续 5 天）在前，队友在后 */
ok("F · 队友头像渲染成 <img>", !!avatars[1].querySelector("img"));
ok("F · 队友头像 src 正确", avatars[1].querySelector("img").src === FAKE_IMG2);
ok("F · 我的头像仍是 emoji（本地无图）", !avatars[0].querySelector("img"));

/* 队友换头像 → 轮询能感知并刷新 */
members[1].profiles.avatar = FAKE_IMG;
var changed = await T5.window.__fit.pollRoom();
await tick(20);
ok("F · 队友换头像后 pollRoom 检测到变化", changed === true);
var avatars2 = d5.querySelectorAll("#roomBody .rm-avatar");
ok("F · 队友新头像已显示", !!avatars2[1].querySelector("img") &&
  avatars2[1].querySelector("img").src === FAKE_IMG);

console.log("\n结果: " + pass + " 通过, " + fail + " 失败");
process.exit(fail ? 1 : 0);

})();
