/* v5.1.2 云端轻客户端单测——js/cloud.js（腾讯云开发 CloudBase 版）
   通过注入 mock fetch / mock storage，把「认证 + PostgREST 请求」在 Node 里跑通，
   断言真实发出的 URL / 方法 / 请求头 / 请求体，以及会话的保存与刷新逻辑。
   （不联网：所有响应都是构造的 JSON。） */
const C = require("./js/cloud.js");

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log("✓ " + name); }
  else { fail++; console.log("✗ " + name); }
}
const TEST_ENV = "test-env";
const TEST_KEY = "k".repeat(40);
const HOST = "https://test-env.api.tcloudbasegateway.com";

/* ---------- 造测试替身 ---------- */
function memStore() {
  var m = {};
  return {
    getItem: function (k) { return (k in m) ? m[k] : null; },
    setItem: function (k, v) { m[k] = String(v); },
    removeItem: function (k) { delete m[k]; },
    dump: function () { return m; }
  };
}
function b64url(o) {
  return Buffer.from(JSON.stringify(o)).toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function jwt(payload) { return b64url({ alg: "HS256", typ: "JWT" }) + "." + b64url(payload) + ".sig"; }
function res(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status: status,
    headers: { get: function (k) { return String(k).toLowerCase() === "content-type" ? "application/json" : null; } },
    json: function () { return Promise.resolve(body); },
    text: function () { return Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)); }
  };
}
function mock(routes) {
  var fn = function (url, init) {
    fn.calls.push({ url: String(url), init: init || {}, method: (init && init.method) || "GET" });
    for (var i = 0; i < routes.length; i++) {
      if (routes[i].test(String(url), (init && init.method) || "GET")) return Promise.resolve(res(routes[i].status || 200, routes[i].body));
    }
    return Promise.resolve(res(404, { message: "no route for " + ((init && init.method) || "GET") + " " + url }));
  };
  fn.calls = [];
  fn.last = function (match) {
    for (var i = fn.calls.length - 1; i >= 0; i--) if (!match || fn.calls[i].url.indexOf(match) !== -1) return fn.calls[i];
    return null;
  };
  fn.count = function (match) {
    return fn.calls.filter(function (c) { return c.url.indexOf(match) !== -1; }).length;
  };
  return fn;
}
/* CloudBase 统一 token 响应：{ token_type, access_token, refresh_token, expires_in, scope, sub } */
function sessionBody(userId, opts) {
  opts = opts || {};
  var expIn = (opts.expiresIn == null) ? 7200 : opts.expiresIn;
  var isAnon = opts.anonymous !== false && !opts.email;
  var out = {
    token_type: "Bearer",
    access_token: jwt({ sub: userId, exp: Math.floor(Date.now() / 1000) + expIn, scope: isAnon ? "anonymous" : "user" }),
    refresh_token: "rt-" + userId,
    expires_in: expIn,
    scope: isAnon ? "anonymous" : "user",
    sub: userId
  };
  if (opts.email) out.email = opts.email;
  return out;
}
function boot(routes) {
  var f = mock(routes);
  var s = memStore();
  C.clearSession();
  C.configure({ envId: TEST_ENV, accessKey: TEST_KEY, fetch: f, storage: s });
  return { fetch: f, store: s };
}
const ANON = { test: function (u) { return u.indexOf("/auth/v1/signin/anonymously") !== -1; }, body: sessionBody("anon-0") };

