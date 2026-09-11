/* ============================================================
   组队页演示 · 假云端（只在 room-demo.html 里被注入）
   ------------------------------------------------------------
   用途：用户还没建 CloudBase 环境时，也能看到「已接上云端 + 已加入房间」
         时组队页长什么样。它把 fetch 换成一个内存里的假后端。
   注意：本文件**不参与正式 App**（index.html 不引用它），仅供演示。
   响应形状刻意对齐腾讯云开发 CloudBase 的真实返回（token_type/scope/sub）。
   ============================================================ */
(function () {
  var DEMO_ENV = "demo-env";
  var DEMO_KEY = "demo0000000000000000000000000000000000000";
  var ME = "demo-user-me";

  function pad(n) { return String(n).padStart(2, "0"); }
  function fmt(dt) { return dt.getFullYear() + "-" + pad(dt.getMonth() + 1) + "-" + pad(dt.getDate()); }
  function shift(n) { var d = new Date(); d.setDate(d.getDate() + n); return fmt(d); }
  function monthStart() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-01"; }

  var today = fmt(new Date());
  var mStart = monthStart();

  /* 成员（昵称/表情/连胜/累计天数，模拟 profiles 表） */
  var MEMBERS = [
    { user_id: ME, nickname: "小明", emoji: "💪", streak: 6, total_days: 24 },
    { user_id: "demo-user-2", nickname: "阿强", emoji: "🏋️", streak: 11, total_days: 38 },
    { user_id: "demo-user-3", nickname: "小美", emoji: "🧘", streak: 3, total_days: 9 }
  ];
  var ROOM = { id: "demo-room-1", code: "K7X2QM", name: "晨练小分队", goal_kind: "days", goal_value: 30 };

  /* 摘要：按「今天往前几天」造，落在本月之外的自动丢弃（与真实统计口径一致） */
  var PLAN = [
    [ME, 0, true, 268], [ME, -1, true, 240], [ME, -3, true, 190],
    ["demo-user-2", 0, true, 342], ["demo-user-2", -1, true, 310], ["demo-user-2", -4, true, 285],
    ["demo-user-3", -2, true, 120], ["demo-user-3", 0, false, 0]
  ];
  var SUMMARIES = PLAN.map(function (p) {
    return { user_id: p[0], day: shift(p[1]), checked: !!p[2], done_count: p[2] ? 4 : 0, total: 4, kcal: p[3] };
  }).filter(function (r) { return r.day >= mStart; });

  var extra = [];   // 演示中用户自己打卡后追加的摘要

  function allSummaries() { return SUMMARIES.concat(extra); }

  function b64url(o) {
    return btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  var exp = function () { return Math.floor(Date.now() / 1000) + 86400; };
  /* 匿名会话：与 CloudBase /auth/v1/signin/anonymously 的返回形状一致 */
  function anonSession() {
    var tok = b64url({ alg: "HS256", typ: "JWT" }) + "." +
      b64url({ sub: ME, scope: "anonymous", exp: exp() }) + ".sig";
    return { token_type: "Bearer", access_token: tok, refresh_token: "demo-rt", expires_in: 86400, scope: "anonymous", sub: ME };
  }
  /* 正式会话：绑定邮箱之后 */
  function permSession(email) {
    var tok = b64url({ alg: "HS256", typ: "JWT" }) + "." +
      b64url({ sub: ME, email: email, scope: "user", exp: exp() }) + ".sig";
    return { token_type: "Bearer", access_token: tok, refresh_token: "demo-rt", expires_in: 86400, scope: "user", sub: ME, email: email };
  }
  function reply(status, body) {
    return {
      ok: status >= 200 && status < 300,
      status: status,
      headers: { get: function (k) { return String(k).toLowerCase() === "content-type" ? "application/json" : null; } },
      json: function () { return Promise.resolve(body); },
      text: function () { return Promise.resolve(JSON.stringify(body)); }
    };
  }

  function mock(url, init) {
    var u = String(url);
    var m = (init && init.method) || "GET";
    var body = null;
    try { body = init && init.body ? JSON.parse(init.body) : null; } catch (e) {}

    /* 认证：按路径从长到短匹配，避免 /verification 抢走 /verification/verify */
    if (u.indexOf("/auth/v1/verification/verify") !== -1) return Promise.resolve(reply(200, { verification_token: "demo-vt", expires_in: 600 }));
    if (u.indexOf("/auth/v1/verification") !== -1) return Promise.resolve(reply(200, { verification_id: "demo-vid", expires_in: 600, is_user: true }));
    if (u.indexOf("/auth/v1/signin/anonymously") !== -1) return Promise.resolve(reply(200, anonSession()));
    if (u.indexOf("/auth/v1/signup") !== -1) {
      return Promise.resolve(reply(200, permSession((body && body.email) || "demo@example.com")));
    }
    if (u.indexOf("/auth/v1/signin") !== -1) return Promise.resolve(reply(200, permSession((body && body.username) || "demo@example.com")));
    if (u.indexOf("/auth/v1/token") !== -1) return Promise.resolve(reply(200, anonSession()));
    if (u.indexOf("/auth/v1/user") !== -1) return Promise.resolve(reply(200, {}));

    if (u.indexOf("/v1/rdb/rest/profiles") !== -1) {
      var row = body && body[0] ? body[0] : {};
      var me = MEMBERS[0];
      if (row.nickname) me.nickname = row.nickname;
      if (typeof row.streak === "number") me.streak = row.streak;
      if (typeof row.total_days === "number") me.total_days = row.total_days;
      return Promise.resolve(reply(200, [me]));
    }
    if (u.indexOf("/v1/rdb/rest/room_members") !== -1 && u.indexOf("select=user_id") !== -1) {
      return Promise.resolve(reply(200, MEMBERS.map(function (x) {
        return { user_id: x.user_id, joined_at: mStart, profiles: { nickname: x.nickname, emoji: x.emoji, streak: x.streak, total_days: x.total_days } };
      })));
    }
    if (u.indexOf("/v1/rdb/rest/room_members") !== -1) {
      return Promise.resolve(reply(200, [{ room_id: ROOM.id, joined_at: mStart, rooms: ROOM }]));
    }
    if (u.indexOf("/v1/rdb/rest/day_summaries") !== -1 && m === "GET") {
      return Promise.resolve(reply(200, allSummaries()));
    }
    if (u.indexOf("/v1/rdb/rest/day_summaries") !== -1) {
      // 演示中在本页打卡 → 覆盖同键摘要，看板立刻反映出来
      var rows = body || [];
      rows.forEach(function (r) {
        SUMMARIES = SUMMARIES.filter(function (x) { return !(x.user_id === r.user_id && x.day === r.day); });
        extra = extra.filter(function (x) { return !(x.user_id === r.user_id && x.day === r.day); });
        extra.push(r);
      });
      return Promise.resolve(reply(200, rows));
    }
    if (u.indexOf("/v1/rdb/rest/rpc/") !== -1) return Promise.resolve(reply(200, [ROOM]));
    if (u.indexOf("/v1/rdb/rest/rooms") !== -1) return Promise.resolve(reply(200, [ROOM]));

    return Promise.resolve(reply(404, { message: "demo mock 未覆盖：" + m + " " + u }));
  }

  window.FitCloud.configure({ envId: DEMO_ENV, accessKey: DEMO_KEY, fetch: mock });
  window.__DEMO_ROOM__ = { room: ROOM, members: MEMBERS };
})();
