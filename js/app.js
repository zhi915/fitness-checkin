/* ===================== 健身打卡 App ===================== */
(function () {
  "use strict";

  var EXERCISE_TYPES = [
    { id: "running",  name: "跑步", emoji: "🏃", color: "#FF6B6B" },
    { id: "gym",     name: "健身", emoji: "🏋️", color: "#4ECDC4" },
    { id: "yoga",    name: "瑜伽", emoji: "🧘", color: "#A78BFA" },
    { id: "cycling", name: "骑行", emoji: "🚴", color: "#45B7D1" },
    { id: "swim",    name: "游泳", emoji: "🏊", color: "#5DADE2" },
    { id: "walk",    name: "徒步", emoji: "🚶", color: "#82C91E" },
    { id: "ball",    name: "球类", emoji: "⚽", color: "#F59E0B" },
    { id: "other",   name: "其他", emoji: "✨", color: "#9AA0A6" }
  ];
  var TYPE_MAP = {};
  EXERCISE_TYPES.forEach(function (t) { TYPE_MAP[t.id] = t; });

  var WEEK = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

  /* 每周排期：按星期几推荐今天练哪天（周一A 周二B 周三休息 周四C 周五D 周末休息） */
  var SCHEDULE = {
    0: { type: "rest", name: "瑜伽拉伸 / 放松恢复" },   // 周日
    1: { type: "train", day: "A" },                     // 周一
    2: { type: "train", day: "B" },                     // 周二
    3: { type: "rest", name: "瑜伽拉伸 / 放松恢复" },   // 周三
    4: { type: "train", day: "C" },                     // 周四
    5: { type: "train", day: "D" },                     // 周五
    6: { type: "rest", name: "瑜伽拉伸 / 放松恢复" }    // 周六
  };

  /* 默认训练计划：家庭中级分化（哑铃/杠铃/瑜伽垫，有基础） */
  var DEFAULT_PLAN = {
    note: "为「180cm / 72kg · 家庭健身 · 中级 · 器械：哑铃 / 杠铃 / 瑜伽垫」生成。每周 4 练（推/拉/腿/全身+有氧），隔天休息；休息日用瑜伽垫做拉伸。组间休 60-90 秒，动作标准优先。",
    rest: "休息日：瑜伽垫拉伸 / 泡沫轴 / 散步 20-30 分钟，保持活动、促进恢复。",
    days: [
      { id: "A", name: "A · 推（胸·肩·三头）", items: [
        "哑铃卧推 4组 × 8-10",
        "哑铃肩上推举 3组 × 10-12",
        "哑铃飞鸟 3组 × 12-15",
        "双杠臂屈伸 / 凳上臂屈伸 3组 × 10-12",
        "俯卧撑 2组 × 力竭"
      ]},
      { id: "B", name: "B · 拉（背·二头）", items: [
        "杠铃俯身划船 4组 × 8-10",
        "哑铃单臂划船 3组 × 10-12",
        "反向划船（桌下/TRX） 3组 × 10-12",
        "哑铃交替弯举 3组 × 10-12",
        "面拉（弹力带/哑铃） 3组 × 15"
      ]},
      { id: "C", name: "C · 腿（股·臀·核心）", items: [
        "杠铃深蹲 4组 × 8-10",
        "哑铃箭步蹲 3组 × 10/腿",
        "罗马尼亚硬拉（杠铃） 3组 × 10-12",
        "站姿提踵 4组 × 15-20",
        "平板支撑 3组 × 45-60秒"
      ]},
      { id: "D", name: "D · 全身+有氧", items: [
        "哑铃高翻 / 借力推举 3组 × 8",
        "波比跳 3组 × 12",
        "登山者 3组 × 30秒",
        "瑜伽垫核心（卷腹+臀桥） 3组 × 15",
        "瑜伽垫拉伸放松 10分钟"
      ]}
    ]
  };

  /* ---------- 数据层（多用户：每用户独立存储） ---------- */
  var USERS_KEY = "fitapp_users";
  var SESSION_KEY = "fitapp_session";
  var authMode = "login";
  var currentUser = null;
  var data = { records: {}, tasks: {}, plan: null, recDismiss: {} };

  function storeKeyFor(user) { return "fitapp_data_" + user; }

  function load() {
    if (!currentUser) return;
    try {
      var raw = localStorage.getItem(storeKeyFor(currentUser));
      if (raw) data = JSON.parse(raw);
      if (!data.records) data.records = {};
      if (!data.tasks) data.tasks = {};
      if (!data.plan) data.plan = null;
      if (!data.recDismiss) data.recDismiss = {};
    } catch (e) { data = { records: {}, tasks: {}, plan: null, recDismiss: {} }; }
  }
  function save() {
    if (!currentUser) return;
    try { localStorage.setItem(storeKeyFor(currentUser), JSON.stringify(data)); } catch (e) {}
  }

  /* ---------- 账户与鉴权（前端多账户；密码经 SHA-256 多次迭代哈希，无外部依赖、任意环境可用） ---------- */
  function randHex(n) {
    var b = new Uint8Array(n);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(b);
    else for (var i = 0; i < n; i++) b[i] = Math.floor(Math.random() * 256);
    var s = "";
    for (var j = 0; j < n; j++) s += ("0" + b[j].toString(16)).slice(-2);
    return s;
  }
  /* 纯 JS SHA-256（无需 secure context，本地 / 局域网 / file 均可运行） */
  function sha256(s) {
    function S(X, n) { return (X >>> n) | (X << (32 - n)); }
    function R(X, n) { return (X >>> n); }
    function Ch(x, y, z) { return ((x & y) ^ ((~x) & z)); }
    function Maj(x, y, z) { return ((x & y) ^ (x & z) ^ (y & z)); }
    function S0(x) { return (S(x, 2) ^ S(x, 13) ^ S(x, 22)); }
    function S1(x) { return (S(x, 6) ^ S(x, 11) ^ S(x, 25)); }
    function G0(x) { return (S(x, 7) ^ S(x, 18) ^ R(x, 3)); }
    function G1(x) { return (S(x, 17) ^ S(x, 19) ^ R(x, 10)); }
    function safeAdd(x, y) { var l = (x & 0xFFFF) + (y & 0xFFFF); var m = (x >> 16) + (y >> 16) + (l >> 16); return (m << 16) | (l & 0xFFFF); }
    var K = [0x428A2F98,0x71374491,0xB5C0FBCF,0xE9B5DBA5,0x3956C25B,0x59F111F1,0x923F82A4,0xAB1C5ED5,0xD807AA98,0x12835B01,0x243185BE,0x550C7DC3,0x72BE5D74,0x80DEB1FE,0x9BDC06A7,0xC19BF174,0xE49B69C1,0xEFBE4786,0x0FC19DC6,0x240CA1CC,0x2DE92C6F,0x4A7484AA,0x5CB0A9DC,0x76F988DA,0x983E5152,0xA831C66D,0xB00327C8,0xBF597FC7,0xC6E00BF3,0xD5A79147,0x06CA6351,0x14292967,0x27B70A85,0x2E1B2138,0x4D2C6DFC,0x53380D13,0x650A7354,0x766A0ABB,0x81C2C92E,0x92722C85,0xA2BFE8A1,0xA81A664B,0xC24B8B70,0xC76C51A3,0xD192E819,0xD6990624,0xF40E3585,0x106AA070,0x19A4C116,0x1E376C08,0x2748774C,0x34B0BCB5,0x391C0CB3,0x4ED8AA4A,0x5B9CCA4F,0x682E6FF3,0x748F82EE,0x78A5636F,0x84C87814,0x8CC70208,0x90BEFFFA,0xA4506CEB,0xBEF9A3F7,0xC67178F2];
    var H = [0x6A09E667,0xBB67AE85,0x3C6EF372,0xA54FF53A,0x510E527F,0x9B05688C,0x1F83D9AB,0x5BE0CD19];
    var m = [];
    for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); m[i >> 2] |= (c & 0xFF) << (24 - (i % 4) * 8); }
    var len = s.length * 8;
    m[len >> 5] |= 0x80 << (24 - (len % 32));
    m[(((len + 64) >> 9) << 4) + 15] = len;
    for (var i2 = 0; i2 < m.length; i2 += 16) {
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      var W = new Array(64);
      for (var j = 0; j < 64; j++) {
        if (j < 16) W[j] = m[j + i2] || 0;
        else W[j] = safeAdd(safeAdd(safeAdd(G1(W[j - 2]), W[j - 7]), G0(W[j - 15])), W[j - 16]);
        var T1 = safeAdd(safeAdd(safeAdd(safeAdd(h, S1(e)), Ch(e, f, g)), K[j]), W[j]);
        var T2 = safeAdd(S0(a), Maj(a, b, c));
        h = g; g = f; f = e; e = safeAdd(d, T1); d = c; c = b; b = a; a = safeAdd(T1, T2);
      }
      H[0] = safeAdd(a, H[0]); H[1] = safeAdd(b, H[1]); H[2] = safeAdd(c, H[2]); H[3] = safeAdd(d, H[3]);
      H[4] = safeAdd(e, H[4]); H[5] = safeAdd(f, H[5]); H[6] = safeAdd(g, H[6]); H[7] = safeAdd(h, H[7]);
    }
    var hex = "";
    for (var k = 0; k < 8; k++) {
      var v = H[k];
      hex += ("0" + ((v >>> 24) & 0xFF).toString(16)).slice(-2) +
             ("0" + ((v >>> 16) & 0xFF).toString(16)).slice(-2) +
             ("0" + ((v >>> 8) & 0xFF).toString(16)).slice(-2) +
             ("0" + (v & 0xFF).toString(16)).slice(-2);
    }
    return hex;
  }
  function pwHash(pw, saltHex) {
    var h = saltHex + "|" + pw;
    for (var i = 0; i < 5000; i++) h = sha256(h);
    return h;
  }
  function getUsers() {
    try { return JSON.parse(localStorage.getItem(USERS_KEY)) || {}; } catch (e) { return {}; }
  }
  function setUsers(u) { localStorage.setItem(USERS_KEY, JSON.stringify(u)); }
  function registerUser(username, pw) {
    return new Promise(function (resolve) {
      username = (username || "").trim();
      if (!username) { toast("请输入用户名"); return resolve(false); }
      if (pw.length < 4) { toast("密码至少 4 位"); return resolve(false); }
      var users = getUsers();
      if (users[username]) { toast("该用户名已存在"); return resolve(false); }
      var salt = randHex(16);
      users[username] = { salt: salt, hash: pwHash(pw, salt) };
      setUsers(users);
      localStorage.setItem(storeKeyFor(username), JSON.stringify({ records: {}, tasks: {}, plan: null, recDismiss: {} }));
      resolve(true);
    });
  }
  function verifyUser(username, pw) {
    var users = getUsers();
    var u = users[(username || "").trim()];
    if (!u) return Promise.resolve(false);
    return Promise.resolve(pwHash(pw, u.salt) === u.hash);
  }
  function logoutUser() {
    localStorage.removeItem(SESSION_KEY);
    currentUser = null;
    data = { records: {}, tasks: {}, plan: null, recDismiss: {} };
    showAuth();
  }

  /* ---------- 日期工具 ---------- */
  function fmt(d) {
    return d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
  }
  function todayKey() { return fmt(new Date()); }
  function dayDiff(a, b) {
    var da = new Date(a + "T00:00:00");
    var db = new Date(b + "T00:00:00");
    return Math.round((db - da) / 86400000);
  }
  function humanDate(k) {
    var d = new Date(k + "T00:00:00");
    return (d.getMonth() + 1) + "月" + d.getDate() + "日 " + WEEK[d.getDay()];
  }
  function lastNDays(n) {
    var arr = [], base = new Date();
    for (var i = n - 1; i >= 0; i--) {
      var x = new Date(); x.setDate(base.getDate() - i);
      arr.push(fmt(x));
    }
    return arr;
  }

  /* ---------- 记录读写 ---------- */
  function getRecord(k) { return data.records[k]; }
  function ensureRecord(k) {
    if (!data.records[k]) data.records[k] = { date: k, checkedIn: false, exercises: [] };
    return data.records[k];
  }
  function dayDuration(k) {
    var r = getRecord(k); if (!r) return 0;
    return r.exercises.reduce(function (s, e) { return s + (Number(e.duration) || 0); }, 0);
  }
  function isChecked(k) {
    var r = getRecord(k); return !!(r && r.checkedIn);
  }

  /* ---------- 统计 ---------- */
  function computeStreaks() {
    var keys = Object.keys(data.records)
      .filter(function (k) { return data.records[k].checkedIn; })
      .sort();
    var total = keys.length, longest = 0, cur = 0, prev = null;
    keys.forEach(function (k) {
      if (prev) {
        var diff = dayDiff(prev, k);
        cur = (diff === 1) ? cur + 1 : 1;
      } else cur = 1;
      if (cur > longest) longest = cur;
      prev = k;
    });
    var streak = 0, d = new Date();
    if (!isChecked(todayKey())) d.setDate(d.getDate() - 1);
    while (true) {
      var k = fmt(d);
      if (isChecked(k)) { streak++; d.setDate(d.getDate() - 1); }
      else break;
    }
    return { total: total, current: streak, longest: longest };
  }
  function totals() {
    var dur = 0, cal = 0;
    Object.keys(data.records).forEach(function (k) {
      var r = data.records[k];
      r.exercises.forEach(function (e) {
        dur += Number(e.duration) || 0;
        cal += Number(e.calories) || 0;
      });
    });
    return { dur: dur, cal: cal };
  }

  /* ---------- DOM 引用 ---------- */
  function $(id) { return document.getElementById(id); }

  /* ---------- Toast ---------- */
  var toastTimer = null;
  function toast(msg) {
    var t = $("toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 1800);
  }

  /* ---------- 渲染：今日 ---------- */
  function renderToday() {
    var tk = todayKey();
    var now = new Date();
    $("headerDate").textContent = now.getFullYear() + "年" + (now.getMonth() + 1) + "月" + now.getDate() + "日 " + WEEK[now.getDay()];

    var s = computeStreaks();
    $("statStreak").textContent = s.current;
    $("statTotal").textContent = s.total;

    var checked = isChecked(tk);
    var btn = $("checkinBtn");
    if (checked) {
      btn.classList.add("done");
      $("checkinText").textContent = "已打卡 ✓";
      $("heroHint").textContent = "点击可继续记录，或打开弹层撤销";
      $("heroGreet").textContent = "今天已完成，继续保持！";
    } else {
      btn.classList.remove("done");
      $("checkinText").textContent = "今日打卡";
      $("heroHint").textContent = "点击按钮，记录今天的坚持";
      $("heroGreet").textContent = s.current > 0 ? "昨天坚持了，今天继续！" : "今天也要加油 💪";
    }

    var r = getRecord(tk);
    var list = $("todayList");
    list.innerHTML = "";
    if (r && r.exercises.length) {
      r.exercises.forEach(function (e) { list.appendChild(exRow(e)); });
    } else {
      var empty = document.createElement("div");
      empty.className = "ex-empty";
      empty.textContent = checked ? "今日已打卡，还没记录具体运动～" : "还没有记录，点击上方按钮打卡吧";
      list.appendChild(empty);
    }
    renderTasks();
    renderRecommend();
  }

  /* 按星期几推荐今日训练（横幅） */
  function renderRecommend() {
    var box = $("recoBanner");
    if (!box) return;
    var today = todayKey();
    if (data.recDismiss && data.recDismiss[today]) { box.hidden = true; box.innerHTML = ""; return; }
    var now = new Date();
    var sc = SCHEDULE[now.getDay()];
    if (!sc) { box.hidden = true; return; }
    if (sc.type === "rest") {
      box.innerHTML =
        '<div class="reco-ico">🧘</div>' +
        '<div class="reco-main"><div class="reco-title">今天休息日 · 放松恢复</div>' +
        '<div class="reco-sub">' + escapeHtml(sc.name) + '</div></div>' +
        '<button class="reco-x" data-act="dismiss">✕</button>';
      box.hidden = false;
      return;
    }
    var day = null;
    DEFAULT_PLAN.days.forEach(function (d) { if (d.id === sc.day) day = d; });
    if (!day) { box.hidden = true; return; }
    box.innerHTML =
      '<div class="reco-ico">💪</div>' +
      '<div class="reco-main"><div class="reco-title">今天是' + WEEK[now.getDay()] + ' · 推荐练 ' + escapeHtml(day.name) + '</div>' +
      '<div class="reco-sub">一键载入今日任务，跟着练</div></div>' +
      '<button class="reco-btn" data-act="load" data-day="' + day.id + '">载入</button>' +
      '<button class="reco-x" data-act="dismiss">✕</button>';
    box.hidden = false;
  }

  function exRow(e) {
    var t = TYPE_MAP[e.type] || TYPE_MAP.other;
    var row = document.createElement("div");
    row.className = "ex-item";
    var meta = [];
    if (e.duration) meta.push(e.duration + " 分钟");
    if (e.calories) meta.push(e.calories + " 千卡");
    row.innerHTML =
      '<div class="ex-emoji">' + t.emoji + '</div>' +
      '<div class="ex-main"><div class="ex-name">' + t.name + '</div>' +
      '<div class="ex-meta">' + (meta.length ? meta.join(" · ") : "已记录") +
      (e.note ? " · " + escapeHtml(e.note) : "") + '</div></div>';
    return row;
  }

  /* ---------- 今日任务（动作清单，逐条完成） ---------- */
  function getTasks(k) {
    if (!data.tasks[k]) data.tasks[k] = [];
    return data.tasks[k];
  }
  function renderTasks() {
    var tk = todayKey();
    var tasks = getTasks(tk);
    var doneCount = tasks.filter(function (t) { return t.done; }).length;
    $("taskProgress").textContent = tasks.length ? (doneCount + "/" + tasks.length) : "";

    var cur = null;
    for (var i = 0; i < tasks.length; i++) { if (!tasks[i].done) { cur = tasks[i]; break; } }

    var curBox = $("taskCurrent");
    curBox.innerHTML = "";
    if (cur) {
      var c = document.createElement("div");
      c.className = "task-current-card";
      c.innerHTML =
        '<div class="tc-label">当前动作</div>' +
        '<div class="tc-text">' + escapeHtml(cur.text) + '</div>' +
        taskFieldsHtml(cur) +
        '<button class="tc-btn" data-id="' + cur.id + '">完成 ✓</button>';
      curBox.appendChild(c);
    } else if (tasks.length) {
      var all = document.createElement("div");
      all.className = "task-all-done";
      all.textContent = "🎉 今日任务全部完成！";
      curBox.appendChild(all);
    } else {
      var hint = document.createElement("div");
      hint.className = "task-hint";
      hint.textContent = "还没有安排任务，下面添加今天的动作计划吧";
      curBox.appendChild(hint);
    }

    var list = $("taskList");
    list.innerHTML = "";
    tasks.forEach(function (t) {
      var row = document.createElement("div");
      row.className = "task-item" + (t.done ? " done" : "") + (cur && cur.id === t.id ? " current" : "");
      row.innerHTML =
        '<button class="task-check' + (t.done ? " on" : "") + '" data-id="' + t.id + '">' + (t.done ? "✓" : "") + '</button>' +
        '<div class="task-text">' + escapeHtml(t.text) + '</div>' +
        '<button class="task-del" data-id="' + t.id + '">✕</button>' +
        taskFieldsHtml(t);
      list.appendChild(row);
    });
  }
  /* 重量/组数/次数 输入控件 HTML */
  function taskFieldsHtml(t) {
    return '<div class="task-fields">' +
      '<div class="tf"><label>重量kg</label><input type="number" inputmode="decimal" class="tf-w" data-id="' + t.id + '" placeholder="—" value="' + escapeHtml(t.w || "") + '"></div>' +
      '<div class="tf"><label>组数</label><input type="number" inputmode="numeric" class="tf-s" data-id="' + t.id + '" placeholder="—" value="' + escapeHtml(t.s || "") + '"></div>' +
      '<div class="tf"><label>次数</label><input type="number" inputmode="numeric" class="tf-r" data-id="' + t.id + '" placeholder="—" value="' + escapeHtml(t.r || "") + '"></div>' +
      '</div>';
  }
  function updateTaskField(id, field, val) {
    var tasks = getTasks(todayKey());
    for (var i = 0; i < tasks.length; i++) {
      if (tasks[i].id === id) { tasks[i][field] = val; break; }
    }
    save();
  }
  function onTaskFieldInput(e) {
    var el = e.target;
    if (!el.classList) return;
    var field = null;
    if (el.classList.contains("tf-w")) field = "w";
    else if (el.classList.contains("tf-s")) field = "s";
    else if (el.classList.contains("tf-r")) field = "r";
    if (!field) return;
    updateTaskField(el.getAttribute("data-id"), field, el.value);
  }
  function addTask() {
    var inp = $("taskInput");
    var text = inp.value.trim();
    if (!text) { toast("请输入动作内容"); return; }
    getTasks(todayKey()).push({ id: "t" + Date.now() + Math.floor(Math.random() * 1000), text: text, done: false, w: "", s: "", r: "" });
    save();
    inp.value = "";
    renderTasks();
  }
  function toggleTask(id) {
    var tasks = getTasks(todayKey());
    for (var i = 0; i < tasks.length; i++) {
      if (tasks[i].id === id) { tasks[i].done = !tasks[i].done; break; }
    }
    save();
    renderTasks();
  }
  function deleteTask(id) {
    var tk = todayKey();
    data.tasks[tk] = getTasks(tk).filter(function (t) { return t.id !== id; });
    save();
    renderTasks();
  }

  /* ---------- 渲染：日历 ---------- */
  var calYear, calMonth;
  function renderCalendar() {
    var now = new Date();
    if (calYear === undefined) { calYear = now.getFullYear(); calMonth = now.getMonth(); }
    var first = new Date(calYear, calMonth, 1);
    var startW = first.getDay();
    var daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    var tk = todayKey();

    $("calMonth").textContent = calYear + "年" + (calMonth + 1) + "月";
    var grid = $("calGrid");
    grid.innerHTML = "";
    for (var i = 0; i < startW; i++) {
      var blank = document.createElement("div");
      blank.className = "cal-cell muted";
      grid.appendChild(blank);
    }
    for (var d = 1; d <= daysInMonth; d++) {
      var cell = document.createElement("div");
      cell.className = "cal-cell";
      var key = calYear + "-" + String(calMonth + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
      var isFuture = dayDiff(tk, key) > 0;
      if (isChecked(key)) cell.classList.add("done");
      if (key === tk) cell.classList.add("today");
      if (isFuture) cell.classList.add("future");
      cell.textContent = d;
      if (!isFuture) {
        (function (k) {
          cell.addEventListener("click", function () { selectDay(k); });
        })(key);
      }
      grid.appendChild(cell);
    }
  }

  function selectDay(k) {
    renderDayDetail(k);
    openSheet(k);
  }

  function renderDayDetail(k) {
    var title = $("dayDetailTitle");
    title.textContent = humanDate(k) + " 详情";
    var box = $("dayDetail");
    box.innerHTML = "";
    var r = getRecord(k);
    if (!r || (!r.checkedIn && r.exercises.length === 0)) {
      var e = document.createElement("div");
      e.className = "day-empty";
      e.textContent = "这一天没有打卡记录";
      box.appendChild(e);
      return;
    }
    var head = document.createElement("div");
    head.className = "day-row";
    head.innerHTML = '<div class="ex-emoji">' + (isChecked(k) ? "✅" : "📝") + '</div>' +
      '<div class="ex-main"><div class="ex-name">' + (isChecked(k) ? "已打卡" : "未打卡") +
      '</div><div class="ex-meta">共 ' + r.exercises.length + ' 项 · ' + dayDuration(k) + ' 分钟</div></div>';
    box.appendChild(head);
    r.exercises.forEach(function (ex) { box.appendChild(exRow(ex)); });
  }

  /* ---------- 弹层：记录运动 ---------- */
  var editDate = null;
  var selectedType = EXERCISE_TYPES[0].id;

  function renderChips() {
    var box = $("typeChips");
    box.innerHTML = "";
    EXERCISE_TYPES.forEach(function (t) {
      var c = document.createElement("div");
      c.className = "chip" + (t.id === selectedType ? " sel" : "");
      c.innerHTML = t.emoji + " " + t.name;
      c.addEventListener("click", function () {
        selectedType = t.id; renderChips();
      });
      box.appendChild(c);
    });
  }

  function renderEditList() {
    var box = $("editList");
    box.innerHTML = "";
    var r = getRecord(editDate);
    if (!r || !r.exercises.length) {
      var e = document.createElement("div");
      e.className = "day-empty";
      e.textContent = "还没有添加运动";
      box.appendChild(e);
      return;
    }
    r.exercises.forEach(function (ex, idx) {
      var t = TYPE_MAP[ex.type] || TYPE_MAP.other;
      var row = document.createElement("div");
      row.className = "edit-item";
      var meta = [];
      if (ex.duration) meta.push(ex.duration + "分");
      if (ex.calories) meta.push(ex.calories + "千卡");
      row.innerHTML =
        '<span class="ei-emoji">' + t.emoji + '</span>' +
        '<div class="ei-main"><div class="ei-name">' + t.name + '</div>' +
        '<div class="ei-meta">' + (meta.length ? meta.join(" · ") : "已记录") + '</div></div>' +
        '<button class="ei-del">🗑</button>';
      row.querySelector(".ei-del").addEventListener("click", function () {
        var rec = getRecord(editDate);
        if (rec) { rec.exercises.splice(idx, 1); save(); renderEditList(); renderDayDetail(editDate); }
      });
      box.appendChild(row);
    });
  }

  function openSheet(k) {
    editDate = k;
    selectedType = EXERCISE_TYPES[0].id;
    $("sheetTitle").textContent = humanDate(k) + " · 运动记录";
    $("inpDuration").value = "";
    $("inpCalories").value = "";
    $("inpNote").value = "";
    renderChips();
    renderEditList();
    var r = getRecord(k);
    $("btnUndo").hidden = !(r && r.checkedIn);
    $("btnFinish").textContent = (k === todayKey()) ? "完成打卡" : "保存";
    $("sheetOverlay").hidden = false;
  }
  function closeSheet() { $("sheetOverlay").hidden = true; editDate = null; }

  function addExercise() {
    var dur = parseInt($("inpDuration").value, 10);
    var cal = parseInt($("inpCalories").value, 10) || 0;
    var note = $("inpNote").value.trim();
    if (!dur || dur <= 0) { toast("请填写运动时长"); return; }
    var rec = ensureRecord(editDate);
    rec.exercises.push({ type: selectedType, duration: dur, calories: cal, note: note });
    save();
    renderEditList();
    renderDayDetail(editDate);
    $("inpDuration").value = ""; $("inpCalories").value = ""; $("inpNote").value = "";
    toast("已添加");
  }

  function finishSheet() {
    var rec = ensureRecord(editDate);
    if (editDate === todayKey()) {
      rec.checkedIn = true;
    } else {
      rec.checkedIn = rec.exercises.length > 0;
    }
    save();
    closeSheet();
    refreshAll();
    toast(editDate === todayKey() ? "打卡成功 🔥" : "已保存");
  }

  function undoToday() {
    var rec = getRecord(todayKey());
    if (rec) {
      rec.checkedIn = false;
      if (rec.exercises.length === 0) delete data.records[todayKey()];
    }
    save();
    closeSheet();
    refreshAll();
    toast("已撤销今日打卡");
  }

  /* ---------- 统计 + 图表 ---------- */
  function renderStats() {
    var s = computeStreaks();
    var t = totals();
    $("sumTotal").textContent = s.total;
    $("sumCur").textContent = s.current;
    $("sumLong").textContent = s.longest;
    $("sumDur").textContent = t.dur;

    renderTypeDist();
    drawWeekChart();
    drawTrendChart();
  }

  function renderTypeDist() {
    var map = {};
    Object.keys(data.records).forEach(function (k) {
      data.records[k].exercises.forEach(function (e) {
        map[e.type] = (map[e.type] || 0) + (Number(e.duration) || 0);
      });
    });
    var rows = EXERCISE_TYPES
      .map(function (tp) { return { tp: tp, val: map[tp.id] || 0 }; })
      .filter(function (r) { return r.val > 0; })
      .sort(function (a, b) { return b.val - a.val; });
    var box = $("typeDist");
    box.innerHTML = "";
    if (!rows.length) {
      box.innerHTML = '<div class="day-empty">还没有运动数据</div>';
      return;
    }
    var max = rows[0].val;
    rows.forEach(function (r) {
      var row = document.createElement("div");
      row.className = "dist-row";
      row.innerHTML =
        '<span class="dist-emoji">' + r.tp.emoji + '</span>' +
        '<span class="dist-name">' + r.tp.name + '</span>' +
        '<div class="dist-bar-wrap"><div class="dist-bar" style="width:' +
        (r.val / max * 100) + '%;background:' + r.tp.color + '"></div></div>' +
        '<span class="dist-val">' + r.val + '分</span>';
      box.appendChild(row);
    });
  }

  function setupCanvas(canvas) {
    var dpr = window.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    var w = rect.width || canvas.parentNode.clientWidth || 300;
    var h = rect.height || 180;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx: ctx, w: w, h: h };
  }

  function drawWeekChart() {
    var canvas = $("chartWeek");
    var s = setupCanvas(canvas);
    var ctx = s.ctx, w = s.w, h = s.h;
    var keys = lastNDays(7);
    var vals = keys.map(function (k) { return dayDuration(k); });
    var max = Math.max.apply(null, vals.concat([1]));
    var padB = 22, padT = 14;
    var bw = (w - 20) / 7;
    ctx.textAlign = "center";
    for (var i = 0; i < 7; i++) {
      var cx = 10 + bw * i + bw / 2;
      var bh = (vals[i] / max) * (h - padB - padT);
      var x = 10 + bw * i + bw * 0.2;
      var bwReal = bw * 0.6;
      var y = h - padB - bh;
      ctx.fillStyle = isChecked(keys[i]) ? "#11998e" : "#d9e6e3";
      roundRect(ctx, x, y, bwReal, bh, 5); ctx.fill();
      ctx.fillStyle = "#7a8a88";
      ctx.font = "11px sans-serif";
      ctx.fillText(String(new Date(keys[i] + "T00:00:00").getDate()), cx, h - 6);
      if (vals[i] > 0) {
        ctx.fillStyle = "#1c2b2a";
        ctx.font = "10px sans-serif";
        ctx.fillText(vals[i], cx, y - 4);
      }
    }
  }

  function drawTrendChart() {
    var canvas = $("chartTrend");
    var s = setupCanvas(canvas);
    var ctx = s.ctx, w = s.w, h = s.h;
    var keys = lastNDays(30);
    var vals = keys.map(function (k) { return dayDuration(k); });
    var max = Math.max.apply(null, vals.concat([1]));
    var padL = 6, padR = 6, padT = 12, padB = 18;
    var plotW = w - padL - padR, plotH = h - padT - padB;
    function px(i) { return padL + (plotW * i) / (keys.length - 1); }
    function py(v) { return padT + plotH * (1 - v / max); }

    // grid
    ctx.strokeStyle = "#eef3f2"; ctx.lineWidth = 1;
    for (var g = 0; g <= 3; g++) {
      var gy = padT + (plotH * g) / 3;
      ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(w - padR, gy); ctx.stroke();
    }
    // area
    var grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
    grad.addColorStop(0, "rgba(17,153,142,0.30)");
    grad.addColorStop(1, "rgba(17,153,142,0.02)");
    ctx.beginPath();
    ctx.moveTo(px(0), py(vals[0]));
    for (var i = 1; i < vals.length; i++) ctx.lineTo(px(i), py(vals[i]));
    ctx.lineTo(px(vals.length - 1), padT + plotH);
    ctx.lineTo(px(0), padT + plotH);
    ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
    // line
    ctx.beginPath();
    ctx.moveTo(px(0), py(vals[0]));
    for (var j = 1; j < vals.length; j++) ctx.lineTo(px(j), py(vals[j]));
    ctx.strokeStyle = "#11998e"; ctx.lineWidth = 2; ctx.stroke();
    // points (checked days)
    for (var p = 0; p < vals.length; p++) {
      if (isChecked(keys[p])) {
        ctx.beginPath(); ctx.arc(px(p), py(vals[p]), 2.5, 0, Math.PI * 2);
        ctx.fillStyle = "#11998e"; ctx.fill();
      }
    }
    // x labels
    ctx.fillStyle = "#7a8a88"; ctx.font = "10px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("30天前", px(0), h - 4);
    ctx.fillText("今天", px(vals.length - 1), h - 4);
  }

  function roundRect(ctx, x, y, w, h, r) {
    if (h <= 0) { ctx.beginPath(); return; }
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ---------- 训练计划 ---------- */
  function ensurePlan() {
    if (!data.plan) { data.plan = DEFAULT_PLAN; save(); }
  }
  function getPlanDay(dayId) {
    if (!data.plan) return null;
    for (var i = 0; i < data.plan.days.length; i++) {
      if (data.plan.days[i].id === dayId) return data.plan.days[i];
    }
    return null;
  }
  /* 从计划条目文本里解析出默认组数/次数，作为记录默认值 */
  function parsePlanItem(text) {
    var s = null, r = null;
    var m = text.match(/(\d+)\s*组/); if (m) s = parseInt(m[1], 10);
    var m2 = text.match(/[×xX]\s*(\d+(?:-\d+)?)/); if (m2) r = m2[1];
    return { s: s, r: r };
  }
  function renderPlan() {
    if (!data.plan) return;
    $("planIntro").textContent = data.plan.note || "";
    var list = $("planList");
    list.innerHTML = "";
    data.plan.days.forEach(function (d) {
      var card = document.createElement("div");
      card.className = "plan-card";
      var items = d.items.map(function (it) { return "<li>" + escapeHtml(it) + "</li>"; }).join("");
      card.innerHTML =
        '<div class="plan-name">' + escapeHtml(d.name) + '</div>' +
        '<ul class="plan-items">' + items + '</ul>' +
        '<button class="plan-load" data-day="' + d.id + '">载入今日</button>';
      list.appendChild(card);
    });
    $("planRest").textContent = data.plan.rest || "";
  }
  function loadPlanDay(dayId) {
    if (!data.plan) return;
    var day = getPlanDay(dayId);
    if (!day) return;
    var tk = todayKey();
    var existing = getTasks(tk);
    if (existing.length && !confirm("今日已有 " + existing.length + " 项任务，用「" + day.name + "」替换？")) return;
    data.tasks[tk] = day.items.map(function (it) {
      var p = parsePlanItem(it);
      return {
        id: "t" + Date.now() + Math.floor(Math.random() * 1000),
        text: it, done: false, src: dayId,
        w: "", s: p.s != null ? String(p.s) : "", r: p.r != null ? String(p.r) : ""
      };
    });
    save();
    showTab("today");
    renderTasks();
    renderRecommend();
    toast("已载入：" + day.name);
  }

  /* ---------- 标签切换 ---------- */
  function showTab(name) {
    document.querySelectorAll(".tab-panel").forEach(function (p) { p.classList.remove("active"); });
    document.querySelectorAll(".nav-btn").forEach(function (b) { b.classList.remove("active"); });
    $("panel-" + name).classList.add("active");
    document.querySelector('.nav-btn[data-tab="' + name + '"]').classList.add("active");
    if (name === "stats") renderStats();
    if (name === "plan") renderPlan();
  }

  /* ---------- 工具 ---------- */
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function refreshAll() {
    renderToday();
    renderCalendar();
    if ($("panel-stats").classList.contains("active")) renderStats();
  }

  function exportData() {
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = "健身打卡数据_" + todayKey() + ".json";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast("数据已导出");
  }

  /* ---------- 事件绑定 ---------- */
  function bind() {
    document.querySelectorAll(".nav-btn").forEach(function (b) {
      b.addEventListener("click", function () { showTab(b.dataset.tab); });
    });
    $("checkinBtn").addEventListener("click", function () { openSheet(todayKey()); });
    $("calPrev").addEventListener("click", function () { calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } renderCalendar(); });
    $("calNext").addEventListener("click", function () { calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } renderCalendar(); });
    $("sheetClose").addEventListener("click", closeSheet);
    $("sheetOverlay").addEventListener("click", function (e) { if (e.target === $("sheetOverlay")) closeSheet(); });
    $("btnAddExercise").addEventListener("click", addExercise);
    $("btnFinish").addEventListener("click", finishSheet);
    $("btnUndo").addEventListener("click", undoToday);
    $("exportBtn").addEventListener("click", exportData);
    $("resetBtn").addEventListener("click", function () {
      if (confirm("确定清空所有打卡数据？此操作不可恢复。")) {
        data = { records: {}, tasks: {}, plan: null, recDismiss: {} }; ensurePlan(); save(); refreshAll(); toast("已清空");
      }
    });
    $("taskAddBtn").addEventListener("click", addTask);
    $("taskInput").addEventListener("keydown", function (e) { if (e.key === "Enter") addTask(); });
    $("taskList").addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("button") : null;
      if (!btn) return;
      var id = btn.getAttribute("data-id");
      if (btn.classList.contains("task-check")) toggleTask(id);
      else if (btn.classList.contains("task-del")) deleteTask(id);
    });
    $("taskCurrent").addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("button") : null;
      if (btn && btn.classList.contains("tc-btn")) toggleTask(btn.getAttribute("data-id"));
    });
    /* 当前动作卡片里的重量/组数/次数输入 */
    $("taskCurrent").addEventListener("input", function (e) {
      onTaskFieldInput(e);
    });
    /* 列表里每个动作的重量/组数/次数输入 */
    $("taskList").addEventListener("input", function (e) {
      onTaskFieldInput(e);
    });
    /* 今日训练推荐横幅 */
    $("recoBanner").addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("button") : null;
      if (!btn) return;
      var act = btn.getAttribute("data-act");
      if (act === "load") loadPlanDay(btn.getAttribute("data-day"));
      else if (act === "dismiss") {
        if (!data.recDismiss) data.recDismiss = {};
        data.recDismiss[todayKey()] = true; save(); renderRecommend();
      }
    });
    $("planList").addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("button") : null;
      if (btn && btn.classList.contains("plan-load")) loadPlanDay(btn.getAttribute("data-day"));
    });
    window.addEventListener("resize", function () {
      if ($("panel-stats").classList.contains("active")) renderStats();
    });
    /* 登录 / 注册 / 退出 */
    document.querySelectorAll(".auth-tab").forEach(function (b) {
      b.addEventListener("click", function () {
        authMode = b.getAttribute("data-mode");
        document.querySelectorAll(".auth-tab").forEach(function (x) { x.classList.remove("active"); });
        b.classList.add("active");
        $("authSubmit").textContent = (authMode === "register") ? "注册并进入" : "登录";
        $("authErr").textContent = "";
      });
    });
    $("authSubmit").addEventListener("click", submitAuth);
    $("authPass").addEventListener("keydown", function (e) { if (e.key === "Enter") submitAuth(); });
    $("authUser").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); $("authPass").focus(); } });
    $("logoutBtn").addEventListener("click", function () {
      if (confirm("退出当前账号？本机数据仍保留，可重新登录。")) logoutUser();
    });
  }

  /* ---------- 启动与鉴权流程 ---------- */
  function init() {
    bind();
    boot();
  }
  function boot() {
    var sess = localStorage.getItem(SESSION_KEY);
    if (sess && getUsers()[sess]) {
      currentUser = sess;
      enterApp();
    } else {
      if (sess) localStorage.removeItem(SESSION_KEY);
      showAuth();
    }
  }
  function enterApp() {
    load();
    ensurePlan();
    renderToday();
    renderCalendar();
    updateUserBadge();
    hideAuth();
  }
  function showAuth() {
    $("authScreen").hidden = false;
    $("app").style.display = "none";
    $("authErr").textContent = "";
    $("authUser").value = "";
    $("authPass").value = "";
    setTimeout(function () { try { $("authUser").focus(); } catch (e) {} }, 50);
  }
  function hideAuth() {
    $("authScreen").hidden = true;
    $("app").style.display = "block";
  }
  function updateUserBadge() {
    $("userName").textContent = currentUser || "";
  }
  function submitAuth() {
    var u = $("authUser").value.trim();
    var p = $("authPass").value;
    if (!u || !p) { $("authErr").textContent = "请输入用户名和密码"; return; }
    $("authErr").textContent = "";
    if (authMode === "register") {
      registerUser(u, p).then(function (ok) {
        if (ok) {
          localStorage.setItem(SESSION_KEY, u);
          currentUser = u;
          enterApp();
        }
      });
    } else {
      verifyUser(u, p).then(function (ok) {
        if (ok) {
          localStorage.setItem(SESSION_KEY, u);
          currentUser = u;
          enterApp();
        } else {
          $("authErr").textContent = "用户名或密码错误";
        }
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else { init(); }

  // Service Worker（优雅降级：不支持或 file:// 下静默失败）
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    });
  }
})();
