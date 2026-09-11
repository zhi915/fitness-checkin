/* ============================================================
   健身打卡 App · 组队房间领域层（v5.0.0，纯函数）
   ------------------------------------------------------------
   职责：把「本地打卡数据」和「云端摘要行」之间的转换、聚合、排序
         全部收敛为**无副作用纯函数**，不碰 DOM / 网络 / localStorage。
   好处：
     · 可直接在 Node 里 require 做单测（test_social.js）；
     · 组队页只负责画，不负责算，逻辑不会散落在 UI 代码里。
   ------------------------------------------------------------
   云端只存**摘要**，不存动作明细（用户已确认「仅摘要」口径）：
     day_summaries = { user_id, day, checked, done_count, total, kcal, updated_at }
   双用封装：浏览器 window.FitSocial / Node require("./js/social.js")
   ============================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FitSocial = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /* 邀请码字符集：剔除 I / O / 0 / 1 等易混字符，避免口头传播时读错 */
  var CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  var CODE_LEN = 6;

  /* 集体目标类型：本版只做「全队累计打卡天数」 */
  var GOAL_KINDS = { days: { id: "days", name: "累计打卡天数", unit: "天" } };

  function normNickname(s) {
    var v = (s == null ? "" : String(s)).trim();
    return v || "健身伙伴";
  }

  /* ---------- 日期：全部按 UTC 运算，避免本机时区导致跨日误判 ---------- */
  function parseDay(k) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(k || ""));
    if (!m) return null;
    return { y: +m[1], m: +m[2], d: +m[3] };
  }
  function fmtDay(dt) {
    return dt.getUTCFullYear() + "-" + String(dt.getUTCMonth() + 1).padStart(2, "0") + "-" + String(dt.getUTCDate()).padStart(2, "0");
  }
  function addDays(k, n) {
    var p = parseDay(k); if (!p) return k;
    var dt = new Date(Date.UTC(p.y, p.m - 1, p.d));
    dt.setUTCDate(dt.getUTCDate() + n);
    return fmtDay(dt);
  }
  /* 本周一（周一为一周起点，与 App 的周计划一致） */
  function weekStart(k) {
    var p = parseDay(k); if (!p) return k;
    var wd = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();  // 0=周日
    var back = (wd === 0) ? 6 : (wd - 1);
    return addDays(k, -back);
  }
  function monthStart(k) {
    var p = parseDay(k); if (!p) return k;
    return p.y + "-" + String(p.m).padStart(2, "0") + "-01";
  }
  function daysBetween(a, b) {
    var pa = parseDay(a), pb = parseDay(b); if (!pa || !pb) return 0;
    return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86400000);
  }

  /* ---------- 邀请码 ---------- */
  function genRoomCode(len, rnd) {
    var n = len || CODE_LEN;
    var r = rnd || Math.random;
    var out = "";
    for (var i = 0; i < n; i++) out += CODE_ALPHABET.charAt(Math.floor(r() * CODE_ALPHABET.length) % CODE_ALPHABET.length);
    return out;
  }
  function normalizeCode(s) {
    return String(s == null ? "" : s).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, CODE_LEN);
  }
  function isValidCode(s) { return /^[A-Z0-9]{6}$/.test(normalizeCode(s)) && normalizeCode(s).length === 6; }

  /* ---------- 本地 → 云端摘要行 ---------- */
  /* derived = deriveDay(date) 的结果；kcal 为当日估算消耗（千卡） */
  function summaryRow(userId, day, derived, kcal) {
    var d = derived || {};
    var row = {
      day: day,
      checked: !!d.checked,
      done_count: Math.max(0, Number(d.doneCount) || 0),
      total: Math.max(0, Number(d.total) || 0),
      kcal: Math.max(0, Math.round(Number(kcal) || 0))
    };
    if (userId) row.user_id = userId;
    return row;
  }
  /* 个人资料行：id 必须等于 auth.uid()，RLS 才放行。
     avatar 为可选的自定义图片头像（压缩后的 dataURL，约 5~8KB）。
     ⚠️ 只有当它真的有值 / 调用方显式要求时才写进 row ——
        老库没有 avatar 列，写了会报 42703，所以由调用方决定。 */
  function profileRow(userId, nickname, emoji, streaks, avatar) {
    var s = streaks || {};
    var row = {
      id: userId,
      nickname: normNickname(nickname),
      emoji: emoji || "💪",
      streak: Math.max(0, Number(s.current) || 0),
      total_days: Math.max(0, Number(s.total) || 0)
    };
    if (avatar != null) row.avatar = avatar;
    return row;
  }

  /* ---------- 云端摘要行 → 聚合视图 ---------- */
  function byUser(rows) {
    var out = {};
    (rows || []).forEach(function (r) {
      if (!r || !r.user_id) return;
      if (!out[r.user_id]) out[r.user_id] = [];
      out[r.user_id].push(r);
    });
    return out;
  }
  function kcalByUser(rows) {
    var out = {};
    (rows || []).forEach(function (r) {
      if (!r || !r.user_id) return;
      out[r.user_id] = (out[r.user_id] || 0) + (Number(r.kcal) || 0);
    });
    return out;
  }
  function checkedDayCount(rows) {
    return (rows || []).filter(function (r) { return r && r.checked; }).length;
  }
  /* 集体目标进度：done = 全队已打卡天数合计 */
  function progress(rows, target) {
    var t = Math.max(1, Number(target) || 1);
    var done = checkedDayCount(rows);
    var pct = Math.min(100, Math.round((done / t) * 100));
    return { done: done, target: t, pct: pct, remain: Math.max(0, t - done) };
  }
  /* 每人「今天」那一行 */
  function todayMap(rows, today) {
    var out = {};
    (rows || []).forEach(function (r) {
      if (!r || r.day !== today || !r.user_id) return;
      out[r.user_id] = r;
    });
    return out;
  }

  /* ---------- 成员看板 ----------
     members: [{ user_id, nickname, emoji, streak, total_days }]
     rows:    该房间在统计区间内的 day_summaries
     today:   "YYYY-MM-DD"
     weekFrom/…: 已由调用方截好区间（本函数不做时间过滤，保持纯粹）
     排序：今日已打卡 → 连续天数 → 本周消耗 → 昵称 */
  function memberBoard(members, rows, today) {
    var tmap = todayMap(rows, today);
    var kcal = kcalByUser(rows);
    var list = (members || []).map(function (m) {
      var t = tmap[m.user_id] || null;
      return {
        id: m.user_id,
        nickname: normNickname(m.nickname),
        emoji: m.emoji || "💪",
        avatar: m.avatar || "",
        streak: Math.max(0, Number(m.streak) || 0),
        totalDays: Math.max(0, Number(m.total_days) || 0),
        todayChecked: !!(t && t.checked),
        todayKcal: t ? (Number(t.kcal) || 0) : 0,
        weekKcal: Math.round(kcal[m.user_id] || 0)
      };
    });
    list.sort(function (a, b) {
      if (a.todayChecked !== b.todayChecked) return a.todayChecked ? -1 : 1;
      if (b.streak !== a.streak) return b.streak - a.streak;
      if (b.weekKcal !== a.weekKcal) return b.weekKcal - a.weekKcal;
      return a.nickname < b.nickname ? -1 : (a.nickname > b.nickname ? 1 : 0);
    });
    return list;
  }

  /* 房间整体概览（今日打卡人数 / 成员数），供头部展示 */
  function roomOverview(board) {
    var b = board || [];
    var done = b.filter(function (m) { return m.todayChecked; }).length;
    return { done: done, total: b.length, allDone: b.length > 0 && done === b.length };
  }

  return {
    CODE_ALPHABET: CODE_ALPHABET,
    CODE_LEN: CODE_LEN,
    GOAL_KINDS: GOAL_KINDS,
    normNickname: normNickname,
    /* 日期 */
    parseDay: parseDay,
    addDays: addDays,
    weekStart: weekStart,
    monthStart: monthStart,
    daysBetween: daysBetween,
    /* 邀请码 */
    genRoomCode: genRoomCode,
    normalizeCode: normalizeCode,
    isValidCode: isValidCode,
    /* 行构造 */
    summaryRow: summaryRow,
    profileRow: profileRow,
    /* 聚合 */
    byUser: byUser,
    kcalByUser: kcalByUser,
    checkedDayCount: checkedDayCount,
    progress: progress,
    todayMap: todayMap,
    memberBoard: memberBoard,
    roomOverview: roomOverview
  };
});
