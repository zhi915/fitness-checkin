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

  /* ---------- 应用版本（主界面右上角标识，确认是否运行最新版） ---------- */
  var APP_VERSION = "2.4.0";

  /* ---------- 数据层（单机版：统一存储，无登录） ---------- */
  var DATA_KEY = "fitapp_data";
  var currentUser = "我";   // 单机模式内部标记，无登录
  var data = { records: {}, tasks: {}, plan: null, recDismiss: {} };

  function storeKeyFor() { return DATA_KEY; }

  function load() {
    try {
      var raw = localStorage.getItem(DATA_KEY);
      if (raw) data = JSON.parse(raw);
      if (!data.records) data.records = {};
      if (!data.tasks) data.tasks = {};
      if (!data.plan) data.plan = null;
      if (!data.recDismiss) data.recDismiss = {};
    } catch (e) { data = { records: {}, tasks: {}, plan: null, recDismiss: {} }; }
  }
  function save() {
    try { localStorage.setItem(DATA_KEY, JSON.stringify(data)); } catch (e) {}
  }

  /* ---------- 账户与鉴权（无登录版 v2.2.0 已移除） ---------- */

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
    renderTodayActions();
  }

  /* 今日动作记录：把今天做过的动作（含重量/组数/次数）展示出来 */
  function renderTodayActions() {
    var tk = todayKey();
    var r = getRecord(tk);
    var box = $("todayActions");
    var title = $("todayActionsTitle");
    box.innerHTML = "";
    if (!r || !r.actions || !r.actions.length) { title.hidden = true; return; }
    title.hidden = false;
    r.actions.forEach(function (a) { box.appendChild(actionRow(a)); });
  }
  /* 动作记录行（打卡记录里复用） */
  function actionRow(a) {
    var meta = [];
    if (a.w) meta.push(a.w + "kg");
    if (a.s) meta.push(a.s + "组");
    if (a.r) meta.push("×" + a.r);
    var row = document.createElement("div");
    row.className = "today-action" + (a.done ? " done" : "");
    row.innerHTML =
      '<span class="da-check">' + (a.done ? "✓" : "") + '</span>' +
      '<div class="da-main"><div class="da-text">' + escapeHtml(a.text) + '</div>' +
      (meta.length ? '<div class="da-meta">' + meta.join(" · ") + '</div>' : '') + '</div>';
    return row;
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
        '<div class="tc-actions">' +
        '<button class="tc-replace" data-id="' + cur.id + '">更换动作</button>' +
        '<button class="tc-btn" data-id="' + cur.id + '">完成 ✓</button>' +
        '</div>';
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
        '<button class="task-replace" data-id="' + t.id + '">更换</button>' +
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

  /* ---------- 更换动作 ---------- */
  var replaceTargetId = null;
  function openReplace(id) {
    replaceTargetId = id;
    var tk = todayKey();
    var tasks = getTasks(tk);
    var cur = null;
    for (var i = 0; i < tasks.length; i++) { if (tasks[i].id === id) { cur = tasks[i]; break; } }
    var list = $("replaceList");
    list.innerHTML = "";
    if (data.plan && data.plan.days) {
      data.plan.days.forEach(function (d) {
        var head = document.createElement("div");
        head.className = "replace-day";
        head.textContent = d.name;
        list.appendChild(head);
        d.items.forEach(function (it) {
          var row = document.createElement("div");
          row.className = "replace-item";
          row.textContent = it;
          if (cur && cur.text === it) row.classList.add("same");
          row.addEventListener("click", function () { doReplace(it); });
          list.appendChild(row);
        });
      });
    }
    $("replaceCustom").value = "";
    $("replaceOverlay").hidden = false;
  }
  function closeReplace() { $("replaceOverlay").hidden = true; replaceTargetId = null; }
  function doReplace(newText) {
    if (!replaceTargetId) return;
    var tasks = getTasks(todayKey());
    for (var i = 0; i < tasks.length; i++) {
      if (tasks[i].id === replaceTargetId) {
        var p = parsePlanItem(newText);
        tasks[i].text = newText;
        tasks[i].w = "";
        tasks[i].s = p.s != null ? String(p.s) : "";
        tasks[i].r = p.r != null ? String(p.r) : "";
        break;
      }
    }
    save();
    closeReplace();
    renderTasks();
    toast("已更换动作");
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
    /* 今日做过的动作内容（重量/组数/次数） */
    if (r.actions && r.actions.length) {
      var aHead = document.createElement("div");
      aHead.className = "day-row day-actions-head";
      aHead.innerHTML = '<div class="ex-main"><div class="ex-name">今日动作</div></div>';
      box.appendChild(aHead);
      r.actions.forEach(function (a) { box.appendChild(actionRow(a)); });
    }
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
      /* 把今天做过的动作内容（含重量/组数/次数）一并写入打卡记录 */
      var tasks = getTasks(todayKey());
      rec.actions = tasks.map(function (t) {
        return { text: t.text, w: t.w, s: t.s, r: t.r, done: t.done };
      });
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

  /* ============================================================
     分步打卡向导（一次一个动作 + 滚轮调重量/组数/次数）
     ============================================================ */
  var WEIGHTS = []; for (var wv = 0; wv <= 200; wv += 2.5) WEIGHTS.push(Math.round(wv * 10) / 10);
  var SETS = []; for (var sv = 1; sv <= 10; sv++) SETS.push(sv);
  var REPS = []; for (var rv = 1; rv <= 30; rv++) REPS.push(rv);

  var wizTasks = [];
  var wizIndex = 0;
  var wizEmpty = false;

  function numOr(v, def) { var n = parseFloat(v); return isNaN(n) ? def : n; }

  function openWizard(k) {
    var tasks = getTasks(k);
    wizTasks = tasks;
    wizIndex = 0;
    var btn = $("wizNext");
    if (!tasks.length) {
      // 休息日 / 未安排：直接打卡
      wizEmpty = true;
      $("wizBody").classList.add("empty");
      $("wizActionName").textContent = "今天没有安排动作";
      $("wizActionMeta").textContent = "点击「完成打卡」记录今天的状态，或返回去添加动作。";
      $("wizProgress").innerHTML = "";
      $("wizCount").textContent = "";
      btn.textContent = "完成打卡";
      btn.classList.add("finish");
      $("wizard").hidden = false;
      return;
    }
    wizEmpty = false;
    $("wizBody").classList.remove("empty");
    btn.classList.remove("finish");
    $("wizard").hidden = false;
    renderWizardStep();
  }

  function renderWizardStep() {
    var total = wizTasks.length;
    var prog = $("wizProgress");
    prog.innerHTML = "";
    for (var i = 0; i < total; i++) {
      var d = document.createElement("div");
      d.className = "wiz-dot" + (i <= wizIndex ? " on" : "");
      prog.appendChild(d);
    }
    $("wizCount").textContent = (wizIndex + 1) + " / " + total;
    var t = wizTasks[wizIndex];
    $("wizActionName").textContent = t.text;
    var meta = [];
    if (t.w) meta.push(t.w + "kg");
    if (t.s) meta.push(t.s + "组");
    if (t.r) meta.push("×" + t.r);
    $("wizActionMeta").innerHTML = meta.length
      ? "预设 <b>" + meta.join(" · ") + "</b>，可滑动滚轮微调"
      : "可滑动滚轮设置重量 / 组数 / 次数";
    buildWheel("wheelItemsW", "wheelW", WEIGHTS, numOr(t.w, 0));
    buildWheel("wheelItemsS", "wheelS", SETS, numOr(t.s, 1));
    buildWheel("wheelItemsR", "wheelR", REPS, numOr(t.r, 1));
    var btn = $("wizNext");
    if (wizIndex === total - 1) { btn.textContent = "完成"; btn.classList.add("finish"); }
    else { btn.textContent = "下一个"; btn.classList.remove("finish"); }
  }

  function buildWheel(itemsElId, wheelElId, values, initial) {
    var box = $(itemsElId);
    box.innerHTML = "";
    var initIdx = 0;
    values.forEach(function (v, i) {
      var d = document.createElement("div");
      var isSel = (String(v) === String(initial));
      d.className = "wheel-item" + (isSel ? " sel" : "");
      d.textContent = (wheelElId === "wheelW")
        ? (Math.round(v * 10) / 10 % 1 === 0 ? v : (Math.round(v * 10) / 10).toFixed(1))
        : v;
      box.appendChild(d);
      if (isSel) initIdx = i;
    });
    var wheel = $(wheelElId);
    wheel.scrollTop = initIdx * 44;
    requestAnimationFrame(function () { wheel.scrollTop = initIdx * 44; });
    wheel.onscroll = function () {
      var idx = Math.round(wheel.scrollTop / 44);
      idx = Math.max(0, Math.min(values.length - 1, idx));
      var items = box.children;
      for (var i = 0; i < items.length; i++) items[i].classList.toggle("sel", i === idx);
      commitWheel(wheelElId, values[idx]);
    };
  }

  function commitWheel(wheelElId, val) {
    if (wizEmpty || !wizTasks.length) return;
    var t = wizTasks[wizIndex];
    if (wheelElId === "wheelW") t.w = (val === 0 ? "" : val);
    else if (wheelElId === "wheelS") t.s = val;
    else if (wheelElId === "wheelR") t.r = val;
    save();
  }

  function nextStep() {
    if (wizEmpty || !wizTasks.length) { finishWizard(); return; }
    if (wizIndex < wizTasks.length - 1) { wizIndex++; renderWizardStep(); }
    else { finishWizard(); }
  }

  function finishWizard() {
    var rec = ensureRecord(todayKey());
    if (wizEmpty || !wizTasks.length) {
      rec.checkedIn = true;
      rec.actions = [];
    } else {
      wizTasks.forEach(function (t) { t.done = true; });
      rec.checkedIn = true;
      rec.actions = wizTasks.map(function (t) {
        return { text: t.text, w: t.w, s: t.s, r: t.r, done: true };
      });
    }
    save();
    showWizardDone();
  }

  function showWizardDone() {
    var body = $("wizBody");
    body.className = "wiz-body";
    body.innerHTML =
      '<div class="wiz-done">' +
      '<div class="wiz-done-ico">✓</div>' +
      '<div class="wiz-done-title">今日打卡完成！</div>' +
      '<div class="wiz-done-sub">已记录 ' + (wizTasks.length || 0) + ' 个动作，继续加油 💪</div></div>';
    $("wizProgress").innerHTML = "";
    $("wizCount").textContent = "";
    $("wizBack").style.visibility = "hidden";
    $("wizNext").style.display = "none";
    setTimeout(function () { closeWizard(); refreshAll(); toast("打卡成功 🔥"); }, 1300);
  }

  function closeWizard() {
    $("wizard").hidden = true;
    $("wizNext").style.display = "";
    $("wizBack").style.visibility = "visible";
    wizTasks = []; wizIndex = 0; wizEmpty = false;
  }

  /* ---------- 事件绑定 ---------- */
  function bind() {
    document.querySelectorAll(".nav-btn").forEach(function (b) {
      b.addEventListener("click", function () { showTab(b.dataset.tab); });
    });
    $("checkinBtn").addEventListener("click", function () { openWizard(todayKey()); });
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
      else if (btn.classList.contains("task-replace")) openReplace(id);
    });
    $("taskCurrent").addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("button") : null;
      if (!btn) return;
      var id = btn.getAttribute("data-id");
      if (btn.classList.contains("tc-btn")) toggleTask(id);
      else if (btn.classList.contains("tc-replace")) openReplace(id);
    });
    /* 更换动作弹层 */
    $("replaceClose").addEventListener("click", closeReplace);
    $("replaceOverlay").addEventListener("click", function (e) { if (e.target === $("replaceOverlay")) closeReplace(); });
    $("replaceCustomBtn").addEventListener("click", function () {
      var v = $("replaceCustom").value.trim();
      if (!v) { toast("请输入自定义动作"); return; }
      doReplace(v);
    });
    $("replaceCustom").addEventListener("keydown", function (e) { if (e.key === "Enter") { var v = e.target.value.trim(); if (v) doReplace(v); } });
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
    /* 分步打卡向导 */
    $("wizNext").addEventListener("click", nextStep);
    $("wizBack").addEventListener("click", function () {
      if (wizEmpty || !wizTasks.length) { closeWizard(); return; }
      if (wizIndex > 0) { wizIndex--; renderWizardStep(); }
      else { closeWizard(); }
    });
    /* 无登录版：无登录相关事件 */
  }

  /* ---------- 启动与鉴权流程 ---------- */
  function init() {
    bind();
    boot();
  }
  function boot() {
    enterApp();
  }
  function enterApp() {
    load();
    ensurePlan();
    autoScheduleToday();
    renderToday();
    renderCalendar();
    try { $("appVersion").textContent = "v" + APP_VERSION; } catch (e) {}
  }

  /* 根据周计划 + 星期几，自动安排今日任务（仅当今日尚无任务时执行，避免覆盖手动改动） */
  function buildTaskFromPlanItem(it) {
    var p = parsePlanItem(it);
    return {
      id: "t" + Date.now() + Math.floor(Math.random() * 1000),
      text: it, done: false, src: "plan",
      w: "", s: p.s != null ? String(p.s) : "", r: p.r != null ? String(p.r) : ""
    };
  }
  function autoScheduleToday() {
    var tk = todayKey();
    var tasks = getTasks(tk);
    if (tasks.length) return;                       // 今日已有任务（手动或已排），不覆盖
    if (data.recDismiss && data.recDismiss[tk]) return; // 用户曾忽略推荐
    var now = new Date();
    var sc = SCHEDULE[now.getDay()];
    if (!sc || sc.type !== "train") return;          // 休息日不自动排训练
    var day = getPlanDay(sc.day);
    if (!day) return;
    data.tasks[tk] = day.items.map(buildTaskFromPlanItem);
    save();
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
