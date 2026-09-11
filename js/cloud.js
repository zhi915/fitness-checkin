/* ============================================================
   健身打卡 App · 腾讯云开发 CloudBase 轻客户端（v5.1.0，零依赖）
   ------------------------------------------------------------
   为什么不用 @cloudbase/js-sdk？
     · 官方 SDK 体积大，且内含本项目用不到的模块；
     · 本 App 是「无构建、离线优先」的纯前端：自己发 HTTP 接口更轻、
       更好审阅，且断网时天然降级（任何请求失败都不影响本地打卡）。
   ------------------------------------------------------------
   只依赖 CloudBase 的两组公开 HTTP 接口（均为稳定的 JSON API）：
     · 身份认证：  https://{envId}.api.tcloudbasegateway.com/auth/v1/*
     · 数据 API：  https://{envId}.api.tcloudbasegateway.com/v1/rdb/rest/{table}
       数据层基于开源 PostgREST，查询语法与 Supabase 一致（select/eq/in/order/limit）。
   ------------------------------------------------------------
   认证流程（三条路径）：
     · 匿名登录（设备账号）：POST /auth/v1/signin/anonymously
         必须带 x-device-id 头。同一设备 ID 只会生成同一个匿名用户，
         因此清缓存后重新匿名登录能拿回同一个身份（这是「设备账号」的基石）。
     · 邮箱验证码：POST /auth/v1/verification      → 拿 verification_id
                   POST /auth/v1/verification/verify → 拿 verification_token
                   POST /auth/v1/signup  （绑定/升级，带 anonymous_token）
                   POST /auth/v1/signin  （登录）
     · 刷新令牌：POST /auth/v1/token
   ------------------------------------------------------------
   设计约束：
     1. 不读 DOM、不读业务数据 —— 只做「认证 + 通用增删改查」，便于单测。
     2. fetch / storage 可注入（configure），Node 里可传入 mock 做端到端断言。
     3. 未 configure 时 isConfigured() 为 false，所有网络方法直接 reject，
        调用方据此走「纯本地」分支 —— 保证离线/未配置时 App 完全不受影响。
   双用封装：浏览器 window.FitCloud / Node require("./js/cloud.js")
   ============================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FitCloud = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var SESSION_KEY = "fitapp_cloud_session";
  var DEVICE_KEY = "fitapp_cloud_device";
  var REFRESH_SKEW = 60;          // 提前 60 秒刷新令牌，避免边界 401

  var cfg = { envId: "", accessKey: "", fetch: null, storage: null };
  var session = null;             // { access_token, refresh_token, expires_at, user }
  var pending = null;             // { id, email } 发码与校验之间暂存 verification_id

  /* ---------- 配置 ---------- */
  /* 容错：用户可能把整段域名或控制台里的 URL 粘进来，这里统一归一化成 envId */
  function normalizeEnvId(v) {
    var s = String(v == null ? "" : v).trim();
    s = s.replace(/^https?:\/\//i, "");
    s = s.replace(/\.api\.tcloudbasegateway\.com.*$/i, "");
    s = s.replace(/\/+$/, "");
    return s;
  }
  function configure(opts) {
    opts = opts || {};
    if (opts.envId != null) cfg.envId = normalizeEnvId(opts.envId);
    if (opts.accessKey != null) cfg.accessKey = String(opts.accessKey).trim();
    if (opts.fetch) cfg.fetch = opts.fetch;
    if (opts.storage) cfg.storage = opts.storage;
    return api;
  }
  function getConfig() { return { envId: cfg.envId, accessKey: cfg.accessKey }; }
  /* 未配置（占位符 / 空值 / 明显非法）时视为「纯本地模式」。
     accessKey（Publishable Key）是可选的：未登录时会以 anon 身份访问，
     但本项目所有数据操作都在 ensureSession() 之后，故不填也能跑。 */
  function isConfigured() {
    return /^[A-Za-z0-9][A-Za-z0-9_-]{2,}$/.test(cfg.envId);
  }
  function baseUrl() { return "https://" + cfg.envId + ".api.tcloudbasegateway.com"; }

  /* ---------- 存储（浏览器 localStorage / 测试可注入 mock） ---------- */
  function store() {
    if (cfg.storage) return cfg.storage;
    try {
      if (typeof localStorage !== "undefined" && localStorage) return localStorage;
    } catch (e) { /* 隐私模式等场景静默降级 */ }
    return null;
  }
  function readRaw(k) { var s = store(); if (!s) return null; try { return s.getItem(k); } catch (e) { return null; } }
  function writeRaw(k, v) { var s = store(); if (!s) return false; try { s.setItem(k, v); return true; } catch (e) { return false; } }
  function dropRaw(k) { var s = store(); if (!s) return; try { s.removeItem(k); } catch (e) {} }

  /* ---------- 设备 ID ----------
     CloudBase 的匿名用户按「设备 ID」去重：同一个 x-device-id 只会对应一个匿名用户。
     所以它必须随机生成、并长期缓存在本地 —— 丢了就等于换了个人（数据找不回）。 */
  function randId() {
    var s = "", hex = "0123456789abcdef", i;
    for (i = 0; i < 24; i++) s += hex.charAt(Math.floor(Math.random() * 16));
    return "dev-" + s;
  }
  function deviceId() {
    var d = null;
    try { d = readRaw(DEVICE_KEY); } catch (e) { d = null; }
    if (d && /^[A-Za-z0-9_-]{8,}$/.test(d)) return d;
    d = randId();
    writeRaw(DEVICE_KEY, d);
    return d;
  }

  /* ---------- fetch 解析 ---------- */
  function doFetch(url, init) {
    var f = cfg.fetch || (typeof fetch !== "undefined" ? fetch : null);
    if (!f) return Promise.reject(new Error("当前环境不支持 fetch"));
    return f(url, init);
  }
  function parseBody(res) {
    var ct = "";
    try { ct = (res.headers && res.headers.get && res.headers.get("content-type")) || ""; } catch (e) {}
    var isJson = ct.indexOf("json") !== -1;
    var p = isJson && res.json ? res.json() : (res.text ? res.text() : Promise.resolve(""));
    return p.catch(function () { return null; });
  }
  /* 统一请求：非 2xx 一律 reject，错误对象带 status / code / message，UI 据此给可读提示 */
  function request(url, init) {
    if (!isConfigured()) return Promise.reject(new Error("云端未配置"));
    return doFetch(url, init).then(function (res) {
      return parseBody(res).then(function (body) {
        if (res.ok) return body;
        var msg = (body && (body.error_description || body.msg || body.message || body.error)) || ("请求失败 " + res.status);
        var err = new Error(msg);
        err.status = res.status;
        err.code = body && (body.error_code || body.code);
        err.body = body;
        throw err;
      });
    });
  }

  /* ---------- 会话 ---------- */
  function accessTokenOf(s) {
    if (s && s.access_token) return s.access_token;
    return cfg.accessKey || "";   // 无会话时用 Publishable Key 走 anon 角色（RLS 仍会拦住越权）
  }
  /* 从 JWT 解出 sub / exp（响应缺字段时的兜底） */
  function decodeJwt(tok) {
    try {
      var part = String(tok).split(".")[1];
      if (!part) return null;
      var b64 = part.replace(/-/g, "+").replace(/_/g, "/");
      while (b64.length % 4) b64 += "=";
      var json = (typeof atob === "function")
        ? atob(b64)
        : Buffer.from(b64, "base64").toString("binary");
      return JSON.parse(json);
    } catch (e) { return null; }
  }
  /* CloudBase 的统一 token 响应：{ token_type, access_token, refresh_token,
     expires_in, scope, sub, groups }；匿名登录的 scope 为 "anonymous"。
     opts.prev 用于刷新场景兜底（刷新响应可能不带 scope/email）；
     opts.anonymous 用于显式标定匿名登录。 */
  function normalizeSession(raw, opts) {
    if (!raw || !raw.access_token) return null;
    opts = opts || {};
    var prev = opts.prev || null;
    var claim = decodeJwt(raw.access_token) || {};
    var exp = Number(raw.expires_at) || claim.exp || (Math.floor(Date.now() / 1000) + (Number(raw.expires_in) || 7200));
    var scope = raw.scope || claim.scope || "";
    var isAnon;
    if (opts.anonymous === true) isAnon = true;
    else if (opts.anonymous === false) isAnon = false;
    else if (scope) isAnon = (scope === "anonymous");
    else if (raw.is_anonymous != null) isAnon = !!raw.is_anonymous;
    else isAnon = !!(prev && prev.user && prev.user.is_anonymous);
    var u = raw.user || {};
    var id = raw.sub || u.id || claim.sub || (prev && prev.user && prev.user.id) || null;
    var email = raw.email || u.email || claim.email || (prev && prev.user && prev.user.email) || "";
    return {
      access_token: raw.access_token,
      refresh_token: raw.refresh_token || (prev && prev.refresh_token) || null,
      expires_at: exp,
      user: { id: id, email: email, is_anonymous: isAnon }
    };
  }
  function getSession() {
    if (session) return session;
    var raw = readRaw(SESSION_KEY);
    if (!raw) return null;
    try { session = JSON.parse(raw); } catch (e) { session = null; }
    return session;
  }
  function setSession(s) {
    session = s || null;
    if (session) writeRaw(SESSION_KEY, JSON.stringify(session));
    else dropRaw(SESSION_KEY);
    return session;
  }
  function clearSession() { return setSession(null); }
  function isExpired(s) { return !s || !s.expires_at || s.expires_at - REFRESH_SKEW <= Math.floor(Date.now() / 1000); }

  function authHeaders(extra) {
    var h = { "Content-Type": "application/json" };
    var tok = accessTokenOf(getSession());
    if (tok) h.Authorization = "Bearer " + tok;
    if (extra) for (var k in extra) if (extra.hasOwnProperty(k)) h[k] = extra[k];
    return h;
  }
  function authUrl(path) { return baseUrl() + "/auth/v1" + path; }

  /* ---------- 认证 ---------- */
  /* 匿名登录 = 设备账号。同一 x-device-id 永远对应同一个用户，因此可重复调用。 */
  function signInAnonymously() {
    return request(authUrl("/signin/anonymously"), {
      method: "POST",
      headers: authHeaders({ "x-device-id": deviceId() }),
      body: JSON.stringify({})
    }).then(function (body) {
      var s = normalizeSession(body, { anonymous: true });
      if (!s) throw new Error("匿名登录返回异常");
      return setSession(s);
    });
  }
  /* 刷新令牌：过期前自动续期，避免用户长时间停留后被登出 */
  function refreshSession() {
    var cur = getSession();
    if (!cur || !cur.refresh_token) return Promise.reject(new Error("无可刷新的会话"));
    return request(authUrl("/token"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: cur.refresh_token })
    }).then(function (body) {
      var s = normalizeSession(body, { prev: cur });
      if (!s) throw new Error("刷新令牌返回异常");
      return setSession(s);
    });
  }
  /* 确保有可用会话：有效则直接用，过期则刷新，失败/没有则匿名登录。
     注意匿名登录按设备 ID 去重，所以「刷新失败 → 重新匿名」不会丢身份。 */
  function ensureSession() {
    var cur = getSession();
    if (cur && !isExpired(cur)) return Promise.resolve(cur);
    if (cur && cur.refresh_token) {
      return refreshSession().catch(function () { return signInAnonymously(); });
    }
    return signInAnonymously();
  }
  /* 用户名 + 密码登录（CloudBase 用 username 而非 email；正式账号的可选登录方式） */
  function signInWithPassword(username, password) {
    return request(authUrl("/signin"), {
      method: "POST",
      headers: authHeaders({ "x-device-id": deviceId() }),
      body: JSON.stringify({ username: username, password: password })
    }).then(function (body) {
      var s = normalizeSession(body, { anonymous: false });
      if (!s) throw new Error("登录返回异常");
      return setSession(s);
    });
  }
  /* 发送邮箱验证码 → 记下 verification_id（校验时必须回传，故暂存在模块内） */
  function sendEmailCode(email) {
    return request(authUrl("/verification"), {
      method: "POST",
      headers: authHeaders({ "x-device-id": deviceId() }),
      body: JSON.stringify({ email: email, target: "ANY" })
    }).then(function (body) {
      pending = { id: (body && body.verification_id) || null, email: email };
      return body;
    });
  }
  /* 语义别名：绑定场景（已有匿名会话）与登录场景（无会话）走的是同一条接口 */
  function updateUserEmail(email) { return sendEmailCode(email); }
  function sendEmailOtp(email) { return sendEmailCode(email); }
  /* 校验邮箱验证码：
       · type !== "email"（绑定/升级）→ 注册接口并带上当前匿名 token，
         让正式账号直接接管原来的身份，本地历史数据不丢；
       · type === "email"（登录）    → 登录接口换取会话。 */
  function verifyEmailCode(email, code, type) {
    var pid = pending && pending.id;
    /* 必须是「先对这一邮箱发过码」才能校验：既挡住乱序调用，也避免拿别人的码来试 */
    if (!pid || (pending.email && email && String(pending.email).toLowerCase() !== String(email).toLowerCase())) {
      return Promise.reject(new Error("请先发送验证码"));
    }
    return request(authUrl("/verification/verify"), {
      method: "POST",
      headers: authHeaders({ "x-device-id": deviceId() }),
      body: JSON.stringify({ verification_id: pid, verification_code: String(code) })
    }).then(function (v) {
      var vt = v && (v.verification_token || v.access_token);
      if (!vt) throw new Error("验证码未通过");
      var isBind = (type !== "email");
      var cur = getSession();
      var body = isBind
        ? { email: email, verification_token: vt, anonymous_token: (cur && cur.access_token) || undefined }
        : { verification_token: vt };
      return request(authUrl(isBind ? "/signup" : "/signin"), {
        method: "POST",
        headers: authHeaders({ "x-device-id": deviceId() }),
        body: JSON.stringify(body)
      });
    }).then(function (res) {
      var s = normalizeSession(res, { anonymous: false });
      if (!s) throw new Error("登录返回异常");
      pending = null;
      return setSession(s);
    });
  }
  function signOut() {
    var cur = getSession();
    var done = function () { clearSession(); return true; };
    if (!cur || !cur.access_token) return Promise.resolve(done());
    return request(authUrl("/user/signout"), { method: "POST", headers: authHeaders() })
      .then(done, done);
  }

  /* ---------- 数据 API（PostgREST，语法与 Supabase 一致） ---------- */
  /* 查询串构造：数组 → in.(a,b)；"gte.x" 等操作符原样透传；其余按 eq 处理 */
  var PASSTHROUGH = { select: 1, order: 1, limit: 1, offset: 1, on_conflict: 1 };
  function buildQuery(params) {
    if (!params) return "";
    if (typeof params === "string") return params;
    var parts = [];
    Object.keys(params).forEach(function (k) {
      var v = params[k];
      if (v == null || v === "") return;
      if (PASSTHROUGH[k]) { parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(v)); return; }
      if (Object.prototype.toString.call(v) === "[object Array]") {
        parts.push(encodeURIComponent(k) + "=in.(" + v.map(encodeURIComponent).join(",") + ")");
        return;
      }
      var sv = String(v);
      var op = /^(eq|neq|gt|gte|lt|lte|like|ilike|is)\./.test(sv) ? "" : "eq.";
      parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(op + sv));
    });
    return parts.join("&");
  }
  function restUrl(table, params) {
    var qs = buildQuery(params);
    return baseUrl() + "/v1/rdb/rest/" + table + (qs ? "?" + qs : "");
  }
  function restSelect(table, params) {
    return request(restUrl(table, params), { method: "GET", headers: authHeaders() });
  }
  function restUpsert(table, rows, onConflict) {
    var p = { on_conflict: onConflict || "" };
    var h = authHeaders({ Prefer: "resolution=merge-duplicates,return=representation" });
    return request(restUrl(table, p), { method: "POST", headers: h, body: JSON.stringify(rows) });
  }
  function restInsert(table, rows) {
    return request(restUrl(table, null), {
      method: "POST",
      headers: authHeaders({ Prefer: "return=representation" }),
      body: JSON.stringify(rows)
    });
  }
  function restUpdate(table, patch, params) {
    return request(restUrl(table, params), {
      method: "PATCH",
      headers: authHeaders({ Prefer: "return=representation" }),
      body: JSON.stringify(patch)
    });
  }
  function restDelete(table, params) {
    return request(restUrl(table, params), {
      method: "DELETE",
      headers: authHeaders({ Prefer: "return=representation" })
    });
  }
  /* 调用数据库函数（PostgREST /rpc）。用于「凭邀请码入房」这类需要
     security definer 越过 RLS 的原子操作。 */
  function restRpc(fn, args) {
    return request(restUrl("rpc/" + fn, null), {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(args || {})
    });
  }

  var api = {
    configure: configure,
    getConfig: getConfig,
    isConfigured: isConfigured,
    baseUrl: baseUrl,
    deviceId: deviceId,
    SESSION_KEY: SESSION_KEY,
    DEVICE_KEY: DEVICE_KEY,
    /* 认证 */
    getSession: getSession,
    setSession: setSession,
    clearSession: clearSession,
    ensureSession: ensureSession,
    signInAnonymously: signInAnonymously,
    signInWithPassword: signInWithPassword,
    refreshSession: refreshSession,
    signOut: signOut,
    updateUserEmail: updateUserEmail,
    sendEmailOtp: sendEmailOtp,
    verifyEmailCode: verifyEmailCode,
    isExpired: isExpired,
    decodeJwt: decodeJwt,
    /* 数据 */
    buildQuery: buildQuery,
    select: restSelect,
    insert: restInsert,
    upsert: restUpsert,
    update: restUpdate,
    remove: restDelete,
    rpc: restRpc
  };
  return api;
});