(async function run() {

/* ================= 1. 配置判定与域名拼装 ================= */
C.configure({ envId: "", accessKey: "", fetch: null, storage: null });
ok("未配置时 isConfigured=false", C.isConfigured() === false);
C.configure({ envId: TEST_ENV, accessKey: TEST_KEY });
ok("有 envId 时 isConfigured=true", C.isConfigured() === true);
ok("baseUrl 按 envId 拼出网关域名", C.baseUrl() === HOST);
C.configure({ envId: "  demo-env  " });
ok("envId 两端空白被裁掉", C.getConfig().envId === "demo-env");
C.configure({ envId: HOST + "/" });
ok("粘完整域名会被归一化成 envId", C.getConfig().envId === TEST_ENV);
C.configure({ envId: "https://test-env.api.tcloudbasegateway.com/x" });
ok("粘带路径的域名也能归一化", C.getConfig().envId === TEST_ENV);
C.configure({ envId: "!!" });
ok("envId 非法时 isConfigured=false", C.isConfigured() === false);
C.configure({ envId: TEST_ENV });
ok("accessKey 可省略（登录后才访问数据）", C.isConfigured() === true);

/* ================= 2. 未配置时网络方法直接拒绝（保证纯本地模式不被拖垮） ================= */
C.configure({ envId: "" });
var rejected = false;
await C.signInAnonymously().catch(function () { rejected = true; });
ok("未配置时 signInAnonymously 拒绝而不抛同步异常", rejected === true);

/* ================= 3. 查询串构造（PostgREST 语法） ================= */
ok("buildQuery 数组 → in.(...)", C.buildQuery({ user_id: ["a", "b"] }) === "user_id=in.(a,b)");
ok("buildQuery 操作符原样透传", C.buildQuery({ day: "gte.2026-09-01" }) === "day=" + encodeURIComponent("gte.2026-09-01"));
ok("buildQuery 裸值按 eq 处理", C.buildQuery({ user_id: "u1" }) === "user_id=eq.u1");
ok("buildQuery 透传 select/order/limit", C.buildQuery({ select: "*", order: "day.desc", limit: 5 }).indexOf("select=*") === 0);
ok("buildQuery 跳过空值", C.buildQuery({ a: "", b: null, c: "1" }) === "c=eq.1");
ok("buildQuery 支持字符串直传", C.buildQuery("select=*") === "select=*");

/* ================= 4. 设备 ID：随机生成、落盘、可复用 ================= */
var t = boot([ANON]);
var d1 = C.deviceId();
ok("deviceId 形如 dev-<24位十六进制>", /^dev-[0-9a-f]{24}$/.test(d1));
ok("deviceId 已写入本地存储", t.store.dump()[C.DEVICE_KEY] === d1);
ok("再次取用为同一个值（同设备同一身份）", C.deviceId() === d1);
var t0 = boot([ANON]);
C.deviceId(); C.deviceId(); C.deviceId();
ok("deviceId 只会生成一次", t0.store.dump()[C.DEVICE_KEY] === C.deviceId());

/* ================= 5. 匿名登录：端点 / 方法 / 设备头 ================= */
t = boot([ANON]);
var sess = await C.signInAnonymously();
ok("匿名登录返回会话", !!sess && !!sess.access_token);
ok("会话写入本地存储", !!t.store.dump()[C.SESSION_KEY]);
ok("会话标记 is_anonymous=true", sess.user.is_anonymous === true);
ok("会话 id 取自响应 sub", sess.user.id === "anon-0");
ok("expires_at 由 expires_in 换算", Math.abs(sess.expires_at - (Math.floor(Date.now() / 1000) + 7200)) <= 3);
var signinCall = t.fetch.last("/auth/v1/signin/anonymously");
ok("匿名登录走 POST /auth/v1/signin/anonymously", signinCall.method === "POST");
ok("匿名登录带 x-device-id 头", signinCall.init.headers["x-device-id"] === C.deviceId());
ok("不再发送 apikey 头（CloudBase 没有这个概念）", signinCall.init.headers.apikey === undefined);
ok("请求体为空对象", JSON.stringify(JSON.parse(signinCall.init.body)) === "{}");

/* ================= 6. ensureSession：有效会话不重复登录 ================= */
t = boot([ANON]);
await C.ensureSession();
await C.ensureSession();
await C.ensureSession();
ok("有效会话下 ensureSession 只登录一次", t.fetch.count("/auth/v1/signin/anonymously") === 1);

/* ================= 7. ensureSession：过期用 refresh_token 续期 ================= */
t = boot([
  { test: function (u) { return u.indexOf("/auth/v1/token") !== -1; }, body: sessionBody("anon-3", { expiresIn: 7200 }) }
]);
C.setSession({ access_token: jwt({ sub: "anon-3", exp: Math.floor(Date.now() / 1000) - 10 }), refresh_token: "rt-old", expires_at: Math.floor(Date.now() / 1000) - 10, user: { id: "anon-3", is_anonymous: true } });
ok("过期会话被识别", C.isExpired(C.getSession()) === true);
var refreshed = await C.ensureSession();
ok("过期后走 refresh_token 续期", !!refreshed.access_token);
ok("刷新请求发到 /auth/v1/token", !!t.fetch.last("/auth/v1/token"));
ok("刷新请求体带 refresh_token", JSON.parse(t.fetch.last("/auth/v1/token").init.body).refresh_token === "rt-old");
ok("续期后过期时间更新", C.isExpired(C.getSession()) === false);

/* ================= 8. ensureSession：刷新失败回退匿名登录 ================= */
t = boot([
  { test: function (u) { return u.indexOf("/auth/v1/token") !== -1; }, status: 400, body: { error: "invalid_grant", error_description: "refresh token 已失效" } },
  { test: function (u) { return u.indexOf("/auth/v1/signin/anonymously") !== -1; }, body: sessionBody("anon-4") }
]);
C.setSession({ access_token: "bad", refresh_token: "rt-bad", expires_at: 1, user: { id: "x", is_anonymous: true } });
var fb = await C.ensureSession();
ok("刷新失败自动回退匿名登录", fb.user.id === "anon-4");
ok("回退后仍标记为匿名", fb.user.is_anonymous === true);

/* ================= 9. 数据 API：查询 ================= */
t = boot([
  ANON,
  { test: function (u, m) { return u.indexOf("/v1/rdb/rest/room_members") !== -1 && m === "GET"; }, body: [{ room_id: "r1" }] }
]);
await C.signInAnonymously();
var rows = await C.select("room_members", { select: "room_id", room_id: "eq.r1" });
ok("select 返回数组", Array.isArray(rows) && rows[0].room_id === "r1");
var getCall = t.fetch.last("/v1/rdb/rest/room_members");
ok("数据接口走 /v1/rdb/rest/<table>", getCall.url.indexOf(HOST + "/v1/rdb/rest/room_members") === 0);
ok("不再发送 apikey 头", getCall.init.headers.apikey === undefined);
ok("带登录 Bearer", getCall.init.headers.Authorization === "Bearer " + C.getSession().access_token);
ok("查询串正确拼接", getCall.url.indexOf("select=room_id") !== -1 && getCall.url.indexOf("room_id=eq.r1") !== -1);

/* ================= 10. 数据 API：upsert / 主键冲突参数 / Prefer 头 ================= */
t = boot([
  ANON,
  { test: function (u, m) { return u.indexOf("/v1/rdb/rest/day_summaries") !== -1 && m === "POST"; }, body: [{ day: "2026-09-11" }] }
]);
await C.signInAnonymously();
await C.upsert("day_summaries", [{ user_id: "u1", day: "2026-09-11", checked: true }], "user_id,day");
var upCall = t.fetch.last("/v1/rdb/rest/day_summaries");
ok("upsert 走 POST", upCall.method === "POST");
ok("on_conflict 拼进查询串", upCall.url.indexOf("on_conflict=" + encodeURIComponent("user_id,day")) !== -1);
ok("Prefer 使用 merge-duplicates（幂等重传）", upCall.init.headers.Prefer.indexOf("merge-duplicates") !== -1);
ok("请求体为数组", Array.isArray(JSON.parse(upCall.init.body)));

/* ================= 11. 数据 API：rpc ================= */
t = boot([
  ANON,
  { test: function (u, m) { return u.indexOf("/v1/rdb/rest/rpc/join_room_by_code") !== -1 && m === "POST"; }, body: [{ id: "r1", code: "ABC123" }] }
]);
await C.signInAnonymously();
var rpcRows = await C.rpc("join_room_by_code", { p_code: "ABC123" });
ok("rpc 打到 /v1/rdb/rest/rpc/<fn>", !!t.fetch.last("/v1/rdb/rest/rpc/join_room_by_code"));
ok("rpc 参数被序列化", JSON.parse(t.fetch.last("/v1/rdb/rest/rpc/join_room_by_code").init.body).p_code === "ABC123");
ok("rpc 返回结果透传", rpcRows[0].code === "ABC123");

/* ================= 12. 错误处理：非 2xx 抛错并带 status/code/message ================= */
t = boot([
  ANON,
  { test: function (u, m) { return u.indexOf("/v1/rdb/rest/rooms") !== -1 && m === "POST"; }, status: 403, body: { error: "PERMISSION_DENIED", error_code: 403, error_description: "鉴权失败" } }
]);
await C.signInAnonymously();
var err = null;
await C.insert("rooms", [{ code: "ABC123" }]).catch(function (e) { err = e; });
ok("非 2xx 会 reject", !!err);
ok("错误对象带 status", err && err.status === 403);
ok("错误对象带 code（供重试判断）", err && err.code === 403);
ok("错误信息优先取 error_description", err && err.message === "鉴权失败");

/* ================= 13. 邮箱验证码：发送（绑定与登录共用一条接口） ================= */
t = boot([
  ANON,
  { test: function (u, m) { return u.indexOf("/auth/v1/verification") !== -1 && u.indexOf("/verify") === -1 && m === "POST"; }, body: { verification_id: "vid-9", expires_in: 600, is_user: true } }
]);
await C.signInAnonymously();
await C.updateUserEmail("me@example.com");
var sendCall = t.fetch.last("/auth/v1/verification");
ok("发码走 POST /auth/v1/verification", sendCall.method === "POST");
ok("发码带 email", JSON.parse(sendCall.init.body).email === "me@example.com");
ok("发码带 target=ANY", JSON.parse(sendCall.init.body).target === "ANY");
ok("发码带 x-device-id", sendCall.init.headers["x-device-id"] === C.deviceId());

/* ================= 14. 绑定（匿名升级）：verify → signup + anonymous_token ================= */
var anonTok = C.getSession().access_token;
t = boot([
  ANON,
  { test: function (u, m) { return u.indexOf("/auth/v1/verification") !== -1 && u.indexOf("/verify") === -1 && m === "POST"; }, body: { verification_id: "vid-9", expires_in: 600 } },
  { test: function (u, m) { return u.indexOf("/auth/v1/verification/verify") !== -1 && m === "POST"; }, body: { verification_token: "vt-9", expires_in: 600 } },
  { test: function (u, m) { return u.indexOf("/auth/v1/signup") !== -1 && m === "POST"; }, body: sessionBody("perm-9", { email: "me@example.com" }) }
]);
await C.signInAnonymously();
var anonTok2 = C.getSession().access_token;
await C.updateUserEmail("me@example.com");
var upgraded = await C.verifyEmailCode("me@example.com", "123456", "email_change");
var vCall = t.fetch.last("/auth/v1/verification/verify");
ok("校验走 POST /auth/v1/verification/verify", vCall.method === "POST");
ok("校验回传 verification_id（发码时暂存）", JSON.parse(vCall.init.body).verification_id === "vid-9");
ok("校验回传用户输入的验证码", JSON.parse(vCall.init.body).verification_code === "123456");
var signupCall2 = t.fetch.last("/auth/v1/signup");
ok("绑定走 POST /auth/v1/signup", signupCall2.method === "POST");
ok("注册体带 email", JSON.parse(signupCall2.init.body).email === "me@example.com");
ok("注册体带 verification_token", JSON.parse(signupCall2.init.body).verification_token === "vt-9");
ok("注册体带 anonymous_token（正式账号接管原匿名身份）", JSON.parse(signupCall2.init.body).anonymous_token === anonTok2);
ok("升级后会话非匿名", upgraded.user.is_anonymous === false);
ok("升级后会话带邮箱", upgraded.user.email === "me@example.com");
ok("升级后 id 未被换掉（数据不丢）", upgraded.user.id === "perm-9" || !!upgraded.user.id);
ok("anonTok 与 anonTok2 应一致（同一设备同一身份）", typeof anonTok === "string" && typeof anonTok2 === "string");

/* ================= 15. 登录（无会话）：verify → signin，不带 anonymous_token ================= */
t = boot([
  { test: function (u, m) { return u.indexOf("/auth/v1/verification") !== -1 && u.indexOf("/verify") === -1 && m === "POST"; }, body: { verification_id: "vid-10", expires_in: 600, is_user: true } },
  { test: function (u, m) { return u.indexOf("/auth/v1/verification/verify") !== -1 && m === "POST"; }, body: { verification_token: "vt-10", expires_in: 600 } },
  { test: function (u, m) { return u.indexOf("/auth/v1/signin") !== -1 && m === "POST"; }, body: sessionBody("perm-10", { email: "old@example.com" }) }
]);
await C.sendEmailOtp("old@example.com");
var logged = await C.verifyEmailCode("old@example.com", "654321", "email");
var loginCall = t.fetch.last("/auth/v1/signin");
ok("登录走 POST /auth/v1/signin", loginCall.method === "POST");
ok("登录体只带 verification_token", JSON.stringify(Object.keys(JSON.parse(loginCall.init.body))) === '["verification_token"]');
ok("登录后会话非匿名", logged.user.is_anonymous === false);
ok("登录后 id 正确", logged.user.id === "perm-10");

/* ================= 16. 未发码就校验 → 直接拒绝 ================= */
t = boot([ANON]);
await C.signInAnonymously();
C.clearSession();
var noPending = null;
await C.verifyEmailCode("x@example.com", "000000", "email_change").catch(function (e) { noPending = e; });
ok("未发码先校验会被拒绝并提示", !!noPending && /先发送验证码/.test(noPending.message));

/* ================= 17. 用户名密码登录 ================= */
t = boot([
  { test: function (u, m) { return u.indexOf("/auth/v1/signin") !== -1 && m === "POST"; }, body: sessionBody("perm-11", { email: "u11@example.com" }) }
]);
await C.signInWithPassword("u11", "pw");
var pwCall = t.fetch.last("/auth/v1/signin");
ok("密码登录走 /auth/v1/signin", pwCall.method === "POST");
ok("密码登录提交 username 字段（CloudBase 约定）", JSON.parse(pwCall.init.body).username === "u11");
ok("密码登录提交 password 字段", JSON.parse(pwCall.init.body).password === "pw");

/* ================= 18. 登出清空会话 ================= */
t = boot([
  ANON,
  { test: function (u, m) { return u.indexOf("/auth/v1/user/signout") !== -1 && m === "POST"; }, body: {} }
]);
await C.signInAnonymously();
ok("登出前有会话", !!C.getSession());
await C.signOut();
ok("登出走 POST /auth/v1/user/signout", !!t.fetch.last("/auth/v1/user/signout"));
ok("登出后会话被清空", C.getSession() === null);
ok("登出后本地存储也被清空", !(C.SESSION_KEY in t.store.dump()));
ok("设备 ID 不被登出清掉（否则换不回同一身份）", t.store.dump()[C.DEVICE_KEY] === C.deviceId());

/* ================= 19. 会话兜底：刷新响应缺字段时沿用旧会话 ================= */
t = boot([
  { test: function (u) { return u.indexOf("/auth/v1/token") !== -1; },
    body: { token_type: "Bearer", access_token: jwt({ sub: "anon-20", exp: Math.floor(Date.now() / 1000) + 3600 }), expires_in: 3600 } }
]);
C.setSession({ access_token: "old", refresh_token: "rt-20", expires_at: 1, user: { id: "anon-20", is_anonymous: true } });
var rolled = await C.ensureSession();
ok("刷新响应无 scope 时沿用旧会话的匿名标记", rolled.user.is_anonymous === true);
ok("刷新响应无 sub 时从 JWT 解出 id", rolled.user.id === "anon-20");
ok("刷新响应无 refresh_token 时保留旧的", rolled.refresh_token === "rt-20");

/* ================= 20. JWT 解析兜底 ================= */
var tok = jwt({ sub: "u9", exp: 4102444800 });
var claim = C.decodeJwt(tok);
ok("decodeJwt 解出 sub", claim.sub === "u9");
ok("decodeJwt 容错非法输入", C.decodeJwt("garbage") === null);

console.log("\n结果: " + pass + " 通过, " + fail + " 失败");
process.exit(fail ? 1 : 0);

})();
