  /* ===================== 健身打卡 App ===================== */
  (function () {
  "use strict";

  /* 卡路里纯算法模块（js/calc.js，先于本文件加载）：纯函数，便于单测与集中调参 */
  var CALC = (typeof window !== "undefined" && window.FitCalc) ? window.FitCalc : null;
  /* 云端（CloudBase 轻客户端）与组队领域层（先于本文件加载）；缺失时自动降级为纯本地模式 */
  var CLOUD = (typeof window !== "undefined" && window.FitCloud) ? window.FitCloud : null;
  var SOCIAL = (typeof window !== "undefined" && window.FitSocial) ? window.FitSocial : null;
  var CLOUD_CFG = (typeof window !== "undefined" && window.FIT_CLOUD_CONFIG) ? window.FIT_CLOUD_CONFIG : null;

  /* ============================================================
     运动类型（有氧 / 球类 / 游泳 等，MET 用于卡路里估算）
     ============================================================ */
  var EXERCISE_TYPES = [
    { id: "running",  name: "跑步", emoji: "🏃", icon: "ic-run",   color: "#2563EB", met: 7 },
    { id: "gym",     name: "健身", emoji: "🏋️", icon: "ic-dumbbell", color: "#1D4ED8", met: 5 },
    { id: "yoga",    name: "瑜伽", emoji: "🧘", icon: "ic-yoga",  color: "#7C3AED", met: 2.5 },
    { id: "cycling", name: "骑行", emoji: "🚴", icon: "ic-cycle", color: "#0EA5E9", met: 5 },
    { id: "swim",    name: "游泳", emoji: "🏊", icon: "ic-swim",  color: "#06B6D4", met: 6 },
    { id: "walk",    name: "徒步", emoji: "🚶", icon: "ic-walk",  color: "#16A34A", met: 3.5 },
    { id: "ball",    name: "球类", emoji: "⚽", icon: "ic-ball",  color: "#F59E0B", met: 6.5 },
    { id: "other",   name: "其他", emoji: "✨", icon: "ic-other", color: "#64748B", met: 4 }
  ];

  /* 具体项目的 MET 与默认时长（分钟）——记录运动弹层用 */
  var SPORT_LIB = {
    "羽毛球":   { met: 5.5, minutes: 40 },
    "篮球":     { met: 8,   minutes: 45 },
    "足球":     { met: 8,   minutes: 45 },
    "网球":     { met: 7,   minutes: 40 },
    "乒乓球":   { met: 4,   minutes: 30 },
    "排球":     { met: 4,   minutes: 40 },
    "自由泳":   { met: 6,   minutes: 30 },
    "蛙泳":     { met: 6,   minutes: 30 },
    "骑行(休闲)": { met: 5, minutes: 30 },
    "慢跑":     { met: 7,   minutes: 20 }
  };
  var TYPE_SPORTS = {
    ball:    ["羽毛球", "篮球", "足球", "网球", "乒乓球", "排球"],
    swim:    ["自由泳", "蛙泳"],
    running: ["慢跑"],
    cycling: ["骑行(休闲)"],
    gym:     [],
    yoga:    [],
    walk:    [],
    other:   []
  };
  function sportsOf(type) { return TYPE_SPORTS[type] || []; }
  var TYPE_MAP = {};
  EXERCISE_TYPES.forEach(function (t) { TYPE_MAP[t.id] = t; });

  var WEEK = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

  /* ============================================================
     场景：居家 home / 健身房 gym
     ============================================================ */
  var SCENES = {
    home: { id: "home", name: "居家", emoji: "🏠" },
    gym:  { id: "gym",  name: "健身房", emoji: "🏢" }
  };

  /* ============================================================
     结构化动作数据库（v3.0）
     每个动作：{ id, name, part, equip, scenes[], weighted, met, icon,
               sets, reps, timed, muscles, tips }
     - equip:  器械（徒手/哑铃/杠铃/瑜伽垫/固定器械/绳索/弹力带/单杠）
     - scenes: 适用场景（home / gym，可同时适用）
     - weighted: 是否需要额外负重（false = 自重动作，打卡界面不显示重量滚轮）
     - timed:  以时间计（如平板支撑），reps 为秒数
     - met:    代谢当量（力量动作按组间休息折算的中等强度值）
     ============================================================ */
  var PARTS = [
    { id: "chest",    name: "胸",   icon: "ic-chest",    emoji: "🫁" },
    { id: "back",     name: "背",   icon: "ic-back",     emoji: "🔙" },
    { id: "legs",     name: "腿",   icon: "ic-leg",      emoji: "🦵" },
    { id: "shoulder", name: "肩",   icon: "ic-shoulder", emoji: "🤸" },
    { id: "arms",     name: "手臂", icon: "ic-biceps",   emoji: "💪" },
    { id: "core",     name: "核心", icon: "ic-core",     emoji: "🔥" },
    { id: "cardio",   name: "有氧", icon: "ic-cardio",   emoji: "🏃" },
    { id: "stretch",  name: "拉伸", icon: "ic-stretch",  emoji: "🧘" }
  ];
  var PART_MAP = {}; PARTS.forEach(function (p) { PART_MAP[p.id] = p; });

  /* 器械图标映射（用于动作库/详情展示） */
  var EQUIP_ICON = {
    "徒手": "ic-bodyweight", "自重": "ic-bodyweight", "哑铃": "ic-dumbbell", "杠铃": "ic-barbell",
    "固定器械": "ic-machine", "绳索": "ic-machine", "弹力带": "ic-machine", "单杠": "ic-pullup",
    "瑜伽垫": "ic-yoga", "药球": "ic-bodyweight", "壶铃": "ic-dumbbell"
  };

  /* --- 动作库：胸 --- */
  var EX_LIB = [];
  function ex(o) { o.id = "e" + EX_LIB.length; EX_LIB.push(o); return o; }

  /* 胸（居家可做：哑铃卧推/飞鸟/俯卧撑；健身房可做：固定器械/杠铃平板） */
  ex({ name: "哑铃卧推", part: "chest", equip: "哑铃", scenes: ["home", "gym"], weighted: true, met: 6, icon: "ic-chest", sets: 4, reps: "8-10", muscles: "胸大肌·三头", tips: "肩胛后收下沉，下放至胸侧" });
  ex({ name: "上斜哑铃卧推", part: "chest", equip: "哑铃", scenes: ["home", "gym"], weighted: true, met: 6, icon: "ic-chest", sets: 3, reps: "10-12", muscles: "上胸" });
  ex({ name: "哑铃飞鸟", part: "chest", equip: "哑铃", scenes: ["home", "gym"], weighted: true, met: 5.5, icon: "ic-chest", sets: 3, reps: "12-15", muscles: "胸大肌" });
  ex({ name: "俯卧撑", part: "chest", equip: "徒手", scenes: ["home", "gym"], weighted: false, met: 6, icon: "ic-bodyweight", sets: 3, reps: "力竭", muscles: "胸·三头·核心" });
  ex({ name: "上斜俯卧撑", part: "chest", equip: "徒手", scenes: ["home", "gym"], weighted: false, met: 5, icon: "ic-bodyweight", sets: 3, reps: "12-15", muscles: "胸大肌" });
  ex({ name: "宽距俯卧撑", part: "chest", equip: "徒手", scenes: ["home", "gym"], weighted: false, met: 6, icon: "ic-bodyweight", sets: 3, reps: "10-15", muscles: "胸外侧" });
  ex({ name: "双杠臂屈伸", part: "chest", equip: "单杠", scenes: ["gym"], weighted: false, met: 6.5, icon: "ic-pullup", sets: 3, reps: "8-12", muscles: "下胸·三头" });
  ex({ name: "器械推胸", part: "chest", equip: "固定器械", scenes: ["gym"], weighted: true, met: 6, icon: "ic-machine", sets: 4, reps: "10-12", muscles: "胸大肌" });
  ex({ name: "蝴蝶机夹胸", part: "chest", equip: "固定器械", scenes: ["gym"], weighted: true, met: 5.5, icon: "ic-machine", sets: 3, reps: "12-15", muscles: "胸中缝" });
  ex({ name: "杠铃平板卧推", part: "chest", equip: "杠铃", scenes: ["gym"], weighted: true, met: 6.5, icon: "ic-barbell", sets: 4, reps: "6-10", muscles: "胸大肌·三头" });
  ex({ name: "绳索夹胸", part: "chest", equip: "绳索", scenes: ["gym"], weighted: true, met: 5.5, icon: "ic-machine", sets: 3, reps: "12-15", muscles: "胸大肌" });
  ex({ name: "下斜卧推", part: "chest", equip: "杠铃", scenes: ["gym"], weighted: true, met: 6.5, icon: "ic-barbell", sets: 3, reps: "8-10", muscles: "下胸" });

  /* 背（居家：哑铃划船；健身房：高位下拉/坐姿划船/引体） */
  ex({ name: "杠铃俯身划船", part: "back", equip: "杠铃", scenes: ["home", "gym"], weighted: true, met: 6, icon: "ic-barbell", sets: 4, reps: "8-10", muscles: "背阔肌·菱形肌" });
  ex({ name: "哑铃单臂划船", part: "back", equip: "哑铃", scenes: ["home", "gym"], weighted: true, met: 6, icon: "ic-dumbbell", sets: 3, reps: "10-12", muscles: "背阔肌" });
  ex({ name: "反向划船", part: "back", equip: "徒手", scenes: ["home", "gym"], weighted: false, met: 6, icon: "ic-bodyweight", sets: 3, reps: "10-12", muscles: "背部·二头" });
  ex({ name: "俯身哑铃反向飞鸟", part: "back", equip: "哑铃", scenes: ["home", "gym"], weighted: true, met: 5.5, icon: "ic-dumbbell", sets: 3, reps: "15", muscles: "后束·上背" });
  ex({ name: "哑铃硬拉", part: "back", equip: "哑铃", scenes: ["home", "gym"], weighted: true, met: 6.5, icon: "ic-dumbbell", sets: 3, reps: "10-12", muscles: "竖脊肌·臀腿" });
  ex({ name: "引体向上", part: "back", equip: "单杠", scenes: ["gym"], weighted: false, met: 7, icon: "ic-pullup", sets: 4, reps: "6-10", muscles: "背阔肌·二头" });
  ex({ name: "高位下拉", part: "back", equip: "固定器械", scenes: ["gym"], weighted: true, met: 6, icon: "ic-machine", sets: 4, reps: "10-12", muscles: "背阔肌" });
  ex({ name: "坐姿划船", part: "back", equip: "固定器械", scenes: ["gym"], weighted: true, met: 6, icon: "ic-machine", sets: 4, reps: "10-12", muscles: "中背·菱形肌" });
  ex({ name: "T杠划船", part: "back", equip: "杠铃", scenes: ["gym"], weighted: true, met: 6.5, icon: "ic-barbell", sets: 3, reps: "8-10", muscles: "背中部" });
  ex({ name: "直臂下压", part: "back", equip: "绳索", scenes: ["gym"], weighted: true, met: 5.5, icon: "ic-machine", sets: 3, reps: "12-15", muscles: "背阔肌" });
  ex({ name: "面拉", part: "back", equip: "绳索", scenes: ["gym"], weighted: true, met: 5, icon: "ic-machine", sets: 3, reps: "15", muscles: "后束·上背" });
  ex({ name: "弹力带划船", part: "back", equip: "弹力带", scenes: ["home"], weighted: false, met: 5.5, icon: "ic-machine", sets: 3, reps: "15", muscles: "背部" });

  /* 腿（居家：深蹲/箭步；健身房：腿推/腿弯举/腿屈伸） */
  ex({ name: "杠铃深蹲", part: "legs", equip: "杠铃", scenes: ["home", "gym"], weighted: true, met: 7, icon: "ic-squat", sets: 4, reps: "8-10", muscles: "股四头·臀" });
  ex({ name: "哑铃箭步蹲", part: "legs", equip: "哑铃", scenes: ["home", "gym"], weighted: true, met: 6.5, icon: "ic-leg", sets: 3, reps: "10/腿", muscles: "股四头·臀" });
  ex({ name: "罗马尼亚硬拉", part: "legs", equip: "杠铃", scenes: ["home", "gym"], weighted: true, met: 6.5, icon: "ic-barbell", sets: 3, reps: "10-12", muscles: "腘绳·臀" });
  ex({ name: "保加利亚分腿蹲", part: "legs", equip: "哑铃", scenes: ["home", "gym"], weighted: true, met: 6.5, icon: "ic-leg", sets: 3, reps: "10/腿", muscles: "股四头·臀" });
  ex({ name: "站姿提踵", part: "legs", equip: "哑铃", scenes: ["home", "gym"], weighted: true, met: 5, icon: "ic-leg", sets: 4, reps: "15-20", muscles: "小腿" });
  ex({ name: "徒手深蹲", part: "legs", equip: "徒手", scenes: ["home", "gym"], weighted: false, met: 5.5, icon: "ic-squat", sets: 3, reps: "20", muscles: "腿·臀" });
  ex({ name: "臀桥", part: "legs", equip: "瑜伽垫", scenes: ["home", "gym"], weighted: false, met: 4, icon: "ic-core", sets: 3, reps: "15", muscles: "臀大肌" });
  ex({ name: "腿推", part: "legs", equip: "固定器械", scenes: ["gym"], weighted: true, met: 6.5, icon: "ic-machine", sets: 4, reps: "10-12", muscles: "股四头·臀" });
  ex({ name: "坐姿腿屈伸", part: "legs", equip: "固定器械", scenes: ["gym"], weighted: true, met: 5.5, icon: "ic-machine", sets: 3, reps: "12-15", muscles: "股四头" });
  ex({ name: "俯卧腿弯举", part: "legs", equip: "固定器械", scenes: ["gym"], weighted: true, met: 5.5, icon: "ic-machine", sets: 3, reps: "12-15", muscles: "腘绳肌" });
  ex({ name: "坐姿提踵", part: "legs", equip: "固定器械", scenes: ["gym"], weighted: true, met: 5, icon: "ic-machine", sets: 4, reps: "15-20", muscles: "小腿" });
  ex({ name: "哈克深蹲", part: "legs", equip: "固定器械", scenes: ["gym"], weighted: true, met: 7, icon: "ic-machine", sets: 4, reps: "8-12", muscles: "股四头·臀" });
  ex({ name: "开合跳", part: "legs", equip: "徒手", scenes: ["home", "gym"], weighted: false, met: 8, icon: "ic-cardio", sets: 3, reps: "30秒", timed: true, muscles: "全身·心肺" });
  ex({ name: "哑铃相扑深蹲", part: "legs", equip: "哑铃", scenes: ["home", "gym"], weighted: true, met: 6.5, icon: "ic-squat", sets: 3, reps: "12", muscles: "臀·大腿内侧" });
  ex({ name: "单腿硬拉", part: "legs", equip: "哑铃", scenes: ["home", "gym"], weighted: true, met: 6, icon: "ic-leg", sets: 3, reps: "10/腿", muscles: "腘绳·臀" });
  ex({ name: "臀冲", part: "legs", equip: "杠铃", scenes: ["gym"], weighted: true, met: 6, icon: "ic-machine", sets: 4, reps: "10-12", muscles: "臀大肌" });
  ex({ name: "腿内收机", part: "legs", equip: "固定器械", scenes: ["gym"], weighted: true, met: 5, icon: "ic-machine", sets: 3, reps: "15", muscles: "大腿内侧" });
  ex({ name: "腿外展机", part: "legs", equip: "固定器械", scenes: ["gym"], weighted: true, met: 5, icon: "ic-machine", sets: 3, reps: "15", muscles: "臀中肌" });
  ex({ name: "杠铃颈前深蹲", part: "legs", equip: "杠铃", scenes: ["gym"], weighted: true, met: 7, icon: "ic-squat", sets: 4, reps: "8-10", muscles: "股四头" });
  ex({ name: "跳箱", part: "legs", equip: "徒手", scenes: ["gym"], weighted: false, met: 8, icon: "ic-cardio", sets: 3, reps: "10", muscles: "爆发力·腿" });
  ex({ name: "深蹲跳", part: "legs", equip: "徒手", scenes: ["home", "gym"], weighted: false, met: 8, icon: "ic-cardio", sets: 3, reps: "12", muscles: "腿·心肺" });

  /* 肩 */
  ex({ name: "哑铃肩上推举", part: "shoulder", equip: "哑铃", scenes: ["home", "gym"], weighted: true, met: 6, icon: "ic-shoulder", sets: 3, reps: "10-12", muscles: "三角肌前中束" });
  ex({ name: "哑铃侧平举", part: "shoulder", equip: "哑铃", scenes: ["home", "gym"], weighted: true, met: 5, icon: "ic-shoulder", sets: 3, reps: "12-15", muscles: "三角肌中束" });
  ex({ name: "哑铃前平举", part: "shoulder", equip: "哑铃", scenes: ["home", "gym"], weighted: true, met: 5, icon: "ic-shoulder", sets: 3, reps: "12", muscles: "三角肌前束" });
  ex({ name: "阿诺德推举", part: "shoulder", equip: "哑铃", scenes: ["home", "gym"], weighted: true, met: 6, icon: "ic-shoulder", sets: 3, reps: "10-12", muscles: "三角肌" });
  ex({ name: "杠铃肩上推举", part: "shoulder", equip: "杠铃", scenes: ["gym"], weighted: true, met: 6.5, icon: "ic-barbell", sets: 4, reps: "8-10", muscles: "三角肌·三头" });
  ex({ name: "器械肩推", part: "shoulder", equip: "固定器械", scenes: ["gym"], weighted: true, met: 6, icon: "ic-machine", sets: 4, reps: "10-12", muscles: "三角肌" });
  ex({ name: "绳索侧平举", part: "shoulder", equip: "绳索", scenes: ["gym"], weighted: true, met: 5, icon: "ic-machine", sets: 3, reps: "12-15", muscles: "三角肌中束" });
  ex({ name: "哑铃耸肩", part: "shoulder", equip: "哑铃", scenes: ["home", "gym"], weighted: true, met: 5, icon: "ic-shoulder", sets: 3, reps: "15", muscles: "斜方肌" });
  ex({ name: "倒立撑", part: "shoulder", equip: "徒手", scenes: ["home", "gym"], weighted: false, met: 6.5, icon: "ic-bodyweight", sets: 3, reps: "8-12", muscles: "三角肌·三头" });
  ex({ name: "俯身哑铃飞鸟", part: "shoulder", equip: "哑铃", scenes: ["home", "gym"], weighted: true, met: 5, icon: "ic-shoulder", sets: 3, reps: "15", muscles: "三角肌后束" });
  ex({ name: "绳索面拉", part: "shoulder", equip: "绳索", scenes: ["gym"], weighted: true, met: 5, icon: "ic-machine", sets: 3, reps: "15", muscles: "三角肌后束" });
  ex({ name: "杠铃前平举", part: "shoulder", equip: "杠铃", scenes: ["gym"], weighted: true, met: 5, icon: "ic-barbell", sets: 3, reps: "12", muscles: "三角肌前束" });
  ex({ name: "侧平举（弹力带）", part: "shoulder", equip: "弹力带", scenes: ["home"], weighted: false, met: 4.5, icon: "ic-machine", sets: 3, reps: "15", muscles: "三角肌中束" });

  /* 手臂 */
  ex({ name: "哑铃交替弯举", part: "arms", equip: "哑铃", scenes: ["home", "gym"], weighted: true, met: 5, icon: "ic-biceps", sets: 3, reps: "10-12", muscles: "肱二头" });
  ex({ name: "锤式弯举", part: "arms", equip: "哑铃", scenes: ["home", "gym"], weighted: true, met: 5, icon: "ic-biceps", sets: 3, reps: "12", muscles: "肱肌·肱桡肌" });
  ex({ name: "仰卧臂屈伸", part: "arms", equip: "哑铃", scenes: ["home", "gym"], weighted: true, met: 5, icon: "ic-biceps", sets: 3, reps: "10-12", muscles: "肱三头" });
  ex({ name: "窄距俯卧撑", part: "arms", equip: "徒手", scenes: ["home", "gym"], weighted: false, met: 5.5, icon: "ic-bodyweight", sets: 3, reps: "力竭", muscles: "肱三头" });
  ex({ name: "凳上臂屈伸", part: "arms", equip: "徒手", scenes: ["home", "gym"], weighted: false, met: 5, icon: "ic-bodyweight", sets: 3, reps: "10-12", muscles: "肱三头" });
  ex({ name: "杠铃弯举", part: "arms", equip: "杠铃", scenes: ["gym"], weighted: true, met: 5.5, icon: "ic-barbell", sets: 3, reps: "10-12", muscles: "肱二头" });
  ex({ name: "绳索下压", part: "arms", equip: "绳索", scenes: ["gym"], weighted: true, met: 5, icon: "ic-machine", sets: 3, reps: "12-15", muscles: "肱三头" });
  ex({ name: "器械弯举", part: "arms", equip: "固定器械", scenes: ["gym"], weighted: true, met: 5, icon: "ic-machine", sets: 3, reps: "12", muscles: "肱二头" });
  ex({ name: "集中弯举", part: "arms", equip: "哑铃", scenes: ["home", "gym"], weighted: true, met: 5, icon: "ic-biceps", sets: 3, reps: "10-12", muscles: "肱二头" });
  ex({ name: "过顶臂屈伸", part: "arms", equip: "哑铃", scenes: ["home", "gym"], weighted: true, met: 5, icon: "ic-biceps", sets: 3, reps: "12", muscles: "肱三头长头" });
  ex({ name: "反握弯举", part: "arms", equip: "杠铃", scenes: ["gym"], weighted: true, met: 5, icon: "ic-barbell", sets: 3, reps: "12", muscles: "前臂·肱二头" });
  ex({ name: "腕弯举", part: "arms", equip: "哑铃", scenes: ["home", "gym"], weighted: true, met: 4, icon: "ic-dumbbell", sets: 3, reps: "15-20", muscles: "前臂" });
  ex({ name: "绳索过顶臂屈伸", part: "arms", equip: "绳索", scenes: ["gym"], weighted: true, met: 5, icon: "ic-machine", sets: 3, reps: "12", muscles: "肱三头长头" });
  ex({ name: "哑铃内旋弯举", part: "arms", equip: "哑铃", scenes: ["home", "gym"], weighted: true, met: 5, icon: "ic-biceps", sets: 3, reps: "12", muscles: "肱前臂" });
  ex({ name: "俯身臂屈伸", part: "arms", equip: "哑铃", scenes: ["home", "gym"], weighted: true, met: 5, icon: "ic-biceps", sets: 3, reps: "12", muscles: "肱三头" });

  /* 核心 */
  ex({ name: "平板支撑", part: "core", equip: "瑜伽垫", scenes: ["home", "gym"], weighted: false, met: 4, icon: "ic-plank", sets: 3, reps: "45-60秒", timed: true, muscles: "核心" });
  ex({ name: "卷腹", part: "core", equip: "瑜伽垫", scenes: ["home", "gym"], weighted: false, met: 4, icon: "ic-core", sets: 3, reps: "15-20", muscles: "上腹" });
  ex({ name: "俄罗斯转体", part: "core", equip: "瑜伽垫", scenes: ["home", "gym"], weighted: false, met: 4.5, icon: "ic-core", sets: 3, reps: "20", muscles: "腹斜肌" });
  ex({ name: "登山者", part: "core", equip: "瑜伽垫", scenes: ["home", "gym"], weighted: false, met: 6, icon: "ic-plank", sets: 3, reps: "30秒", timed: true, muscles: "核心·心肺" });
  ex({ name: "侧平板支撑", part: "core", equip: "瑜伽垫", scenes: ["home", "gym"], weighted: false, met: 4, icon: "ic-plank", sets: 3, reps: "30-45秒", timed: true, muscles: "腹斜肌" });
  ex({ name: "悬垂举腿", part: "core", equip: "单杠", scenes: ["gym"], weighted: false, met: 5.5, icon: "ic-pullup", sets: 3, reps: "10-12", muscles: "下腹" });
  ex({ name: "仰卧抬腿", part: "core", equip: "瑜伽垫", scenes: ["home", "gym"], weighted: false, met: 4.5, icon: "ic-core", sets: 3, reps: "15", muscles: "下腹" });
  ex({ name: "死虫式", part: "core", equip: "瑜伽垫", scenes: ["home", "gym"], weighted: false, met: 3.5, icon: "ic-core", sets: 3, reps: "12/侧", muscles: "深层核心" });
  ex({ name: "负重卷腹", part: "core", equip: "哑铃", scenes: ["home", "gym"], weighted: true, met: 4.5, icon: "ic-core", sets: 3, reps: "15", muscles: "上腹" });
  ex({ name: "健腹轮", part: "core", equip: "固定器械", scenes: ["gym"], weighted: false, met: 5, icon: "ic-core", sets: 3, reps: "10-12", muscles: "核心" });
  ex({ name: "负重俄罗斯转体", part: "core", equip: "药球", scenes: ["home", "gym"], weighted: true, met: 5, icon: "ic-core", sets: 3, reps: "20", muscles: "腹斜肌" });
  ex({ name: "鸟狗式", part: "core", equip: "瑜伽垫", scenes: ["home", "gym"], weighted: false, met: 3.5, icon: "ic-core", sets: 3, reps: "12/侧", muscles: "核心稳定" });

  /* 有氧（居家/健身房通用） */
  ex({ name: "波比跳", part: "cardio", equip: "徒手", scenes: ["home", "gym"], weighted: false, met: 9, icon: "ic-cardio", sets: 3, reps: "12", muscles: "全身·心肺" });
  ex({ name: "高抬腿", part: "cardio", equip: "徒手", scenes: ["home", "gym"], weighted: false, met: 8, icon: "ic-cardio", sets: 3, reps: "30秒", timed: true, muscles: "心肺·腿" });
  ex({ name: "跳绳", part: "cardio", equip: "徒手", scenes: ["home", "gym"], weighted: false, met: 10, icon: "ic-cardio", sets: 4, reps: "60秒", timed: true, muscles: "心肺" });
  ex({ name: "开合跳", part: "cardio", equip: "徒手", scenes: ["home", "gym"], weighted: false, met: 8, icon: "ic-cardio", sets: 3, reps: "30秒", timed: true, muscles: "心肺" });
  ex({ name: "登山跑", part: "cardio", equip: "徒手", scenes: ["home", "gym"], weighted: false, met: 8, icon: "ic-cardio", sets: 3, reps: "30秒", timed: true, muscles: "心肺·核心" });
  ex({ name: "原地慢跑", part: "cardio", equip: "徒手", scenes: ["home"], weighted: false, met: 7, icon: "ic-run", sets: 1, reps: "20分钟", timed: true, muscles: "心肺" });
  ex({ name: "动感单车", part: "cardio", equip: "固定器械", scenes: ["gym"], weighted: false, met: 7.5, icon: "ic-cycle", sets: 1, reps: "30分钟", timed: true, muscles: "心肺·腿" });
  ex({ name: "跑步机", part: "cardio", equip: "固定器械", scenes: ["gym"], weighted: false, met: 8, icon: "ic-run", sets: 1, reps: "30分钟", timed: true, muscles: "心肺" });
  ex({ name: "划船机", part: "cardio", equip: "固定器械", scenes: ["gym"], weighted: false, met: 8.5, icon: "ic-machine", sets: 1, reps: "20分钟", timed: true, muscles: "全身·心肺" });
  ex({ name: "爬楼机", part: "cardio", equip: "固定器械", scenes: ["gym"], weighted: false, met: 9, icon: "ic-machine", sets: 1, reps: "20分钟", timed: true, muscles: "心肺·腿臀" });

  /* 拉伸 / 放松 */
  ex({ name: "瑜伽垫拉伸放松", part: "stretch", equip: "瑜伽垫", scenes: ["home", "gym"], weighted: false, met: 2.5, icon: "ic-yoga", sets: 1, reps: "10分钟", timed: true, muscles: "全身" });
  ex({ name: "泡沫轴放松", part: "stretch", equip: "瑜伽垫", scenes: ["home", "gym"], weighted: false, met: 2.5, icon: "ic-yoga", sets: 1, reps: "10分钟", timed: true, muscles: "筋膜" });
  ex({ name: "猫牛式", part: "stretch", equip: "瑜伽垫", scenes: ["home", "gym"], weighted: false, met: 2.5, icon: "ic-yoga", sets: 2, reps: "10", muscles: "脊柱" });
  ex({ name: "髋屈肌拉伸", part: "stretch", equip: "瑜伽垫", scenes: ["home", "gym"], weighted: false, met: 2.5, icon: "ic-stretch", sets: 2, reps: "30秒/侧", timed: true, muscles: "髋·股四头" });
  ex({ name: "胸肩拉伸", part: "stretch", equip: "徒手", scenes: ["home", "gym"], weighted: false, met: 2.5, icon: "ic-stretch", sets: 2, reps: "30秒/侧", timed: true, muscles: "胸·肩" });
  ex({ name: "腘绳肌拉伸", part: "stretch", equip: "瑜伽垫", scenes: ["home", "gym"], weighted: false, met: 2.5, icon: "ic-stretch", sets: 2, reps: "30秒/侧", timed: true, muscles: "腘绳·小腿" });
  ex({ name: "肩颈放松", part: "stretch", equip: "徒手", scenes: ["home"], weighted: false, met: 2.5, icon: "ic-stretch", sets: 2, reps: "30秒/侧", timed: true, muscles: "斜方肌·颈部" });
  ex({ name: "婴儿式", part: "stretch", equip: "瑜伽垫", scenes: ["home", "gym"], weighted: false, met: 2, icon: "ic-yoga", sets: 2, reps: "60秒", timed: true, muscles: "背·髋" });
  ex({ name: "脊柱扭转", part: "stretch", equip: "瑜伽垫", scenes: ["home", "gym"], weighted: false, met: 2, icon: "ic-yoga", sets: 2, reps: "30秒/侧", timed: true, muscles: "脊柱·腰背" });
  ex({ name: "小腿拉伸", part: "stretch", equip: "徒手", scenes: ["home", "gym"], weighted: false, met: 2.5, icon: "ic-stretch", sets: 2, reps: "30秒/侧", timed: true, muscles: "小腿" });
  ex({ name: "开肩扩胸", part: "stretch", equip: "徒手", scenes: ["home", "gym"], weighted: false, met: 2.5, icon: "ic-stretch", sets: 2, reps: "30秒", timed: true, muscles: "胸·肩" });

  /* 补充：核心 / 有氧 / 器械 */
  ex({ name: "侧卷腹", part: "core", equip: "瑜伽垫", scenes: ["home", "gym"], weighted: false, met: 4, icon: "ic-core", sets: 3, reps: "15/侧", muscles: "腹斜肌" });
  ex({ name: "空中自行车", part: "core", equip: "瑜伽垫", scenes: ["home", "gym"], weighted: false, met: 4.5, icon: "ic-core", sets: 3, reps: "20", muscles: "腹直肌·腹斜肌" });
  ex({ name: "绳索卷腹", part: "core", equip: "绳索", scenes: ["gym"], weighted: true, met: 5, icon: "ic-machine", sets: 3, reps: "15", muscles: "上腹" });
  ex({ name: "农夫行走", part: "core", equip: "哑铃", scenes: ["home", "gym"], weighted: true, met: 6, icon: "ic-dumbbell", sets: 3, reps: "30米", muscles: "核心·握力" });
  ex({ name: "椭圆机", part: "cardio", equip: "固定器械", scenes: ["gym"], weighted: false, met: 7, icon: "ic-machine", sets: 1, reps: "30分钟", timed: true, muscles: "心肺" });
  ex({ name: "战绳", part: "cardio", equip: "固定器械", scenes: ["gym"], weighted: false, met: 9, icon: "ic-cardio", sets: 4, reps: "30秒", timed: true, muscles: "全身·心肺" });
  ex({ name: "深蹲跳箱", part: "cardio", equip: "徒手", scenes: ["home"], weighted: false, met: 8, icon: "ic-cardio", sets: 3, reps: "12", muscles: "腿·心肺" });
  ex({ name: "原地蹬车", part: "cardio", equip: "徒手", scenes: ["home"], weighted: false, met: 7, icon: "ic-cardio", sets: 3, reps: "30秒", timed: true, muscles: "核心·心肺" });
  ex({ name: "器械夹胸", part: "chest", equip: "固定器械", scenes: ["gym"], weighted: true, met: 5.5, icon: "ic-machine", sets: 3, reps: "12-15", muscles: "胸中缝" });
  ex({ name: "哑铃仰卧上拉", part: "chest", equip: "哑铃", scenes: ["home", "gym"], weighted: true, met: 5.5, icon: "ic-dumbbell", sets: 3, reps: "12-15", muscles: "胸·背阔" });
  ex({ name: "杠铃划船上斜", part: "back", equip: "杠铃", scenes: ["gym"], weighted: true, met: 6, icon: "ic-barbell", sets: 3, reps: "10-12", muscles: "上背" });
  ex({ name: "单臂绳索划船", part: "back", equip: "绳索", scenes: ["gym"], weighted: true, met: 6, icon: "ic-machine", sets: 3, reps: "12/侧", muscles: "背阔肌" });
  ex({ name: "哑铃耸肩划船", part: "back", equip: "哑铃", scenes: ["home"], weighted: true, met: 5.5, icon: "ic-dumbbell", sets: 3, reps: "12", muscles: "上背·斜方" });

  /* 按场景取动作库 */
  function exLibForScene(scene) {
    return EX_LIB.filter(function (a) { return a.scenes.indexOf(scene) !== -1; });
  }
  /* 按部位 + 场景取动作 */
  function exLibByPart(part, scene) {
    return EX_LIB.filter(function (a) {
      return a.part === part && a.scenes.indexOf(scene) !== -1;
    });
  }
  /* 文本格式（兼容旧 parsePlanItem / 打卡记录展示） */
  function exToText(a) {
    var unit = a.timed ? "" : "次";
    return a.name + " " + a.sets + "组 × " + a.reps;
  }
  function findExerciseByName(name) {
    for (var i = 0; i < EX_LIB.length; i++) if (EX_LIB[i].name === name) return EX_LIB[i];
    return null;
  }
  /* 按 id 索引动作（id 形如 "e0"），供任务绑定 */
  var EX_BY_ID = {};
  EX_LIB.forEach(function (a) { EX_BY_ID[a.id] = a; });
  function exById(id) { return (id != null && EX_BY_ID[id]) ? EX_BY_ID[id] : null; }

  /* 旧版纯文本动作库，仅用于兼容老数据解析（新代码不再使用） */
  var LEGACY_EXERCISE_LIB = [
    { part: "胸", emoji: "🫁", items: ["哑铃卧推 4组 × 8-10", "上斜哑铃卧推 3组 × 10-12", "哑铃飞鸟 3组 × 12-15", "俯卧撑 3组 × 力竭", "凳上臂屈伸（三头） 3组 × 10-12"] },
    { part: "背", emoji: "💪", items: ["杠铃俯身划船 4组 × 8-10", "哑铃单臂划船 3组 × 10-12", "反向划船（桌下） 3组 × 10-12", "俯身哑铃反向飞鸟 3组 × 15", "面拉 3组 × 15"] },
    { part: "腿", emoji: "🦵", items: ["杠铃深蹲 4组 × 8-10", "哑铃箭步蹲 3组 × 10/腿", "罗马尼亚硬拉（杠铃） 3组 × 10-12", "保加利亚分腿蹲 3组 × 10/腿", "站姿提踵 4组 × 15-20"] },
    { part: "肩", emoji: "🤸", items: ["哑铃肩上推举 3组 × 10-12", "哑铃侧平举 3组 × 12-15", "哑铃前平举 3组 × 12", "俯身哑铃反向飞鸟 3组 × 15", "杠铃前平举 3组 × 12"] },
    { part: "臂", emoji: "💪", items: ["哑铃交替弯举 3组 × 10-12", "锤式弯举 3组 × 12", "仰卧臂屈伸 3组 × 10-12", "窄距俯卧撑 3组 × 力竭", "凳上臂屈伸 3组 × 10-12"] },
    { part: "核心", emoji: "🔥", items: ["平板支撑 3组 × 45-60秒", "卷腹 3组 × 15-20", "俄罗斯转体 3组 × 20", "登山者 3组 × 30秒", "臀桥 3组 × 15"] },
    { part: "有氧/热身", emoji: "🏃", items: ["慢跑 20分钟", "波比跳 3组 × 12", "开合跳 3组 × 30", "高抬腿 3组 × 30秒", "瑜伽垫拉伸放松 10分钟"] }
  ];

  /* ---------- 应用版本（主界面右上角标识，确认是否运行最新版） ---------- */
  var APP_VERSION = "5.1.2";

  /* ---------- 数据层（单机版：统一存储，无登录） ---------- */
  var DATA_KEY = "fitapp_data";
  var DEFAULT_WEIGHT = 72;   // 默认体重(kg)
  var DEFAULT_HEIGHT = 180;  // 默认身高(cm)
  var DEFAULT_AGE = 25;      // 默认年龄
  var currentUser = "我";   // 单机模式内部标记，无登录
  /* 单机数据模型（v4.0.0：无 checkedIn 状态位——「是否已打卡」由 tasks 完成度 + confirmed 派生） */
  function blankData() {
    return {
      records: {},       // 每日记录 { date, confirmed, exercises[] }（actions 已改为派生，不再持久化）
      tasks: {},         // 每日任务
      plan: null,
      recDismiss: {},
      wizResume: 0,
      weight: DEFAULT_WEIGHT,
      height: DEFAULT_HEIGHT,
      age: DEFAULT_AGE,
      gender: "male",    // male | female
      scene: "home",     // home | gym ：当前训练场景
      username: "",      // 用户名（用于首页问候等个性化称呼）
      appTitle: "健身打卡", // 首页 header 标题（统计页设置可改）
      theme: "snow",     // 主题 key（空或 plain = 蓝白；night/snow/neon/warm）；默认「雪光柔白」
      wallpaper: "",     // 自定义壁纸 dataURL（空则用内置壁纸）
      profileDone: false // 是否已确认过「默认信息」（首次引导完成后置 true）
    };
  }
  var data = blankData();

  function storeKeyFor() { return DATA_KEY; }

  function load() {
    try {
      var raw = localStorage.getItem(DATA_KEY);
      if (raw) data = JSON.parse(raw);
      if (!data.records) data.records = {};
      if (!data.tasks) data.tasks = {};
      if (!data.plan) data.plan = null;
      if (!data.recDismiss) data.recDismiss = {};
      if (typeof data.wizResume !== "number" || isNaN(data.wizResume)) data.wizResume = 0;
      if (typeof data.weight !== "number" || isNaN(data.weight) || data.weight <= 0) data.weight = DEFAULT_WEIGHT;
      if (typeof data.height !== "number" || isNaN(data.height) || data.height <= 0) data.height = DEFAULT_HEIGHT;
      if (typeof data.age !== "number" || isNaN(data.age) || data.age <= 0) data.age = DEFAULT_AGE;
      if (data.gender !== "male" && data.gender !== "female") data.gender = "male";
      if (data.scene !== "home" && data.scene !== "gym") data.scene = "home";
      if (typeof data.username !== "string") data.username = "";
      if (typeof data.appTitle !== "string" || !data.appTitle) data.appTitle = "健身打卡";
      if (typeof data.theme !== "string") data.theme = "";
      if (typeof data.wallpaper !== "string") data.wallpaper = "";
      if (typeof data.profileDone !== "boolean") data.profileDone = false;
      /* v4.0.0 打卡逻辑重构 · 旧数据迁移：
         把旧的 checkedIn 状态位归一为 confirmed（派生层唯一保留的显式确认标志），
         并规范 tasks/records 结构，保证「单一事实源」成立。 */
      Object.keys(data.records).forEach(function (k) {
        var rec = data.records[k];
        if (!rec) return;
        if (typeof rec.confirmed !== "boolean") rec.confirmed = !!rec.checkedIn;
        delete rec.checkedIn;
        if (!rec.exercises) rec.exercises = [];
      });
      Object.keys(data.tasks).forEach(function (k) {
        if (!Array.isArray(data.tasks[k])) data.tasks[k] = [];
        data.tasks[k].forEach(function (t) { t.done = !!t.done; });
      });
    } catch (e) { data = blankData(); }
  }
  function save() {
    try { localStorage.setItem(DATA_KEY, JSON.stringify(data)); } catch (e) {}
    /* 本地写完立刻排队上报「当日摘要」（防抖；未配置云端 / 未登录时为空操作）。
       顺序很重要：本地存储是唯一事实源，云端只是它的投影，因此永远先落本地。 */
    queueSync();
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
    if (!data.records[k]) data.records[k] = { date: k, confirmed: false, exercises: [] };
    var r = data.records[k];
    if (typeof r.confirmed !== "boolean") r.confirmed = !!r.checkedIn;  // 旧数据迁移
    if (!r.exercises) r.exercises = [];
    return r;
  }
  function dayDuration(k) {
    var r = getRecord(k); if (!r || !r.exercises) return 0;
    return r.exercises.reduce(function (s, e) { return s + (Number(e.duration) || 0); }, 0);
  }

  /* ============================================================
     派生层（v4.0.0 打卡逻辑重构）
     ------------------------------------------------------------
     单一事实源：
       · data.tasks[date]            —— 当天动作清单（每项含 done 与重量/组数/次数）
       · data.records[date].exercises —— 当天「运动记录」（有氧/球类/游泳）
     其它一切状态（是否已打卡 / 动作明细 / 完成进度）都由以上**派生**，不再单独存状态位。
     规则：有任务 → 必须全部完成才算已打卡；无任务（休息日）→ 用户确认过或记录过运动即算已打卡。
     ============================================================ */
  function dayActions(k) {
    var tasks = data.tasks[k] || [];
    if (tasks.length) {
      return tasks.map(function (t) {
        return { text: t.text, w: t.w, s: t.s, r: t.r, done: !!t.done };
      });
    }
    /* 兼容旧数据：无任务但历史上写过动作明细 */
    var r = getRecord(k);
    return (r && r.actions) ? r.actions : [];
  }

  function deriveDay(k) {
    var tasks = data.tasks[k] || [];
    var total = tasks.length;
    var doneCount = tasks.filter(function (t) { return t.done; }).length;
    var allDone = total > 0 && doneCount === total;
    var rec = getRecord(k);
    var exercises = (rec && rec.exercises) ? rec.exercises : [];
    var confirmed = !!(rec && rec.confirmed);
    var checked = (total > 0) ? allDone : (confirmed || exercises.length > 0);
    return {
      tasks: tasks,
      total: total,
      doneCount: doneCount,
      pending: total - doneCount,
      allDone: allDone,
      checked: checked,
      confirmed: confirmed,
      exercises: exercises,
      actions: dayActions(k)
    };
  }

  /* 是否已打卡：完全派生 */
  function isChecked(k) { return deriveDay(k).checked; }

  /* ---------- 统计 ---------- */
  function computeStreaks() {
    /* 已打卡日期集合：records ∪ tasks —— checked 由派生层计算，可能没有对应 record 实体 */
    var allKeys = {};
    Object.keys(data.records).forEach(function (k) { allKeys[k] = 1; });
    Object.keys(data.tasks).forEach(function (k) { allKeys[k] = 1; });
    var keys = Object.keys(allKeys)
      .filter(function (k) { return isChecked(k); })
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
      if (!r || !r.exercises) return;
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
    var np = namePrefix();
    var btn = $("checkinBtn");
    if (checked) {
      btn.classList.add("done");
      $("checkinText").textContent = "已打卡 ✓";
      $("heroHint").textContent = "点击可继续记录，或打开弹层撤销";
      $("heroGreet").textContent = np + "今天已完成，继续保持！";
    } else {
      btn.classList.remove("done");
      $("checkinText").textContent = "今日打卡";
      $("heroHint").textContent = "点击按钮，记录今天的坚持";
      $("heroGreet").textContent = np + (s.current > 0 ? "昨天坚持了，今天继续！" : "今天也要加油 💪");
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
    renderTodayActions();
    renderCalSummary();
    renderTodayMates();
  }

  /* 今日动作记录：把今天做过的动作（含重量/组数/次数）展示出来 */
  function renderTodayActions() {
    var tk = todayKey();
    /* 动作明细改为派生（来源 data.tasks[tk]），不再是打卡时写入的镜像 —— 永远与任务列表一致 */
    var actions = dayActions(tk);
    var box = $("todayActions");
    var title = $("todayActionsTitle");
    box.innerHTML = "";
    if (!actions.length) { title.hidden = true; return; }
    title.hidden = false;
    actions.forEach(function (a) { box.appendChild(actionRow(a)); });
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

  /* 按当前场景 + 近 N 天去重，随机组合今日训练（横幅）。返回动作对象数组 */
  function pickDailyWorkout(scene, maxCount) {
    maxCount = maxCount || 6;
    var lib = exLibForScene(scene);
    /* 近期已练动作名（含今日任务 + 近 14 天记录），用于降重 */
    var recent = {};
    var today = todayKey();
    getTasks(today).forEach(function (t) { recent[t.text.split(" ")[0]] = 2; }); // 今天已排的强排除
    var days = lastNDays(14);
    days.forEach(function (k) {
      var acts = dayActions(k);
      acts.forEach(function (a) { recent[String(a.text || "").split(" ")[0]] = 1; });
    });
    /* 部位轮换：优先选择近 14 天未练部位的动作 */
    var byPart = {};
    lib.forEach(function (a) { (byPart[a.part] = byPart[a.part] || []).push(a); });
    var partIds = Object.keys(byPart);
    var out = [];
    /* 每个部位挑 1 个候选池，按「未最近练过」优先 + 加权随机 */
    partIds.forEach(function (p) {
      var pool = byPart[p].filter(function (a) { return !recent[a.name]; });
      if (!pool.length) pool = byPart[p].slice();          // 全练过则回退全部
      /* 排除今天已排的（若有） */
      pool.sort(function () { return Math.random() - 0.5; });
      if (pool[0]) out.push(pool[0]);
    });
    /* 打乱部位顺序后截取 */
    out.sort(function () { return Math.random() - 0.5; });
    return out.slice(0, maxCount);
  }

  /* 按推荐组合生成今日任务 */
  function loadRecommend() {
    var scene = data.scene || "home";
    var picks = pickDailyWorkout(scene, 6);
    if (!picks.length) { toast("当前场景暂无可用动作"); return; }
    var tk = todayKey();
    var existing = getTasks(tk);
    if (existing.length && !confirm("今日已有 " + existing.length + " 项任务，用推荐组合替换？")) return;
    data.tasks[tk] = picks.map(function (a) { return taskFromExercise(a); });
    save();
    showTab("today");
    renderTasks();
    toast("已载入推荐训练（" + picks.length + " 个动作）");
  }

  /* 今日推荐横幅已移除：改为「今日任务」标题右侧的小「载入」按钮（绑定见 bind → #taskLoadBtn） */

  function exRow(e) {
    var t = TYPE_MAP[e.type] || TYPE_MAP.other;
    var dispName = e.sport || t.name;
    var row = document.createElement("div");
    row.className = "ex-item";
    var meta = [];
    if (e.duration) meta.push(e.duration + " 分钟");
    if (e.calories) meta.push(e.calories + " 千卡");
    var ic = t.icon || "ic-other";
    row.innerHTML =
      '<div class="ex-emoji"><svg viewBox="0 0 24 24" style="width:24px;height:24px"><use href="#' + ic + '"></use></svg></div>' +
      '<div class="ex-main"><div class="ex-name">' + escapeHtml(dispName) + '</div>' +
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
        '<div class="tc-head"><span class="tc-label">当前动作</span>' + taskStatusHtml(cur) + '</div>' +
        '<div class="tc-text">' + taskIconHtml(cur) + escapeHtml(cur.text) + taskKcalHtml(cur) + '</div>' +
        taskFieldsHtml(cur) +
        '<div class="tc-actions">' +
        '<button class="tc-replace" data-id="' + cur.id + '">更换动作</button>' +
        '<button class="tc-del" data-id="' + cur.id + '" title="删除动作">✕</button>' +
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
    // 当前动作已在顶部放大卡展示，列表里不再重复（避免一条动作出现两次）
    tasks.forEach(function (t) {
      if (cur && cur.id === t.id) return;
      var row = document.createElement("div");
      row.className = "task-item" + (t.done ? " done" : "");
      row.innerHTML =
        taskStatusHtml(t) +
        '<div class="task-text">' + taskIconHtml(t) + escapeHtml(t.text) + taskKcalHtml(t) + '</div>' +
        '<button class="task-replace" data-id="' + t.id + '">更换</button>' +
        '<button class="task-del" data-id="' + t.id + '">✕</button>' +
        taskFieldsHtml(t);
      list.appendChild(row);
    });
  }
  /* 重量/组数/次数 输入控件 HTML（自适应：自重动作不显示「重量」输入） */
  function taskFieldsHtml(t) {
    var needW = isWeightedTask(t);
    var isTimed = isTimedTask(t);
    var rLabel = isTimed ? "时长(秒)" : "次数";
    var rPh = isTimed ? "如45" : "—";
    var html = '<div class="task-fields">';
    if (needW) {
      html += '<div class="tf"><label>重量kg</label><input type="number" inputmode="decimal" class="tf-w" data-id="' + t.id + '" placeholder="—" value="' + escapeHtml(t.w || "") + '"></div>';
    } else {
      html += '<div class="tf"><label>类型</label><div class="tf-static">自重</div></div>';
    }
    html += '<div class="tf"><label>组数</label><input type="number" inputmode="numeric" class="tf-s" data-id="' + t.id + '" placeholder="—" value="' + escapeHtml(t.s || "") + '"></div>';
    html += '<div class="tf"><label>' + rLabel + '</label><input type="number" inputmode="numeric" class="tf-r" data-id="' + t.id + '" placeholder="' + rPh + '" value="' + escapeHtml(t.r || "") + '"></div>';
    html += '</div>';
    return html;
  }
  /* 任务图标 HTML（线型 SVG）；无图标返回空 */
  function taskIconHtml(t) {
    var ic = t.icon;
    if (!ic) {
      var ex = t.exid != null ? exById(t.exid) : findExerciseByName(String(t.text || "").split(" ")[0]);
      ic = ex ? ex.icon : (t.part && PART_MAP[t.part] ? PART_MAP[t.part].icon : "ic-bodyweight");
    }
    return '<svg class="ex-icon" viewBox="0 0 24 24" aria-hidden="true"><use href="#' + ic + '"></use></svg>';
  }
  /* 动作完成状态徽标：已完成 / 未完成（取代原「完成」按钮） */
  function taskStatusHtml(t) {
    return '<span class="task-status ' + (t.done ? "done" : "undone") + '">' + (t.done ? "已完成" : "未完成") + '</span>';
  }
  /* 力量训练卡路里估算徽标（做功法）；无法估算则不显示 */
  function taskKcalHtml(t) {
    var k = estTaskKcal(t);
    if (k == null) return "";
    return '<span class="task-kcal" title="做功法估算，仅供参考">≈' + k + '千卡</span>';
  }

  /* 首页「今日预计消耗」汇总卡 + 按类型彩色拆分条 */
  /* 首页「今日消耗」：环形图（按运动类型占比着色，中心显示总消耗） */
  function renderCalSummary() {
    var box = $("calSummary");
    if (!box) return;
    var tasks = getTasks(todayKey());
    var segs = [];
    var fitK = 0;
    tasks.forEach(function (t) { var k = estTaskKcal(t); if (k) fitK += k; });
    if (fitK > 0) segs.push({ name: "健身", color: TYPE_MAP.gym.color, val: fitK });

    var rec = getRecord(todayKey());
    if (rec && rec.exercises) {
      var byType = {};
      rec.exercises.forEach(function (e) {
        var k = estExKcal(e); if (!k) return;
        var key = e.sport || (TYPE_MAP[e.type] ? TYPE_MAP[e.type].name : "其他");
        var color = TYPE_MAP[e.type] ? TYPE_MAP[e.type].color : "#9AA0A6";
        if (!byType[key]) byType[key] = { name: key, color: color, val: 0 };
        byType[key].val += k;
      });
      Object.keys(byType).forEach(function (kk) { segs.push(byType[kk]); });
    }

    var total = segs.reduce(function (s, x) { return s + x.val; }, 0);
    $("calSumNum").textContent = total;

    var ring = $("calRing");
    var legend = $("calTypeLegend");
    if (!ring) return;

    if (!total) {
      $("calSumEmpty").hidden = false;
      if (legend) legend.innerHTML = "";
      ring.innerHTML = "";
      return;
    }
    $("calSumEmpty").hidden = true;

    /* 环形：r=52，周长 C；用 stroke-dasharray / dashoffset 按占比拼接（起始 12 点方向） */
    var R = 52;
    var C = 2 * Math.PI * R;
    var acc = 0;
    var svg = '<circle class="ring-track" cx="60" cy="60" r="' + R + '" fill="none" stroke="currentColor" stroke-width="13"></circle>' +
      '<g transform="rotate(-90 60 60)">';
    segs.forEach(function (x) {
      var len = (x.val / total) * C;
      var gap = Math.max(C - len, 0);
      svg += '<circle class="ring-seg" cx="60" cy="60" r="' + R + '" fill="none" stroke="' + x.color + '" stroke-width="13"' +
        ' stroke-dasharray="' + len.toFixed(2) + ' ' + gap.toFixed(2) + '"' +
        ' stroke-dashoffset="' + (-acc).toFixed(2) + '"><title>' + escapeHtml(x.name + " · " + x.val + " 千卡") + '</title></circle>';
      acc += len;
    });
    svg += "</g>";
    ring.innerHTML = svg;

    if (!legend) return;
    legend.innerHTML = "";
    segs.forEach(function (x) {
      var lg = document.createElement("div");
      lg.className = "cal-legend-item";
      lg.innerHTML = '<span class="cal-dot" style="background:' + x.color + '"></span>' +
        '<span class="cal-legend-name">' + escapeHtml(x.name) + '</span>' +
        '<span class="cal-legend-val">' + x.val + '</span>';
      legend.appendChild(lg);
    });
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
  function addTask(text) {
    text = (text || "").trim();
    if (!text) { toast("请输入动作内容"); return; }
    getTasks(todayKey()).push({ id: "t" + Date.now() + Math.floor(Math.random() * 1000), text: text, done: false, w: "", s: "", r: "" });
    save();
    refreshAll();
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
    refreshAll();
  }
  /* 注：v4.0.0 起已删除 syncCheckin()——「是否已打卡」由 deriveDay() 纯派生，
     tasks 一变化（新增/删除/完成）状态即自动一致，无需任何手工状态回写。 */

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

  /* ---------- 动作库添加（按部位选动作，场景感知 + 图标） ---------- */
  var libPartIdx = 0;
  function openAddLib() {
    libPartIdx = 0;
    renderLibParts();
    renderLibList();
    $("libCustom").value = "";
    $("addLibOverlay").hidden = false;
  }
  function closeAddLib() { $("addLibOverlay").hidden = true; }
  /* 与推荐/任务共用：结构化动作 → 任务对象 */
  function taskFromExercise(a) {
    return {
      id: "t" + Date.now() + Math.floor(Math.random() * 1000),
      text: a.name, done: false, src: "lib",
      w: "", s: String(a.sets || ""), r: String(a.reps || ""),
      exid: a.id, weighted: !!a.weighted, timed: !!a.timed,
      icon: a.icon, part: a.part, equip: a.equip
    };
  }
  function renderLibParts() {
    var box = $("libParts");
    box.innerHTML = "";
    var scene = data.scene || "home";
    PARTS.forEach(function (p, i) {
      var cnt = exLibByPart(p.id, scene).length;
      if (!cnt) return;
      var c = document.createElement("div");
      c.className = "lib-part" + ((p.id === curLibPartId()) ? " sel" : "");
      c.setAttribute("data-pid", p.id);
      c.innerHTML = '<svg class="ex-icon-sm"><use href="#' + p.icon + '"></use></svg>' + p.name;
      box.appendChild(c);
    });
    if (!box.children.length) {
      box.innerHTML = '<div class="lib-part sel">当前场景暂无动作</div>';
    }
  }
  function curLibPartId() {
    var scene = data.scene || "home";
    var ids = PARTS.filter(function (p) { return exLibByPart(p.id, scene).length; }).map(function (p) { return p.id; });
    if (!ids.length) return null;
    if (libPartIdx >= ids.length) libPartIdx = 0;
    return ids[libPartIdx];
  }
  function renderLibList() {
    var box = $("libList");
    box.innerHTML = "";
    var scene = data.scene || "home";
    var pid = curLibPartId();
    if (!pid) { box.innerHTML = '<div class="day-empty">当前场景没有可用动作，试试切换场景</div>'; return; }
    var list = exLibByPart(pid, scene);
    list.forEach(function (a) {
      var row = document.createElement("div");
      row.className = "lib-item";
      row.innerHTML =
        '<div class="lib-ico"><svg><use href="#' + (a.icon || PART_MAP[a.part].icon) + '"></use></svg></div>' +
        '<div class="lib-item-main"><div class="lib-item-name">' + escapeHtml(a.name) + '</div>' +
        '<div class="lib-item-meta">' + a.sets + '组 × ' + escapeHtml(a.reps) + ' · ' + escapeHtml(a.equip) +
        (a.weighted ? '' : ' · 自重') + '</div></div>' +
        '<div class="lib-item-add">＋</div>';
      row.addEventListener("click", function () { addExerciseFromLib(a); });
      box.appendChild(row);
    });
  }
  function addExerciseFromLib(a) {
    var t = (a && typeof a === "object") ? taskFromExercise(a) : buildTaskFromPlanItem(a);
    getTasks(todayKey()).push(t);
    save();
    refreshAll();
    toast("已添加：" + t.text);
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
  }

  function renderDayDetail(k) {
    var title = $("dayDetailTitle");
    title.textContent = humanDate(k) + " 详情";
    var box = $("dayDetail");
    box.innerHTML = "";
    var d = deriveDay(k);   // 唯一派生入口：checked / exercises / actions 全部来自这里
    if (!d.checked && d.exercises.length === 0 && d.actions.length === 0) {
      var e = document.createElement("div");
      e.className = "day-empty";
      e.textContent = "这一天没有打卡记录";
      box.appendChild(e);
      return;
    }
    var head = document.createElement("div");
    head.className = "day-row";
    var dayCal = dayCalorie(k);
    head.innerHTML = '<div class="ex-emoji">' + (d.checked ? "✅" : "📝") + '</div>' +
      '<div class="ex-main"><div class="ex-name">' + (d.checked ? "已打卡" : "未打卡") +
      '</div><div class="ex-meta">共 ' + d.exercises.length + ' 项 · ' + dayDuration(k) + ' 分钟' +
      (dayCal ? ' · 约 ' + dayCal + ' 千卡' : '') + '</div></div>';
    box.appendChild(head);
    d.exercises.forEach(function (ex) { box.appendChild(exRow(ex)); });
    /* 当日做过的动作内容（重量/组数/次数） */
    if (d.actions.length) {
      var aHead = document.createElement("div");
      aHead.className = "day-row day-actions-head";
      aHead.innerHTML = '<div class="ex-main"><div class="ex-name">今日动作</div></div>';
      box.appendChild(aHead);
      d.actions.forEach(function (a) { box.appendChild(actionRow(a)); });
    }
  }

  /* ---------- 弹层：记录运动 ---------- */
  var editDate = null;
  var selectedType = EXERCISE_TYPES[0].id;
  var selectedSport = "";   // 球类/游泳等具体项目（如「羽毛球」）

  function renderChips() {
    var box = $("typeChips");
    box.innerHTML = "";
    EXERCISE_TYPES.forEach(function (t) {
      var c = document.createElement("div");
      c.className = "chip" + (t.id === selectedType ? " sel" : "");
      c.innerHTML = t.emoji + " " + t.name;
      c.addEventListener("click", function () {
        selectedType = t.id;
        selectedSport = "";
        renderChips();
        renderSportList();
        updateCalEstimate();
      });
      box.appendChild(c);
    });
  }

  /* 球类/游泳/跑步/骑行 等类型：展示简单项目列表，点击即选，自动带入默认时长并估算卡路里（无需手动输入） */
  function renderSportList() {
    var box = $("sportList");
    if (!box) return;
    var list = sportsOf(selectedType);
    if (!list.length) { box.hidden = true; box.innerHTML = ""; return; }
    box.hidden = false;
    box.innerHTML = "";
    list.forEach(function (name) {
      var sp = SPORT_LIB[name];
      var row = document.createElement("div");
      row.className = "sport-item" + (selectedSport === name ? " sel" : "");
      row.innerHTML =
        '<span class="sport-name">' + escapeHtml(name) + '</span>' +
        '<span class="sport-meta">约' + sp.minutes + '分 · 预计' + Math.round(sp.met * getWeight() * sp.minutes / 60) + '千卡</span>';
      row.addEventListener("click", function () { selectSport(name); });
      box.appendChild(row);
    });
  }
  function selectSport(name) {
    selectedSport = name;
    var sp = SPORT_LIB[name];
    if (sp) { $("inpDuration").value = sp.minutes; }
    renderSportList();
    updateCalEstimate();
  }
  /* 实时更新「预计消耗」估算（随时长/项目/体重变化） */
  function updateCalEstimate() {
    var el = $("calEstimate");
    if (!el) return;
    var dur = parseInt($("inpDuration").value, 10);
    if (!dur || dur <= 0) { el.textContent = "填写时长后自动估算"; el.hidden = false; return; }
    var met = (selectedSport && SPORT_LIB[selectedSport]) ? SPORT_LIB[selectedSport].met : (TYPE_MAP[selectedType] ? TYPE_MAP[selectedType].met : 4);
    var kcal = Math.round(met * getWeight() * dur / 60);
    el.textContent = "预计消耗 ≈ " + kcal + " 千卡（估算值，仅供参考）";
    el.hidden = false;
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
      var dispName = ex.sport || t.name;
      var row = document.createElement("div");
      row.className = "edit-item";
      var meta = [];
      if (ex.duration) meta.push(ex.duration + "分");
      if (ex.calories) meta.push(ex.calories + "千卡");
      row.innerHTML =
        '<span class="ei-emoji">' + t.emoji + '</span>' +
        '<div class="ei-main"><div class="ei-name">' + escapeHtml(dispName) + '</div>' +
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
    selectedSport = "";
    $("sheetTitle").textContent = humanDate(k) + " · 运动记录";
    $("inpDuration").value = "";
    $("inpNote").value = "";
    renderChips();
    renderSportList();
    updateCalEstimate();
    renderEditList();
    /* 撤销按钮：仅在「已打卡」时出现（派生自任务完成度 + confirmed） */
    $("btnUndo").hidden = !deriveDay(k).checked;
    $("btnFinish").textContent = (k === todayKey()) ? "完成打卡" : "保存";
    $("sheetOverlay").hidden = false;
  }
  function closeSheet() { $("sheetOverlay").hidden = true; editDate = null; selectedSport = ""; }

  function addExercise() {
    var dur = parseInt($("inpDuration").value, 10);
    var note = $("inpNote").value.trim();
    if (!dur || dur <= 0) { toast("请填写运动时长，或从列表选择球类/游泳等项目"); return; }
    var rec = ensureRecord(editDate);
    var cal = estExKcal({ type: selectedType, sport: selectedSport, duration: dur });
    var addedSport = selectedSport;
    rec.exercises.push({ type: selectedType, sport: selectedSport, duration: dur, calories: cal, note: note });
    save();
    renderEditList();
    renderDayDetail(editDate);
    renderToday();
    $("inpDuration").value = ""; $("inpNote").value = "";
    selectedSport = "";
    renderSportList();
    updateCalEstimate();
    toast(addedSport ? ("已添加：" + addedSport) : "已添加");
  }

  function finishSheet() {
    var rec = ensureRecord(editDate);
    var tk = todayKey();
    /* 用户显式确认 → 只写 confirmed（派生层唯一保留的确认标志）。
       当日若仍有未完成任务，deriveDay() 依然判定「未打卡」——
       「没做完就不算打卡」这条规则在数据层强制成立，任何入口都无法绕过。 */
    rec.confirmed = (editDate === tk) ? true : (rec.exercises.length > 0);
    save();
    closeSheet();
    refreshAll();
    var d = deriveDay(editDate);
    if (d.pending > 0) toast("还有 " + d.pending + " 个动作未完成，暂不计入打卡");
    else toast(editDate === tk ? (namePrefix() + "打卡成功 🔥") : "已保存");
  }

  function undoToday() {
    var tk = todayKey();
    var rec = getRecord(tk);
    if (rec) {
      rec.confirmed = false;
      if ((rec.exercises || []).length === 0) delete data.records[tk];
    }
    /* 任务完成态也是「已打卡」的事实源之一，撤销必须一并回退，否则仍会被判为已打卡 */
    (data.tasks[tk] || []).forEach(function (t) { t.done = false; });
    save();
    closeSheet();
    refreshAll();
    toast("已撤销今日打卡");
  }

  /* ---------- 统计 + 图表 ---------- */
  /* 应用标题（用户可改）：同步 header 顶部 + 统计页输入框回填 */
  function renderAppTitle() {
    var el = $("headerTitle");
    if (el) el.textContent = data.appTitle || "健身打卡";
    var inp = $("inpAppTitle");
    if (inp && inp.value !== (data.appTitle || "")) {
      inp.value = data.appTitle || "健身打卡";
    }
  }
  /* 点击 header 标题 → 原位编辑（Enter/失焦确认，Esc 取消） */
  function startEditAppTitle() {
    var title = $("headerTitle");
    var input = $("headerTitleEdit");
    if (!title || !input || input.classList.contains("show")) return;
    title.hidden = true;
    input.classList.add("show");
    input.value = data.appTitle || "健身打卡";
    setTimeout(function () { try { input.focus(); input.select(); } catch (e) {} }, 0);
  }
  function commitAppTitleEdit(cancel) {
    var title = $("headerTitle");
    var input = $("headerTitleEdit");
    if (!title || !input || title.hidden !== true) return;  // 防重入（Enter 后 blur 会再触发）
    if (!cancel) {
      data.appTitle = (input.value || "").trim() || "健身打卡";
      save();
    }
    input.classList.remove("show");
    title.hidden = false;
    renderAppTitle();
  }
  function renderStats() {
    var s = computeStreaks();
    var t = totals();
    $("sumTotal").textContent = s.total;
    $("sumCur").textContent = s.current;
    $("sumLong").textContent = s.longest;
    $("sumDur").textContent = t.dur;

    renderAppTitle();     // 同步回填「应用标题」输入框
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
      ctx.fillStyle = isChecked(keys[i]) ? "#2563EB" : "#DBE6FF";
      roundRect(ctx, x, y, bwReal, bh, 5); ctx.fill();
      ctx.fillStyle = "#64748B";
      ctx.font = "11px sans-serif";
      ctx.fillText(String(new Date(keys[i] + "T00:00:00").getDate()), cx, h - 6);
      if (vals[i] > 0) {
        ctx.fillStyle = "#0F172A";
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
    ctx.strokeStyle = "#EEF2F7"; ctx.lineWidth = 1;
    for (var g = 0; g <= 3; g++) {
      var gy = padT + (plotH * g) / 3;
      ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(w - padR, gy); ctx.stroke();
    }
    // area
    var grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
    grad.addColorStop(0, "rgba(37,99,235,0.30)");
    grad.addColorStop(1, "rgba(37,99,235,0.02)");
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
    ctx.strokeStyle = "#2563EB"; ctx.lineWidth = 2; ctx.stroke();
    // points (checked days)
    for (var p = 0; p < vals.length; p++) {
      if (isChecked(keys[p])) {
        ctx.beginPath(); ctx.arc(px(p), py(vals[p]), 2.5, 0, Math.PI * 2);
        ctx.fillStyle = "#2563EB"; ctx.fill();
      }
    }
    // x labels
    ctx.fillStyle = "#64748B"; ctx.font = "10px sans-serif"; ctx.textAlign = "center";
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

  /* ---------- 训练计划（按场景动态生成：推 / 拉 / 腿 分化） ---------- */
  /* 计划模板：每个训练日的部位组合 */
  var PLAN_TEMPLATES = [
    { id: "A", name: "A · 推（胸·肩·三头）", parts: ["chest", "shoulder", "arms"] },
    { id: "B", name: "B · 拉（背·二头）", parts: ["back", "arms"] },
    { id: "C", name: "C · 腿臀（股·臀·核心）", parts: ["legs", "core"] },
    { id: "D", name: "D · 全身+有氧", parts: ["chest", "back", "legs", "core", "cardio"] }
  ];
  /* 依据当前场景生成计划（每次调用按近 14 天去重挑选） */
  function buildPlan() {
    var scene = data.scene || "home";
    var sceneName = SCENES[scene] ? SCENES[scene].name : "居家";
    var days = PLAN_TEMPLATES.map(function (tpl) {
      var items = [];
      tpl.parts.forEach(function (p) {
        var pool = exLibByPart(p, scene);
        if (!pool.length) return;
        /* 每个部位挑 1-2 个，优先随机化以增加多样性 */
        var shuffled = pool.slice().sort(function () { return Math.random() - 0.5; });
        var take = Math.min(shuffled.length, p === "cardio" ? 1 : 2);
        items = items.concat(shuffled.slice(0, take));
      });
      return {
        id: tpl.id, name: tpl.name,
        items: items.map(function (a) { return a.name + " " + a.sets + "组 × " + a.reps; })
      };
    });
    return {
      note: "为「" + getHeight() + "cm / " + getWeight() + "kg · " + sceneName + " · 器械：" +
        sceneEquipText(scene) + "」生成的每周 4 练计划（推/拉/腿/全身+有氧），隔天休息。组间休 60-90 秒，动作标准优先。",
      rest: "休息日：拉伸 / 泡沫轴 / 散步 20-30 分钟，保持活动、促进恢复。",
      days: days
    };
  }
  function sceneEquipText(scene) {
    return scene === "gym" ? "固定器械 / 哑铃 / 杠铃 / 绳索" : "哑铃 / 杠铃 / 瑜伽垫";
  }
  function ensurePlan(refresh) {
    if (refresh || !data.plan || !data.plan.days || !data.plan.days.length) {
      data.plan = buildPlan(); save();
    }
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
    ensurePlan();
    renderSceneSwitch();
    if (!data.plan) return;
    $("planIntro").textContent = data.plan.note || "";
    var list = $("planList");
    list.innerHTML = "";
    var todayId = planDayIdFor(new Date().getDay());
    data.plan.days.forEach(function (d) {
      var isToday = (d.id === todayId);
      var card = document.createElement("div");
      card.className = "plan-card" + (isToday ? " today" : "");
      var items = d.items.map(function (it) {
        var a = findExerciseByName(it.split(" ")[0]);
        var ic = a ? '<svg class="ex-icon-sm" style="margin-right:6px;vertical-align:-2px"><use href="#' + (a.icon || PART_MAP[a.part].icon) + '"></use></svg>' : "";
        return "<li>" + ic + escapeHtml(it) + "</li>";
      }).join("");
      card.innerHTML =
        '<div class="plan-name">' + escapeHtml(d.name) +
        (isToday ? '<span class="plan-today-tag">今天</span>' : '') + '</div>' +
        '<ul class="plan-items">' + items + '</ul>' +
        '<button class="plan-load" data-day="' + d.id + '">' + (isToday ? "载入今日" : "练这一天") + '</button>';
      list.appendChild(card);
    });
    $("planRest").textContent = data.plan.rest || "";
  }
  function loadPlanDay(dayId) {
    ensurePlan();
    if (!data.plan) return;
    var day = getPlanDay(dayId);
    if (!day) return;
    var tk = todayKey();
    var existing = getTasks(tk);
    if (existing.length && !confirm("今日已有 " + existing.length + " 项任务，用「" + day.name + "」替换？")) return;
    data.tasks[tk] = day.items.map(function (it) {
      var a = findExerciseByName(it.split(" ")[0]);
      if (a) return taskFromExercise(a);
      return buildTaskFromPlanItem(it);
    });
    save();
    showTab("today");
    renderTasks();
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
    if (name === "room") {
      renderRoom();
      /* 进页时顺带拉一次最新看板（失败静默：本地打卡不受影响） */
      if (isCloudReady() && cloud.room) {
        loadRoomData().then(function () { if (isRoomTab()) renderRoom(); }).catch(function () {});
      } else if (cloudOn() && !cloud.ready) { cloudInit(); }
    }
  }

  /* ---------- 工具 ---------- */
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function refreshAll() {
    renderAppTitle();
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

  /* 导入备份：写入 localStorage 后走标准 load()，复用全部旧版本迁移逻辑 */
  function importData(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var obj = JSON.parse(String(reader.result || ""));
        if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw new Error("不是有效的备份文件");
        if (!obj.tasks && !obj.records && !obj.plan) throw new Error("文件里没有打卡数据");
        if (!confirm("导入会覆盖这台设备上的现有数据，确定继续？")) return;
        localStorage.setItem(DATA_KEY, JSON.stringify(obj));
        load();                    // 归一化 + 旧数据迁移
        ensurePlan(false);
        save();
        applyTheme();              // 主题与壁纸随备份恢复
        renderAppTitle();
        renderSceneSwitch();
        renderGenderToggle();
        refreshAll();
        renderCalendar();
        toast("数据已导入");
      } catch (e) {
        toast("导入失败：" + ((e && e.message) || "文件无法解析"));
      }
    };
    reader.onerror = function () { toast("导入失败：读取文件出错"); };
    reader.readAsText(file);
  }

  /* ============================================================
     分步打卡向导（一次一个动作 + 滚轮调重量/组数/次数）
     ============================================================ */
  var WEIGHTS = []; for (var wv = 0; wv <= 200; wv += 2.5) WEIGHTS.push(Math.round(wv * 10) / 10);
  var SETS = []; for (var sv = 1; sv <= 10; sv++) SETS.push(sv);
  var REPS = []; for (var rv = 1; rv <= 30; rv++) REPS.push(rv);
  var TIMED_SECS = []; for (var tv = 10; tv <= 300; tv += 5) TIMED_SECS.push(tv);

  var wizTasks = [];
  var wizIndex = 0;
  var wizEmpty = false;
  /* 计时器状态（仅 timed 动作使用） */
  var wizTimerState = { duration: 0, remaining: 0, running: false, finished: false, rafId: 0, lastTick: 0 };

  function numOr(v, def) { var n = parseFloat(v); return isNaN(n) ? def : n; }

  /* 判断任务是否需要额外负重（自适应交互：自重动作不显示重量滚轮） */
  function isWeightedTask(t) {
    if (!t) return true;
    if (typeof t.weighted === "boolean") return t.weighted;
    var ex = t.exid != null ? exById(t.exid) : findExerciseByName(String(t.text || "").split(" ")[0]);
    return ex ? !!ex.weighted : true;
  }
  /* 判断任务是否为时间型（平板支撑等） */
  function isTimedTask(t) {
    if (!t) return false;
    if (typeof t.timed === "boolean") return t.timed;
    var ex = t.exid != null ? exById(t.exid) : findExerciseByName(String(t.text || "").split(" ")[0]);
    return ex ? !!ex.timed : /秒|分钟/.test(String(t.r || ""));
  }

  /* ---------- 卡路里估算（精确做功模型） ---------- */
  function getWeight() { return (typeof data.weight === "number" && data.weight > 0) ? data.weight : DEFAULT_WEIGHT; }
  function getHeight() { return (typeof data.height === "number" && data.height > 0) ? data.height : DEFAULT_HEIGHT; }
  function getAge() { return (typeof data.age === "number" && data.age > 0) ? data.age : DEFAULT_AGE; }
  function getGender() { return data.gender === "female" ? "female" : "male"; }
  function getUsername() { return (typeof data.username === "string" && data.username.trim()) ? data.username.trim() : ""; }
  /* 带称呼的前缀：有用户名返回「名字，」，否则返回空串 */
  function namePrefix() { var u = getUsername(); return u ? (u + "，") : ""; }

  /* 基础代谢率 BMR（Mifflin-St Jeor 公式，kcal/天）——委托纯模块 js/calc.js */
  function bmr() { return CALC.bmrPure(getWeight(), getHeight(), getAge(), getGender()); }

  /* 当前身体参数上下文（供纯函数显式传参，便于单测） */
  function ctxOf() {
    var w = getWeight(), h = getHeight(), a = getAge(), g = getGender();
    return { weight: w, height: h, age: a, gender: g, bmr: CALC.bmrPure(w, h, a, g) };
  }

  /* 力量训练（今日任务）：做功 + 代谢模型。
     —— 公式本身在 js/calc.js（纯函数）；此处只负责「任务 → 显式入参」的解析。
     ① 机械做功 W = 有效负荷 × 次数 × 组数 × 位移(约0.5m) × 重力 9.8，换算 kcal（1 kcal = 4184 J）；
     ② 人体做功效率约 25%，组间休息也有代谢消耗，故乘补偿系数；
     ③ 自重动作：有效负荷 ≈ 体重 × 动作系数（ex.selfLoad，缺省 0.6）；
     ④ 叠加 BMR 分摊（按每组约 105 秒折算）；
     timed 动作（平板支撑等）按「MET × 体重 × 秒数」估算。
     ctx 可显式传入（测试用）；缺省取当前身体数据。返回整数千卡或 null。 */
  function estTaskKcal(t, ctx) {
    if (!t) return null;
    ctx = ctx || ctxOf();
    var s = numOr(t.s, null);
    if (s == null || s <= 0) return null;
    var ex = t.exid != null ? exById(t.exid) : findExerciseByName(String(t.text || "").split(" ")[0]);

    /* 时间型（平板支撑 / 开合跳秒数等）：用 MET 估算 */
    if (t.timed || (ex && ex.timed)) {
      var secs = parseDurationSec(t.r, ex ? ex.reps : null);
      if (!secs) return null;
      var met = ex ? ex.met : 4;
      var kt = CALC.kcalTimedPure(met, ctx.weight, secs, s, ctx.bmr);
      return kt == null ? null : Math.round(kt);
    }

    var r = numOr(t.r, null);
    if (r == null || r <= 0) return null;
    var w = numOr(t.w, null);
    var isWeighted = (ex ? !!ex.weighted : true);
    var effW;
    if (!isWeighted) {
      effW = ctx.weight * (ex && ex.selfLoad ? ex.selfLoad : CALC.CALIB.selfLoadFallback);
    } else {
      effW = (w == null || w === 0) ? ctx.weight * CALC.CALIB.selfLoadFallback : w;
    }
    var disp = ex && ex.disp ? ex.disp : CALC.CALIB.displacement;
    var kcal = CALC.kcalStrengthPure(effW, r, s, disp, ctx.bmr, CALC.CALIB.restSecPerSet);
    return kcal == null ? null : Math.round(kcal);
  }

  /* 解析时长文本（"45-60秒" / "30秒" / "20分钟" / "12"）为秒数——委托纯模块 */
  function parseDurationSec(v, fallbackText) { return CALC.parseDurationSec(v, fallbackText); }

  /* 有氧/球类/游泳（运动记录，含类型/时长）：MET × 体重(kg) × 时长(分钟) / 60。
     具体项目（如羽毛球）优先用 SPORT_LIB 的 MET；否则用类型平均 MET。缺时长则返回 null。 */
  function estExKcal(ex, ctx) {
    if (!ex) return null;
    ctx = ctx || ctxOf();
    var met = (ex.sport && SPORT_LIB[ex.sport]) ? SPORT_LIB[ex.sport].met : (TYPE_MAP[ex.type] ? TYPE_MAP[ex.type].met : 4);
    var min = numOr(ex.duration, null);
    if (min == null || min <= 0) return null;
    var k = CALC.kcalCardioPure(met, ctx.weight, min);
    return k == null ? null : Math.round(k);
  }

  /* 今日预计消耗（千卡）= 今日任务做功法之和 + 今日运动记录 MET 之和
     —— 即 dayCalorie(今天) 的语义别名（统一走派生层） */
  function todayCalorie() { return dayCalorie(todayKey()); }
  /* 指定日期的总消耗（历史/日历用）：派生动作明细（重量/组数/次数）+ 运动记录 */
  function dayCalorie(k) {
    var d = deriveDay(k);
    var sum = 0;
    d.actions.forEach(function (a) { var kc = estTaskKcal(a); if (kc != null) sum += kc; });
    d.exercises.forEach(function (e) { var kc = estExKcal(e); if (kc != null) sum += kc; });
    return sum;
  }

  /* 从 start 起寻找下一个未完成的动作索引（向后循环），没有则返回 -1 */
  function firstUndoneFrom(arr, start) {
    for (var i = start; i < arr.length; i++) if (!arr[i].done) return i;
    for (var j = 0; j < start; j++) if (!arr[j].done) return j;
    return -1;
  }

  function openWizard(k) {
    var tasks = getTasks(k);
    wizTasks = tasks;
    wizIndex = 0;
    // 复位视图（防止上次「打卡成功」完成页残留，导致重新打开报错）
    stopWizTimer(true);
    hideWizTimer();
    var ico0 = $("wizActionIco");
    if (ico0) ico0.classList.remove("done");
    $("wizDoneView").hidden = true;
    $("wizBody").hidden = false;
    $("wizFoot").hidden = false;
    $("wizBack").style.visibility = "visible";
    if (tasks.length) {
      // 从上次退出的动作继续，避免重复翻页
      var ri = (typeof data.wizResume === "number" && !isNaN(data.wizResume)) ? data.wizResume : 0;
      if (ri < 0) ri = 0;
      if (ri > tasks.length - 1) ri = tasks.length - 1;
      // 若记忆位置已完成，自动跳到下一个未完成动作，避免停在完成态上
      if (tasks[ri] && tasks[ri].done) {
        var nu = firstUndoneFrom(tasks, ri);
        if (nu !== -1) ri = nu;
      }
      wizIndex = ri;
    }
    if (!tasks.length) {
      // 休息日 / 未安排：中间圆形按钮直接打卡（提示文案由 CSS .wiz-body.empty ::after 渲染）
      wizEmpty = true;
      $("wizBody").classList.add("empty");
      $("wizActionName").textContent = "今天没有安排动作";
      $("wizProgress").innerHTML = "";
      $("wizCount").textContent = "";
      $("wizPrev").disabled = true;
      $("wizNext").disabled = true;
      $("wizard").hidden = false;
      return;
    }
    wizEmpty = false;
    $("wizBody").classList.remove("empty");
    $("wizPrev").disabled = false;
    $("wizNext").disabled = false;
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
    /* 动作图标 */
    var icoBox = $("wizActionIco");
    if (icoBox) {
      var ic = t.icon || (t.part && PART_MAP[t.part] ? PART_MAP[t.part].icon : "ic-bodyweight");
      icoBox.innerHTML = '<svg viewBox="0 0 24 24"><use href="#' + ic + '"></use></svg>';
    }
    /* 是否显示重量滚轮：需要负重的动作才显示（自适应交互） */
    var needWeight = isWeightedTask(t);
    var wheels = $("wizWheels");
    var lblW = $("lblW");
    if (wheels) wheels.classList.toggle("selfweight", !needWeight);
    if (lblW) lblW.hidden = !needWeight;
    var isTimed = isTimedTask(t);
    if ($("lblR")) $("lblR").textContent = isTimed ? "时长(秒)" : "次数";

    if (needWeight) buildWheel("wheelItemsW", "wheelW", WEIGHTS, numOr(t.w, 0));
    buildWheel("wheelItemsS", "wheelS", SETS, numOr(t.s, 1));
    var repVals = isTimed ? TIMED_SECS : REPS;
    buildWheel("wheelItemsR", "wheelR", repVals, numOr(t.r, isTimed ? 45 : 1));
    var prevBtn = $("wizPrev");
    var nextBtn = $("wizNext");
    prevBtn.disabled = (wizIndex === 0);
    nextBtn.disabled = (wizIndex >= total - 1);
    /* 进度点：已完成(i<wizIndex)的也带 done 样式（绿），与当前步骤的蓝区分开 */
    if (prog.children) {
      for (var j = 0; j < prog.children.length; j++) {
        var dj = prog.children[j];
        if (!dj) continue;
        if (j < wizIndex) dj.classList.add("done");
        else dj.classList.remove("done");
      }
    }
    updateWizCal();
    /* 计时器：timed 动作直接显示（无入口按钮），非 timed 隐藏；
       每次切到新动作时按预设秒数重置 */
    var timerBox = $("wizTimerBox");
    if (timerBox) {
      if (isTimed) {
        var dur = numOr(t.r, 45);
        if (!isFinite(dur) || dur < 5) dur = 5;
        if (dur > 600) dur = 600;
        initWizTimer(Math.round(dur));
        timerBox.hidden = false;
      } else {
        stopWizTimer(true);
        timerBox.hidden = true;
      }
    }
  }

  /* 实时刷新向导底部卡路里：当前动作 ≈ kcal + 今日累计 ≈ kcal */
  function updateWizCal() {
    var curEl = $("wizCalCur");
    var totEl = $("wizCalTotal");
    var legacyEl = $("wizCal");
    if (wizEmpty || !wizTasks.length) {
      if (legacyEl) legacyEl.textContent = "今日累计 ≈ " + todayCalorie() + " 千卡（估算）";
      if (curEl) curEl.textContent = "";
      if (totEl) totEl.textContent = "";
      return;
    }
    var t = wizTasks[wizIndex];
    var k = estTaskKcal(t);
    var curText = k == null
      ? "当前动作：填写组数/次数后估算"
      : "当前动作 ≈ " + k + " 千卡";
    var totalText = "今日累计 ≈ " + todayCalorie() + " 千卡";
    if (curEl && totEl) {
      curEl.textContent = curText;
      totEl.textContent = totalText;
      if (legacyEl) legacyEl.classList.add("wiz-cal-split");
    } else if (legacyEl) {
      legacyEl.textContent = (k == null ? "" : curText + " · ") + totalText + "（估算）";
    }
  }

  function buildWheel(itemsElId, wheelElId, values, initial) {
    var box = $(itemsElId);
    if (!box) return;
    box.innerHTML = "";
    var initIdx = 0;
    var isTimed = (wheelElId === "wheelR") && isTimedTask(wizTasks[wizIndex]);
    values.forEach(function (v, i) {
      var d = document.createElement("div");
      var isSel = (String(v) === String(initial));
      d.className = "wheel-item" + (isSel ? " sel" : "");
      if (wheelElId === "wheelW") {
        d.textContent = (Math.round(v * 10) / 10 % 1 === 0 ? v : (Math.round(v * 10) / 10).toFixed(1));
      } else if (wheelElId === "wheelR" && isTimed) {
        d.textContent = v + "s";
      } else {
        d.textContent = v;
      }
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
    // 实时刷新卡路里（组数/重量/次数/时长变化即时反映）
    updateWizCal();
    /* 时长滚轮 → 计时器实时联动：timed 动作改秒数时，计时器时长同步重置 */
    if (wheelElId === "wheelR" && isTimedTask(t)) {
      var d = numOr(val, 45);
      if (!isFinite(d) || d < 5) d = 5;
      if (d > 600) d = 600;
      initWizTimer(Math.round(d));
    }
  }

  /* 上一个：返回上一个动作（不退出、不标记完成） */
  function navigatePrev() {
    if (wizEmpty || !wizTasks.length) return;
    if (wizIndex > 0) { wizIndex--; renderWizardStep(); }
  }
  /* 下一个：前往下一个动作（纯翻页，不标记完成） */
  function navigateNext() {
    if (wizEmpty || !wizTasks.length) return;
    if (wizIndex < wizTasks.length - 1) { wizIndex++; renderWizardStep(); }
  }
  /* 圆形「完成」按钮：仅标记当前动作为已完成，并前进到下一动作（全部完成则结束打卡） */
  function completeCurrent() {
    if (wizEmpty || !wizTasks.length) { finishWizard(); return; }
    stopWizTimer(true);   // 当前动作完成 → 停计时
    hideWizTimer();       // 内嵌计时器若已展开，收回为「开始计时」按钮态
    wizTasks[wizIndex].done = true;
    save();
    var allDone = wizTasks.every(function (t) { return t.done; });
    /* 视觉反馈：图标暗化 + 绿勾角标，进度点标 done，480ms 后切下一步 */
    var ico = $("wizActionIco");
    var prog = $("wizProgress");
    if (ico) ico.classList.add("done");
    if (prog && prog.children && prog.children[wizIndex]) prog.children[wizIndex].classList.add("done");
    setTimeout(function () {
      if (ico) ico.classList.remove("done");
      if (allDone) {
        finishWizard();
        return;
      }
      var nu = firstUndoneFrom(wizTasks, wizIndex + 1);
      if (nu === -1) nu = wizIndex;
      wizIndex = nu;
      renderWizardStep();
      toast("还有动作未完成，继续 →");
    }, 480);
  }

  /* ============================================================
     计时器 + 闹钟（仅 timed 动作启用；独立弹窗，点击圆圈 = 开始/暂停/继续）
     ============================================================ */
  var WIZ_TIMER_R = 52;   // 圆环半径
  var WIZ_TIMER_C = 2 * Math.PI * WIZ_TIMER_R;  // 周长
  function initWizTimer(dur) {
    stopWizTimer(true);
    wizTimerState.duration = dur;
    wizTimerState.remaining = dur;
    wizTimerState.running = false;
    wizTimerState.finished = false;
    updateWizTimerUI();
  }
  function stopWizTimer(clear) {
    wizTimerState.running = false;
    if (wizTimerState.rafId) {
      cancelAnimationFrame(wizTimerState.rafId);
      wizTimerState.rafId = 0;
    }
    if (clear) {
      wizTimerState.remaining = wizTimerState.duration;
      wizTimerState.finished = false;
    }
    updateWizTimerUI();
  }
  function startWizTimer() {
    if (wizTimerState.finished) {
      wizTimerState.remaining = wizTimerState.duration;
      wizTimerState.finished = false;
    }
    if (wizTimerState.remaining <= 0) return;
    wizTimerState.running = true;
    wizTimerState.lastTick = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    tickWizTimer();
  }
  function pauseWizTimer() {
    wizTimerState.running = false;
    if (wizTimerState.rafId) {
      cancelAnimationFrame(wizTimerState.rafId);
      wizTimerState.rafId = 0;
    }
    updateWizTimerUI();
  }
  function resetWizTimer() {
    if (wizTimerState.duration <= 0) wizTimerState.duration = 45;
    initWizTimer(wizTimerState.duration);
  }
  /* 点击圆圈：finished → 重置并重新开始；running → 暂停；其余 → 开始 */
  function toggleWizTimer() {
    if (wizTimerState.finished) { resetWizTimer(); startWizTimer(); }
    else if (wizTimerState.running) { pauseWizTimer(); }
    else { startWizTimer(); }
  }
  function tickWizTimer() {
    if (!wizTimerState.running) return;
    var now = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    var dt = (now - wizTimerState.lastTick) / 1000;
    wizTimerState.lastTick = now;
    wizTimerState.remaining = Math.max(0, wizTimerState.remaining - dt);
    updateWizTimerUI();
    if (wizTimerState.remaining <= 0) {
      wizTimerState.running = false;
      wizTimerState.finished = true;
      wizTimerState.rafId = 0;
      updateWizTimerUI();
      timerAlarm();
      return;
    }
    wizTimerState.rafId = requestAnimationFrame(tickWizTimer);
  }
  function updateWizTimerUI() {
    var num = $("wizTimerNum");
    var lbl = $("wizTimerLbl");
    var bar = $("wizTimerBar");
    var ring = $("wizTimerRing");
    if (num) num.textContent = formatWizTimer(wizTimerState.remaining);
    if (lbl) {
      if (wizTimerState.finished) lbl.textContent = "时间到！再点一下重新开始";
      else if (wizTimerState.running) lbl.textContent = "点击圆圈暂停";
      else if (wizTimerState.duration > 0 && wizTimerState.remaining < wizTimerState.duration) lbl.textContent = "点击圆圈继续";
      else if (wizTimerState.duration > 0) lbl.textContent = "点击圆圈开始";
      else lbl.textContent = "—";
    }
    if (ring) ring.classList.toggle("running", wizTimerState.running);
    if (bar) {
      var ratio = wizTimerState.duration > 0 ? (wizTimerState.remaining / wizTimerState.duration) : 0;
      if (ratio < 0) ratio = 0;
      bar.style.strokeDasharray = WIZ_TIMER_C;
      bar.style.strokeDashoffset = WIZ_TIMER_C * (1 - ratio);
      bar.classList.toggle("done", wizTimerState.finished);
    }
  }
  /* 计时器显隐辅助：timed 动作在 renderWizardStep 里直接显示；这里只负责收回 */
  function hideWizTimer() {
    var box = $("wizTimerBox");
    if (box) box.hidden = true;
  }
  function formatWizTimer(sec) {
    var s = Math.ceil(sec);
    if (!isFinite(s) || s < 0) s = 0;
    var m = Math.floor(s / 60);
    var r = s % 60;
    return (m < 10 ? "0" : "") + m + ":" + (r < 10 ? "0" : "") + r;
  }
  /* Web Audio 合成哔哔声 + 振动（无外部资源，离线可用；用户首次交互后自动激活） */
  function getWizAudio() {
    if (!window.__wizAC) {
      try {
        var Ctor = window.AudioContext || window.webkitAudioContext;
        if (Ctor) window.__wizAC = new Ctor();
      } catch (e) { window.__wizAC = null; }
    }
    return window.__wizAC;
  }
  function beep(durationMs, freq) {
    var ac = getWizAudio();
    if (!ac) return;
    try {
      var o = ac.createOscillator();
      var g = ac.createGain();
      o.type = "sine";
      o.frequency.value = freq || 880;
      var t0 = ac.currentTime;
      g.gain.setValueAtTime(0.0, t0);
      g.gain.linearRampToValueAtTime(0.4, t0 + 0.02);
      g.gain.linearRampToValueAtTime(0.0, t0 + durationMs / 1000);
      o.connect(g); g.connect(ac.destination);
      o.start();
      o.stop(t0 + durationMs / 1000 + 0.02);
    } catch (e) {}
  }
  function timerAlarm() {
    beep(180, 880);
    setTimeout(function () { beep(180, 660); }, 220);
    setTimeout(function () { beep(180, 880); }, 440);
    setTimeout(function () {
      try { if (navigator.vibrate) navigator.vibrate([200, 80, 200, 80, 200]); } catch (e) {}
    }, 30);
  }

  function finishWizard() {
    var rec = ensureRecord(todayKey());
    /* 写用户的显式打卡确认。动作明细不再单独持久化——由 deriveDay() 从 data.tasks 派生。
       有任务时 deriveDay 仍要求「全部完成」才算已打卡，故这里不会把未完成的记成完成。 */
    rec.confirmed = true;
    save();
    showWizardDone();
  }

  function showWizardDone() {
    $("wizBody").hidden = true;
    $("wizFoot").hidden = true;
    $("wizProgress").innerHTML = "";
    $("wizCount").textContent = "";
    $("wizBack").style.visibility = "hidden";
    $("wizDoneSub").textContent = "已记录 " + (wizTasks.length || 0) + " 个动作，继续加油 💪";
    $("wizDoneView").hidden = false;
    setTimeout(function () { closeWizard(); refreshAll(); toast(namePrefix() + "打卡成功 🔥"); }, 1300);
  }

  function closeWizard() {
    // 记住当前所在动作，下次进入今日打卡时从中途继续（避免重复翻页）
    data.wizResume = (typeof wizIndex === "number") ? wizIndex : 0;
    save();
    stopWizTimer(true);
    hideWizTimer();
    var icoC = $("wizActionIco");
    if (icoC) icoC.classList.remove("done");
    $("wizard").hidden = true;
    $("wizBack").style.visibility = "visible";
    $("wizBody").hidden = false;
    $("wizDoneView").hidden = true;
    $("wizFoot").hidden = false;
    wizTasks = []; wizIndex = 0; wizEmpty = false;
    renderTasks();   // 中途退出后，首页「今日任务」实时反映已配置参数与完成状态
  }

  /* ============================================================
     云端与组队（v5.0.0）
     ------------------------------------------------------------
     定位：登录与组队是**叠加能力**，不是前置条件。
           未配置 / 未联网 / 请求失败时，本地打卡完全不受影响 —— 这是硬约束。
     ------------------------------------------------------------
     口径（已与用户确认）：
       · 登录：匿名设备账号起步，可绑定邮箱升级为正式账号；
       · 组队：组队房间（6 位邀请码拉人）；
       · 粒度：只同步「摘要」——今天是否打卡 / 完成项数 / 估算消耗。
               动作明细（每组重量次数）永不上云。
     ============================================================ */
  var ROOM_EMOJI = "💪";
  var SYNC_DEBOUNCE = 1200;
  var CLOUD_ON = !!(CLOUD && SOCIAL && CLOUD_CFG && CLOUD_CFG.envId);
  if (CLOUD_ON) {
    try { CLOUD.configure({ envId: CLOUD_CFG.envId, accessKey: CLOUD_CFG.accessKey }); }
    catch (e) { CLOUD_ON = false; }
  }
  var cloud = {
    ready: false,     // 是否已拿到可用会话
    user: null,       // { id, email, is_anonymous }
    room: null,       // { id, code, name, goal_kind, goal_value }
    members: [],      // 房间成员（含 profiles 昵称/连胜）
    summaries: [],    // 房间区间内的 day_summaries 摘要行
    board: [],        // memberBoard() 结果（成员看板）
    error: "",
    syncing: false,
    lastSync: ""
  };
  var syncTimer = null;
  var pendingDays = {};
  var profileSig = "";

  function cloudOn() { return !!(CLOUD_ON && CLOUD && CLOUD.isConfigured()); }
  function isCloudReady() { return cloudOn() && cloud.ready && !!cloud.user; }
  /* 唯一约束冲突（23505）：多半是「已经在里面了」，不算真失败。
     ⚠️ CloudBase 把外键违规（23503）也包成 HTTP 409，所以不能只看状态码，
        必须先排除外键，否则会把「资料没建好」误判成「重复」而悄悄吞掉。 */
  function isDupErr(e) {
    if (!e) return false;
    var c = String(e.code || "");
    var m = String(e.message || "");
    if (/23503|foreign key/i.test(c + " " + m)) return false;
    if (/23505|duplicate|unique/i.test(c + " " + m)) return true;
    return e.status === 409;
  }
  function cloudErr(e) {
    var msg = (e && e.message) ? e.message : "网络异常";
    var st = e && (e.status || e.statusCode);
    var code = String((e && (e.code || e.error_code)) || "");
    if (st === 403) {
      return "403 来源被拒绝：请到云开发控制台 → 环境配置 → 安全来源，把本站域名加入安全域名";
    }
    /* 浏览器跨域被网关拦下时，fetch 只会抛 TypeError（Failed to fetch / Load failed），
       拿不到状态码——按同一原因（安全来源白名单）给出可操作提示 */
    if (/failed to fetch|load failed|networkerror|network request failed|blocked by cors/i.test(msg)) {
      return "跨域请求被拒绝：请把本站域名加进云开发控制台 → 环境配置 → 安全来源的安全域名（约 1-2 分钟生效）";
    }
    /* CloudBase 把 PostgreSQL 的 SQLSTATE 包成 DATABASE_xxxxx，这里翻成中文可操作提示 */
    if (/42501/.test(code) || /row-level security/i.test(msg)) {
      return "数据库拒绝了该操作（RLS）：请在云开发控制台重跑一次建表脚本 cloudbase/schema.sql";
    }
    if (/23503/.test(code) || /foreign key/i.test(msg)) {
      return "云端资料还没建好：请回到首页下拉刷新，看到「已同步」后再试";
    }
    if (/23505/.test(code) || /duplicate key/i.test(msg)) {
      return "已经加入过了，刷新页面即可";
    }
    if (/42703|42P01|PGRST/.test(code)) {
      return "云端表结构不完整：请在云开发控制台重跑一次 cloudbase/schema.sql";
    }
    return msg;
  }
  function stamp() {
    var d = new Date();
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }
  function myNickname() { return getUsername() || "我"; }

  /* ---------- 上报：资料 + 每日摘要 ---------- */
  /* 昵称/连胜变化才上报，避免每次打卡都多打一次请求 */
  function pushProfile(force) {
    if (!isCloudReady()) return Promise.resolve();
    var s = computeStreaks();
    var sig = myNickname() + "|" + s.current + "|" + s.total;
    if (!force && sig === profileSig) return Promise.resolve();
    var row = SOCIAL.profileRow(cloud.user.id, myNickname(), ROOM_EMOJI, s);
    row.updated_at = new Date().toISOString();
    return CLOUD.upsert("profiles", [row], "id").then(function () { profileSig = sig; });
  }
  function pushSummary(day) {
    if (!isCloudReady()) return Promise.resolve();
    var row = SOCIAL.summaryRow(cloud.user.id, day, deriveDay(day), dayCalorie(day));
    row.updated_at = new Date().toISOString();
    return CLOUD.upsert("day_summaries", [row], "user_id,day");
  }
  /* 首次连接时回推最近 n 天：只回推「有任务或有记录」的日期，
     避免把空白日刷成 checked=false 反而污染队友看到的统计。 */
  function pushRecent(n) {
    if (!isCloudReady()) return Promise.resolve();
    var today = todayKey();
    var keys = {};
    Object.keys(data.records || {}).forEach(function (k) { keys[k] = 1; });
    Object.keys(data.tasks || {}).forEach(function (k) { keys[k] = 1; });
    var rows = Object.keys(keys)
      .filter(function (k) { var d = SOCIAL.daysBetween(k, today); return d >= 0 && d <= n; })
      .sort()
      .map(function (k) {
        var row = SOCIAL.summaryRow(cloud.user.id, k, deriveDay(k), dayCalorie(k));
        row.updated_at = new Date().toISOString();
        return row;
      });
    if (!rows.length) return Promise.resolve();
    return CLOUD.upsert("day_summaries", rows, "user_id,day");
  }
  /* 打卡/改动作后由 save() 触发：防抖合并，避免连续操作打出一串请求 */
  function queueSync() {
    if (!cloud || !cloud.ready) return;
    pendingDays[todayKey()] = 1;
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(function () { syncTimer = null; flushSync(); }, SYNC_DEBOUNCE);
  }
  function flushSync() {
    var days = Object.keys(pendingDays);
    pendingDays = {};
    if (!days.length || !isCloudReady()) return Promise.resolve();
    return Promise.all(days.map(pushSummary))
      .then(function () { return pushProfile(); })
      .then(function () {
        cloud.lastSync = stamp();
        if (isRoomTab()) return loadRoomData().then(renderRoom);
        renderRoomAccount();
      })
      .catch(function (e) { cloud.error = cloudErr(e); renderRoomAccount(); });
  }

  /* ---------- 房间：拉取 ---------- */
  function loadRoom() {
    if (!isCloudReady()) return Promise.resolve(null);
    return CLOUD.select("room_members", {
      select: "room_id,joined_at,rooms(id,code,name,goal_kind,goal_value)",
      user_id: "eq." + cloud.user.id,
      order: "joined_at.desc",
      limit: 1
    }).then(function (rows) {
      var r = (rows && rows[0] && rows[0].rooms) ? rows[0].rooms : null;
      cloud.room = r;
      return r;
    });
  }
  function loadRoomData() {
    if (!isCloudReady() || !cloud.room) {
      cloud.members = []; cloud.summaries = []; cloud.board = [];
      return Promise.resolve();
    }
    var today = todayKey();
    var from = SOCIAL.monthStart(today);
    var w = SOCIAL.weekStart(today);
    var start = (from < w) ? from : w;
    return CLOUD.select("room_members", {
      select: "user_id,joined_at,profiles(nickname,emoji,streak,total_days)",
      room_id: "eq." + cloud.room.id
    }).then(function (rows) {
      cloud.members = (rows || []).map(function (m) {
        var p = m.profiles || {};
        return { user_id: m.user_id, nickname: p.nickname, emoji: p.emoji, streak: p.streak, total_days: p.total_days };
      });
      var ids = cloud.members.map(function (m) { return m.user_id; });
      if (!ids.length) return [];
      return CLOUD.select("day_summaries", {
        select: "user_id,day,checked,done_count,total,kcal",
        user_id: ids,
        day: "gte." + start,
        order: "day.desc"
      });
    }).then(function (rows) {
      cloud.summaries = rows || [];
      cloud.board = SOCIAL.memberBoard(cloud.members, weekRowsOf(), today);
    });
  }
  function monthRowsOf() { var f = SOCIAL.monthStart(todayKey()); return cloud.summaries.filter(function (r) { return r.day >= f; }); }
  function weekRowsOf() { var f = SOCIAL.weekStart(todayKey()); return cloud.summaries.filter(function (r) { return r.day >= f; }); }
  function roomView() {
    var r = cloud.room || {};
    var goal = SOCIAL.GOAL_KINDS[r.goal_kind] || SOCIAL.GOAL_KINDS.days;
    var prog = SOCIAL.progress(monthRowsOf(), r.goal_value);
    var board = SOCIAL.memberBoard(cloud.members, weekRowsOf(), todayKey());
    return { goal: goal, prog: prog, board: board, ov: SOCIAL.roomOverview(board) };
  }

  /* ---------- 启动：建会话 → 建资料 → 拉房间 → 回推历史 ---------- */
  function cloudInit() {
    if (!cloudOn()) { renderRoom(); return Promise.resolve(false); }
    cloud.error = "";
    cloud.syncing = true;
    renderRoom();
    return CLOUD.ensureSession().then(function (s) {
      cloud.user = s.user;
      cloud.ready = true;
      return pushProfile(true);
    }).then(loadRoom)
      .then(loadRoomData)
      .then(function () { return pushRecent(30); })
      .then(function () {
        cloud.syncing = false; cloud.lastSync = stamp();
        renderRoom();
        return true;
      })
      .catch(function (e) {
        cloud.syncing = false;
        cloud.error = cloudErr(e);
        renderRoom();
        return false;
      });
  }
  function manualSync() {
    if (!cloudOn()) { toast("未配置云端"); return; }
    if (cloud.syncing) return;
    cloudInit().then(function (ok) { toast(ok ? "已同步" : ("同步失败：" + cloud.error)); });
  }

  /* ---------- 房间：创建 / 加入 / 退出 ---------- */
  function insertRoomWithCode(name, goal, attempt) {
    var code = SOCIAL.genRoomCode();
    return CLOUD.insert("rooms", [{
      code: code, name: name, owner: cloud.user.id, goal_kind: "days", goal_value: goal
    }]).catch(function (e) {
      /* 邀请码唯一约束冲突（极低概率）→ 换一个再试 */
      if (attempt < 3 && e && (e.status === 409 || e.code === "23505")) return insertRoomWithCode(name, goal, attempt + 1);
      throw e;
    });
  }
  function createRoom(name, goalValue) {
    if (!isCloudReady()) { toast("正在连接云端，请稍候"); return Promise.resolve(false); }
    var goal = Math.max(1, parseInt(goalValue, 10) || 30);
    /* 先补资料：rooms.owner 有指向 profiles(id) 的外键，
       资料缺失时建房会直接报 23503。force=true 强制补一次，成本一次请求。 */
    return pushProfile(true).then(function () {
      return insertRoomWithCode(name, goal, 0);
    }).then(function (rows) {
      var room = rows && rows[0];
      if (!room) throw new Error("创建房间失败");
      /* 建房触发器 rooms_autoadd_owner 已经把房主写进成员表，
         这里再插一次是给「没建触发器」的库兜底；撞主键说明已在房内，忽略即可。
         ⚠️ 不能改用 upsert：成员表刻意不开 UPDATE 策略，merge-duplicates 会被 RLS 拒。 */
      return CLOUD.insert("room_members", [{ room_id: room.id, user_id: cloud.user.id }])
        .catch(function (e) { if (!isDupErr(e)) throw e; return []; })
        .then(function () { return pushSummary(todayKey()); })
        .then(function () { cloud.room = room; return loadRoomData(); })
        .then(function () {
          renderRoom();
          toast("房间已创建，邀请码 " + room.code);
          return true;
        });
    }).catch(function (e) {
      cloud.error = cloudErr(e); renderRoom(); toast("创建失败：" + cloudErr(e)); return false;
    });
  }
  function joinRoom(code) {
    if (!isCloudReady()) { toast("正在连接云端，请稍候"); return Promise.resolve(false); }
    var c = SOCIAL.normalizeCode(code);
    if (!SOCIAL.isValidCode(c)) { toast("邀请码是 6 位字母或数字"); return Promise.resolve(false); }
    /* 同上：room_members.user_id 也有指向 profiles(id) 的外键，先确保资料存在 */
    return pushProfile(true)
      .then(function () { return CLOUD.rpc("join_room_by_code", { p_code: c }); })
      .then(function (rows) {
        var room = rows && rows[0];
        if (!room) throw new Error("房间不存在");
        cloud.room = room;
        return pushSummary(todayKey())
          .then(loadRoomData)
          .then(function () { renderRoom(); toast("已加入 " + room.name); return true; });
      })
      .catch(function (e) {
        toast("加入失败：" + cloudErr(e)); return false;
      });
  }
  function leaveRoom() {
    if (!isCloudReady() || !cloud.room) return Promise.resolve(false);
    if (!confirm("退出房间？退出后队友将看不到你的打卡摘要。")) return Promise.resolve(false);
    var rid = cloud.room.id;
    return CLOUD.remove("room_members", { room_id: "eq." + rid, user_id: "eq." + cloud.user.id })
      .then(function () {
        cloud.room = null; cloud.members = []; cloud.summaries = []; cloud.board = [];
        renderRoom(); toast("已退出房间"); return true;
      })
      .catch(function (e) { toast("退出失败：" + cloudErr(e)); return false; });
  }

  /* ---------- 组队看板自动刷新（轮询） ----------
     CloudBase 的 PG 模式没有 Realtime 订阅，队友加入 / 打卡不会推送过来，
     所以只能定时拉。要点：
       · 只在「已进房 + 页面可见」时跑，后台标签页不空转；
       · 数据没变化就不重绘 —— 重绘会重建 DOM，正在输入的内容会被清掉；
       · 失败完全静默，不打断用户（下次轮询自然会恢复）。 */
  var ROOM_POLL_MS = 20000;
  var roomPollTimer = null;
  var roomSigCache = "";
  function roomSignature() {
    var m = (cloud.members || []).map(function (x) {
      return x.user_id + ":" + (x.nickname || "") + ":" + (x.emoji || "") + ":" + (x.streak || 0);
    }).join("|");
    var s = (cloud.summaries || []).map(function (r) {
      return r.user_id + ":" + r.day + ":" + (r.checked ? 1 : 0) + ":" + (r.done_count || 0) + ":" + (r.kcal || 0);
    }).join("|");
    return m + "#" + s;
  }
  function pollRoom() {
    if (!isCloudReady() || !cloud.room) return Promise.resolve(false);
    if (typeof document !== "undefined" && document.hidden) return Promise.resolve(false);
    if (cloud.syncing) return Promise.resolve(false);           // 正在上报，别并发
    var before = roomSignature();
    var prevCount = (cloud.members || []).length;
    return loadRoomData().then(function () {
      var after = roomSignature();
      if (after === before) return false;
      renderRoom();
      var now = (cloud.members || []).length;
      if (now > prevCount) toast("有队友加入了房间 👋");
      return true;
    }).catch(function () { return false; });
  }
  function startRoomPolling() {
    if (roomPollTimer) return;
    roomPollTimer = setInterval(function () { pollRoom(); }, ROOM_POLL_MS);
  }
  function stopRoomPolling() {
    if (!roomPollTimer) return;
    clearInterval(roomPollTimer);
    roomPollTimer = null;
  }

  /* ---------- 渲染：账号卡 ---------- */
  function isRoomTab() { var p = $("panel-room"); return !!(p && p.classList.contains("active")); }
  function isTodayTab() { var p = $("panel-today"); return !!(p && p.classList.contains("active")); }
  function renderRoom() {
    /* 有房间就开轮询（退房 / 登出 / 降级后自动停），重复调用是安全的 */
    if (isCloudReady() && cloud.room) startRoomPolling(); else stopRoomPolling();
    renderRoomAccount(); renderRoomBody(); renderHeaderAccount(); if (isTodayTab()) renderTodayMates();
  }

  /* 首页右上角账号入口 */
  function renderHeaderAccount() {
    var btn = $("headerAccountBtn"); if (!btn) return;
    if (isCloudReady() && cloud.user) {
      btn.textContent = ROOM_EMOJI;
      btn.title = cloud.user.is_anonymous
        ? "设备账号 · 点击绑定邮箱"
        : ("账号：" + (cloud.user.email || ""));
    } else {
      btn.textContent = "👤";
      btn.title = cloudOn() ? "正在连接云端…" : "账号 / 登录";
    }
  }

  /* 首页队友今日打卡区 */
  function renderTodayMates() {
    var box = $("todayMates"); if (!box) return;
    if (!isCloudReady() || !cloud.room) { box.hidden = true; box.innerHTML = ""; return; }
    var today = todayKey(), me = cloud.user.id;
    var board = SOCIAL.memberBoard(cloud.members, weekRowsOf(), today);
    if (!board.length) { box.hidden = true; box.innerHTML = ""; return; }
    var done = board.filter(function (m) { return m.todayChecked; }).length;
    var h = '<div class="tm-card" id="tmCard">' +
      '<div class="tm-head">' +
        '<div class="tm-title">' + escapeHtml(cloud.room.name || "我的房间") + '</div>' +
        '<div class="tm-count">今日 ' + done + '/' + board.length + ' 已打卡</div>' +
      '</div>' +
      '<div class="tm-list">';
    board.forEach(function (m) {
      h += '<div class="tm-item">' +
        '<div class="tm-avatar' + (m.todayChecked ? ' done' : '') + '">' + (m.emoji || ROOM_EMOJI) + '</div>' +
        '<div class="tm-name">' + escapeHtml((m.id === me ? "我" : m.nickname) || "队友") + '</div>' +
      '</div>';
    });
    h += '</div>';
    h += '<div class="tm-foot">' + (done === board.length ? "全员已打卡 🎉" : "点击展开完整看板") + '</div>';
    h += '</div>';
    box.innerHTML = h; box.hidden = false;
    var card = $("tmCard"); if (card) card.addEventListener("click", function () { showTab("room"); });
  }

  function renderRoomAccount() {
    var box = $("roomAccount");
    if (!box) return;
    if (!cloudOn()) {
      box.innerHTML =
        '<div class="ra-row">' +
          '<div class="ra-avatar">📴</div>' +
          '<div class="ra-main"><div class="ra-name">纯本地模式</div>' +
          '<div class="ra-sub">打卡数据只保存在这台设备上</div></div>' +
          '<span class="ra-tag">未配置云端</span>' +
        '</div>';
      return;
    }
    var sub, tag = "", cls = "ra-tag";
    if (cloud.error) { sub = "连接失败：" + cloud.error; tag = "离线"; cls = "ra-tag warn"; }
    else if (!cloud.ready) { sub = "正在连接云端…"; tag = "连接中"; }
    else if (cloud.user && cloud.user.is_anonymous) {
      sub = "设备账号（未绑定）· 换设备或清缓存会丢失";
      tag = cloud.lastSync ? ("已同步 " + cloud.lastSync) : "已连接"; cls = "ra-tag on";
    } else {
      sub = (cloud.user && cloud.user.email) || "已绑定邮箱";
      tag = cloud.lastSync ? ("已同步 " + cloud.lastSync) : "已连接"; cls = "ra-tag on";
    }
    var bound = cloud.user && !cloud.user.is_anonymous;
    box.innerHTML =
      '<div class="ra-row">' +
        '<div class="ra-avatar">' + ROOM_EMOJI + '</div>' +
        '<div class="ra-main">' +
          '<div class="ra-name">' + escapeHtml(myNickname()) + '</div>' +
          '<div class="ra-sub">' + escapeHtml(sub) + '</div>' +
        '</div>' +
        '<span class="' + cls + '">' + escapeHtml(tag) + '</span>' +
      '</div>' +
      '<div class="ra-actions">' +
        '<button class="btn-ghost" id="raAccountBtn">' + (bound ? "账号" : "绑定邮箱") + '</button>' +
        '<button class="btn-ghost" id="raSyncBtn">立即同步</button>' +
      '</div>';
    var a = $("raAccountBtn"); if (a) a.addEventListener("click", openAccount);
    var b = $("raSyncBtn"); if (b) b.addEventListener("click", manualSync);
  }

  /* ---------- 渲染：房间主体（未配置 / 未加入 / 已加入 三态） ---------- */
  function renderRoomBody() {
    var box = $("roomBody");
    if (!box) return;
    if (!cloudOn()) { box.innerHTML = roomNotConfiguredHtml(); return; }
    if (!cloud.ready) {
      box.innerHTML =
        '<div class="room-card"><div class="room-empty">' +
          '<div class="room-empty-ico">☁️</div>' +
          '<div class="room-empty-title">正在连接云端</div>' +
          '<div class="room-empty-sub">' + escapeHtml(cloud.error || "首次连接会自动创建你的设备账号，不会打断本地打卡。") + '</div>' +
          '<button class="room-btn ghost" id="roomRetryBtn" style="margin-top:16px">重试</button>' +
        '</div></div>';
      var rb = $("roomRetryBtn"); if (rb) rb.addEventListener("click", manualSync);
      return;
    }
    if (!cloud.room) { box.innerHTML = roomNoRoomHtml(); bindNoRoom(); return; }
    box.innerHTML = roomBoardHtml(); bindRoomBoard();
  }

  function roomNotConfiguredHtml() {
    return '<div class="room-card">' +
      '<div class="room-empty">' +
        '<div class="room-empty-ico">🤝</div>' +
        '<div class="room-empty-title">组队需要先接上云端</div>' +
        '<div class="room-empty-sub">不接也能用 —— 打卡数据一直保存在本机。<br>接上之后，「登录 + 共同打卡」才可能实现。</div>' +
      '</div>' +
      '<ol class="room-steps">' +
        '<li>到 tcb.cloud.tencent.com 登录（需个人实名），新建一个 <code>PostgreSQL</code> 环境的免费体验版</li>' +
        '<li>在「环境概览」复制 <code>环境 ID</code></li>' +
        '<li>把环境 ID 填进 <code>js/cloud-config.js</code></li>' +
        '<li>数据库 → SQL 编辑器，执行一次 <code>cloudbase/schema.sql</code></li>' +
        '<li>身份认证 → 登录方式：打开 <code>匿名登录</code> 与 <code>邮箱验证码</code></li>' +
        '<li>身份认证 → 开发设置：把本页域名加入 <code>安全来源</code> 白名单</li>' +
      '</ol>' +
      '<div class="room-card-sub" style="margin-top:12px">完成后刷新页面，这里会自动创建你的设备账号。</div>' +
    '</div>';
  }

  function roomNoRoomHtml() {
    return '<div class="room-card">' +
      '<div class="room-empty">' +
        '<div class="room-empty-ico">👥</div>' +
        '<div class="room-empty-title">还没有加入任何房间</div>' +
        '<div class="room-empty-sub">房间是一个小圈子：3–5 个熟人一起练，看得到彼此今天有没有打卡。</div>' +
      '</div>' +
    '</div>' +
    '<div class="room-card">' +
      '<div class="room-card-title">创建一个房间</div>' +
      '<div class="room-card-sub">建好后把邀请码发给朋友，他们输入即可加入。</div>' +
      '<div class="room-field"><label>房间名称</label>' +
        '<input class="room-input" id="roomNameInput" maxlength="16" placeholder="例如：晨练小分队" /></div>' +
      '<div class="room-field"><label>集体目标（本月全队累计打卡天数）</label>' +
        '<input class="room-input" id="roomGoalInput" type="number" inputmode="numeric" min="1" max="999" value="30" /></div>' +
      '<button class="room-btn" id="roomCreateBtn">创建房间</button>' +
    '</div>' +
    '<div class="room-card">' +
      '<div class="room-card-title">用邀请码加入</div>' +
      '<div class="room-card-sub">6 位字母数字，不含容易看错的 I / O / 0 / 1。</div>' +
      '<div class="room-field"><label>邀请码</label>' +
        '<input class="room-input code" id="roomCodeInput" maxlength="6" placeholder="ABC123" /></div>' +
      '<button class="room-btn" id="roomJoinBtn">加入房间</button>' +
    '</div>';
  }
  function bindNoRoom() {
    var c = $("roomCreateBtn");
    if (c) c.addEventListener("click", function () {
      var name = ($("roomNameInput").value || "").trim();
      if (!name) { toast("给房间起个名字"); return; }
      createRoom(name, $("roomGoalInput").value);
    });
    var j = $("roomJoinBtn");
    if (j) j.addEventListener("click", function () {
      var code = ($("roomCodeInput").value || "").trim();
      if (!code) { toast("请输入邀请码"); return; }
      joinRoom(code);
    });
  }

  function roomBoardHtml() {
    var v = roomView();
    var today = todayKey();
    var me = cloud.user ? cloud.user.id : null;
    var h = '<div class="room-hero">';
    h += '<div class="rh-top"><div>' +
      '<div class="rh-name">' + escapeHtml(cloud.room.name || "我的房间") + '</div>' +
      '<div class="rh-goal">集体目标：全队本月' + escapeHtml(v.goal.name) + ' ' + v.prog.target + ' ' + escapeHtml(v.goal.unit) + '</div>' +
      '</div><span class="ra-tag on">今日 ' + v.ov.done + '/' + v.ov.total + ' 已打卡</span></div>';
    h += '<div class="rh-code"><span class="rh-code-label">邀请码</span>' +
      '<span class="rh-code-val">' + escapeHtml(cloud.room.code || "") + '</span>' +
      '<button class="rh-copy" id="roomCopyBtn">复制</button></div>';
    h += '<div class="rh-progress"><div class="rhp-top"><span>本月全队进度</span>' +
      '<span><b class="rhp-num">' + v.prog.done + '</b> / ' + v.prog.target + ' ' + escapeHtml(v.goal.unit) + '</span></div>' +
      '<div class="rhp-bar"><div class="rhp-fill" id="roomProgFill"></div></div></div>';
    h += '</div>';

    h += '<div class="room-card"><div class="room-card-title">成员看板</div>' +
      '<div class="room-card-sub" style="margin-bottom:6px">' + escapeHtml(today) + ' · 按今日状态与连续天数排序</div>';
    if (!v.board.length) h += '<div class="room-card-sub">还没有成员。</div>';
    v.board.forEach(function (m) {
      h += '<div class="room-member">' +
        '<div class="rm-avatar' + (m.todayChecked ? ' done' : '') + '">' + m.emoji + '</div>' +
        '<div class="rm-main"><div class="rm-name">' + escapeHtml(m.nickname) +
          (m.id === me ? '<span class="me">我</span>' : '') + '</div>' +
        '<div class="rm-meta">连续 ' + m.streak + ' 天 · 累计 ' + m.totalDays + ' 天 · 本周 ' + m.weekKcal + ' 千卡</div></div>' +
        '<div class="rm-right"><div class="rm-state' + (m.todayChecked ? ' done' : '') + '">' +
          (m.todayChecked ? '已打卡 ✓' : '未打卡') + '</div>' +
        '<div class="rm-kcal">今日 ' + m.todayKcal + ' 千卡</div></div>' +
      '</div>';
    });
    h += '</div>';

    h += '<div class="ra-actions" style="margin-top:14px">' +
      '<button class="btn-ghost" id="roomRefreshBtn">刷新看板</button>' +
      '<button class="btn-ghost danger" id="roomLeaveBtn">退出房间</button></div>';
    h += '<div class="room-sync">只同步「今天是否打卡 · 完成项数 · 估算消耗」这类摘要；<br>每个动作的重量和次数始终留在你自己的手机里。</div>';
    return h;
  }
  function bindRoomBoard() {
    var v = roomView();
    var fill = $("roomProgFill");
    if (fill) fill.style.width = v.prog.pct + "%";
    var cp = $("roomCopyBtn");
    if (cp) cp.addEventListener("click", function () {
      var code = (cloud.room && cloud.room.code) || "";
      var done = function () { toast("邀请码已复制"); };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(code).then(done, function () { toast("邀请码：" + code); });
        } else { toast("邀请码：" + code); }
      } catch (e) { toast("邀请码：" + code); }
    });
    var rf = $("roomRefreshBtn");
    if (rf) rf.addEventListener("click", function () {
      if (!isCloudReady()) { manualSync(); return; }
      loadRoomData().then(function () { renderRoom(); toast("已刷新"); })
        .catch(function (e) { toast("刷新失败：" + cloudErr(e)); });
    });
    var lv = $("roomLeaveBtn");
    if (lv) lv.addEventListener("click", leaveRoom);
  }

  /* ---------- 账号：绑定邮箱（匿名 → 正式） ---------- */
  var accountFlow = { email: "", mode: "bind" };
  function openAccount() {
    var o = $("accountOverlay"); if (!o) return;
    $("accountCode").value = "";
    $("accountCodeField").hidden = true;
    $("accountVerifyBtn").hidden = true;
    $("accountVerifyBtn").disabled = false;
    $("accountVerifyBtn").textContent = "确认";
    if (!cloudOn()) {
      $("accountTitle").textContent = "账号";
      $("accountSub").textContent = "当前为纯本地模式。要使用登录与组队功能，请先在「组队」页按指引接入云端。";
      $("accountEmail").value = "";
      $("accountSendBtn").hidden = true;
      o.hidden = false;
      return;
    }
    var bound = cloud.user && !cloud.user.is_anonymous;
    $("accountTitle").textContent = bound ? "账号" : "绑定邮箱";
    $("accountSub").textContent = bound
      ? ("已绑定：" + ((cloud.user && cloud.user.email) || "") + "。换设备时用同一个邮箱即可找回数据。")
      : "现在是设备账号：数据绑在这台设备上，换设备或清浏览器缓存就会丢。绑定邮箱后，在其他设备用同一邮箱登录即可看到你的记录。";
    $("accountEmail").value = (cloud.user && cloud.user.email) || "";
    $("accountSendBtn").hidden = false;
    $("accountSendBtn").disabled = false;
    $("accountSendBtn").textContent = "发送验证码";
    o.hidden = false;
  }
  function closeAccount() { var o = $("accountOverlay"); if (o) o.hidden = true; }
  function sendAccountCode() {
    if (!cloudOn()) { toast("未配置云端"); return; }
    var email = ($("accountEmail").value || "").trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast("请输入有效的邮箱"); return; }
    accountFlow.email = email;
    var hasSession = !!(cloud.user && cloud.user.id);
    accountFlow.mode = hasSession ? "bind" : "login";
    var btn = $("accountSendBtn");
    btn.disabled = true; btn.textContent = "发送中…";
    var p = hasSession ? CLOUD.updateUserEmail(email) : CLOUD.sendEmailOtp(email);
    p.then(function () {
      btn.disabled = false; btn.textContent = "重新发送";
      /* 后台开启 autoconfirm 时邮箱即刻生效，不用再输验证码 */
      var s = CLOUD.getSession();
      if (s && s.user && s.user.email && !s.user.is_anonymous) {
        cloud.user = s.user; closeAccount(); renderRoom(); toast("邮箱已绑定"); return;
      }
      $("accountCodeField").hidden = false;
      $("accountSendBtn").hidden = true;
      $("accountVerifyBtn").hidden = false;
      toast("验证码已发送，请查收邮件");
    }).catch(function (e) {
      btn.disabled = false; btn.textContent = "发送验证码";
      toast(cloudErr(e));
    });
  }
  function verifyAccountCode() {
    var code = ($("accountCode").value || "").trim();
    if (!code) { toast("请输入验证码"); return; }
    var type = (accountFlow.mode === "login") ? "email" : "email_change";
    var btn = $("accountVerifyBtn");
    btn.disabled = true; btn.textContent = "验证中…";
    CLOUD.verifyEmailCode(accountFlow.email, code, type).then(function (s) {
      btn.disabled = false; btn.textContent = "确认";
      cloud.user = s.user; cloud.ready = true;
      closeAccount();
      toast("绑定成功，账号已升级为正式账号");
      return cloudInit();
    }).catch(function (e) {
      btn.disabled = false; btn.textContent = "确认";
      toast(cloudErr(e));
    });
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
    /* 时长变化时实时刷新「预计消耗」估算 */
    $("inpDuration").addEventListener("input", updateCalEstimate);
    $("btnFinish").addEventListener("click", finishSheet);
    $("btnUndo").addEventListener("click", undoToday);
    $("exportBtn").addEventListener("click", exportData);
    $("importBtn").addEventListener("click", function () { $("importFile").click(); });
    $("importFile").addEventListener("change", function (e) {
      var f = e.target.files && e.target.files[0];
      importData(f);
      e.target.value = "";   // 清空以便重复导入同一个文件
    });
    $("resetBtn").addEventListener("click", function () {
      if (confirm("确定清空所有打卡数据？此操作不可恢复。")) {
        data = blankData(); ensurePlan(true); save(); refreshAll(); renderSceneSwitch(); renderGenderToggle(); toast("已清空");
      }
    });
    /* 动作库添加 */
    $("addExerciseBtn").addEventListener("click", openAddLib);
    $("addTodayExBtn").addEventListener("click", function () { openSheet(todayKey()); });
    $("addLibClose").addEventListener("click", closeAddLib);
    $("addLibOverlay").addEventListener("click", function (e) { if (e.target === $("addLibOverlay")) closeAddLib(); });
    $("libCustomBtn").addEventListener("click", function () {
      if (!$("libCustom").value.trim()) { toast("请输入自定义动作"); return; }
      addTask($("libCustom").value);
      $("libCustom").value = "";
    });
    $("libCustom").addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        if (!$("libCustom").value.trim()) { toast("请输入自定义动作"); return; }
        addTask($("libCustom").value);
        $("libCustom").value = "";
      }
    });
    $("libParts").addEventListener("click", function (e) {
      var t = e.target.closest ? e.target.closest(".lib-part") : null;
      if (!t) return;
      var pid = t.getAttribute("data-pid");
      if (!pid) return;
      var scene = data.scene || "home";
      var ids = PARTS.filter(function (p) { return exLibByPart(p.id, scene).length; }).map(function (p) { return p.id; });
      libPartIdx = ids.indexOf(pid);
      if (libPartIdx < 0) libPartIdx = 0;
      renderLibParts();
      renderLibList();
    });
    $("taskList").addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("button") : null;
      if (!btn) return;
      var id = btn.getAttribute("data-id");
      if (btn.classList.contains("task-del")) deleteTask(id);
      else if (btn.classList.contains("task-replace")) openReplace(id);
    });
    $("taskCurrent").addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("button") : null;
      if (!btn) return;
      var id = btn.getAttribute("data-id");
      if (btn.classList.contains("tc-replace")) openReplace(id);
      else if (btn.classList.contains("tc-del")) deleteTask(id);
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
    /* 「今日任务」标题右侧的小「载入」按钮：载入今日推荐训练 */
    var taskLoadBtn = $("taskLoadBtn");
    if (taskLoadBtn) taskLoadBtn.addEventListener("click", loadRecommend);
    /* 场景切换（居家 / 健身房） */
    var sceneBox = $("sceneSwitch");
    if (sceneBox) {
      sceneBox.addEventListener("click", function (e) {
        var btn = e.target.closest ? e.target.closest(".scene-btn") : null;
        if (!btn) return;
        var sc = btn.getAttribute("data-scene");
        if (!sc || sc === data.scene) return;
        data.scene = sc;
        ensurePlan(true);           // 场景变化 → 重生成计划
        save();
        renderSceneSwitch();
        if ($("panel-plan").classList.contains("active")) renderPlan();
        toast("已切换到「" + SCENES[sc].name + "」");
      });
    }
    /* 身体数据（用户名/体重/身高/年龄/性别） */
    var nInput = $("inpName");
    if (nInput) {
      nInput.value = data.username || "";
      nInput.addEventListener("input", function () {
        data.username = nInput.value.trim();
        save();
        renderToday();   // 首页问候实时带上用户名
      });
    }
    /* 应用标题：实时同步到 header 顶部 */
    var tInput = $("inpAppTitle");
    if (tInput) {
      tInput.value = data.appTitle || "健身打卡";
      tInput.addEventListener("input", function () {
        data.appTitle = (tInput.value || "").trim() || "健身打卡";
        save();
        renderAppTitle();
      });
    }
    /* 点击 header 标题原位编辑：Enter/失焦确认，Esc 取消 */
    var hTitle = $("headerTitle");
    var hEdit = $("headerTitleEdit");
    if (hTitle && hEdit) {
      hTitle.addEventListener("click", startEditAppTitle);
      hEdit.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); commitAppTitleEdit(false); }
        else if (e.key === "Escape") { commitAppTitleEdit(true); }
      });
      hEdit.addEventListener("blur", function () { commitAppTitleEdit(false); });
    }
    var wInput = $("inpWeight");
    if (wInput) {
      wInput.value = getWeight();
      wInput.addEventListener("input", function () {
        var v = parseFloat(wInput.value);
        if (!isNaN(v) && v > 0) { data.weight = v; save(); refreshCalorieViews(); }
      });
    }
    var hInput = $("inpHeight");
    if (hInput) {
      hInput.value = getHeight();
      hInput.addEventListener("input", function () {
        var v = parseFloat(hInput.value);
        if (!isNaN(v) && v > 0) { data.height = v; save(); refreshCalorieViews(); }
      });
    }
    var aInput = $("inpAge");
    if (aInput) {
      aInput.value = data.age || 25;
      aInput.addEventListener("input", function () {
        var v = parseInt(aInput.value, 10);
        if (!isNaN(v) && v > 0) { data.age = v; save(); refreshCalorieViews(); }
      });
    }
    var gBox = $("genderToggle");
    if (gBox) {
      gBox.addEventListener("click", function (e) {
        var btn = e.target.closest ? e.target.closest("button") : null;
        if (!btn) return;
        data.gender = btn.getAttribute("data-gender") === "female" ? "female" : "male";
        save();
        renderGenderToggle();
        refreshCalorieViews();
      });
    }
    $("planList").addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("button") : null;
      if (btn && btn.classList.contains("plan-load")) loadPlanDay(btn.getAttribute("data-day"));
    });
    /* 默认信息弹窗 */
    $("profileSave").addEventListener("click", saveProfile);
    $("profileSkip").addEventListener("click", skipProfile);
    $("editProfileBtn").addEventListener("click", openProfile);
    /* 主题与壁纸 */
    $("themeBtn").addEventListener("click", openTheme);
    $("themeSave").addEventListener("click", closeTheme);
    $("themeOverlay").addEventListener("click", function (e) { if (e.target === $("themeOverlay")) closeTheme(); });
    $("wallpaperInput").addEventListener("change", function (e) {
      var f = e.target.files && e.target.files[0];
      e.target.value = "";   // 先清空，允许重复选同一文件
      if (!f) return;
      if (!/^image\//.test(f.type)) { toast("请选择图片文件"); return; }
      var reader = new FileReader();
      reader.onerror = function () { toast("图片读取失败，请换一张重试"); };
      reader.onload = function () {
        var res = reader.result;
        if (typeof res !== "string" || !/^data:/.test(res)) { toast("图片读取失败，请换一张重试"); return; }
        applyWallpaperFromDataUrl(res);
      };
      reader.readAsDataURL(f);
    });
    $("wallpaperClear").addEventListener("click", function () {
      var r = setWallpaper("");
      toast(r === "ok" ? "已恢复内置壁纸" : "操作失败，请重试");
    });
    $("profileGender").addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("button") : null;
      if (!btn) return;
      profileGenderSel = btn.getAttribute("data-gender") === "female" ? "female" : "male";
      $("profileGender").querySelectorAll("button").forEach(function (b) {
        b.classList.toggle("sel", b.getAttribute("data-gender") === profileGenderSel);
      });
    });
    window.addEventListener("resize", function () {
      if ($("panel-stats").classList.contains("active")) renderStats();
    });
    /* 回到前台（切回标签页 / 从后台唤醒）立刻拉一次看板：
       后台期间轮询是停的，回来时数据往往已经过期了 */
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) pollRoom();
    });
    /* 分步打卡向导 */
    $("wizDone").addEventListener("click", completeCurrent);
    $("wizNext").addEventListener("click", navigateNext);
    $("wizPrev").addEventListener("click", navigatePrev);
    $("wizBack").addEventListener("click", closeWizard); // 左上角返回：直接回到主页
    /* 计时器（仅 timed 动作显示）：点圆圈 = 开始/暂停/继续 */
    $("wizTimerRing").addEventListener("click", function () {
      // 用户点击圆圈是首次手势：激活 AudioContext（浏览器自动播放策略）
      try { var ac = getWizAudio(); if (ac && ac.state === "suspended") ac.resume(); } catch (e) {}
      toggleWizTimer();
    });
    $("wizTimerReset").addEventListener("click", resetWizTimer);
    /* 账号与邮箱绑定（组队页「绑定邮箱」触发；v5.0.0 重新引入登录能力） */
    $("accountSendBtn").addEventListener("click", sendAccountCode);
    $("accountVerifyBtn").addEventListener("click", verifyAccountCode);
    $("accountClose").addEventListener("click", closeAccount);
    $("accountOverlay").addEventListener("click", function (e) { if (e.target === $("accountOverlay")) closeAccount(); });
    $("accountEmail").addEventListener("keydown", function (e) { if (e.key === "Enter") sendAccountCode(); });
    $("accountCode").addEventListener("keydown", function (e) { if (e.key === "Enter") verifyAccountCode(); });
    /* 首页右上角账号入口 */
    var hab = $("headerAccountBtn");
    if (hab) hab.addEventListener("click", openAccount);
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
    ensurePlan(false);
    autoScheduleToday();
    renderAppTitle();             // header 顶部标题（用户可改）
    renderSceneSwitch();
    renderGenderToggle();
    applyTheme();     // 应用主题与壁纸
    renderToday();
    renderCalendar();
    try { $("appVersion").textContent = "v" + APP_VERSION; } catch (e) {}
    renderRoom();                 // 组队页首屏（未配置时显示指引，不影响其它功能）
    cloudInit();                  // 异步接上云端：失败只影响组队页，不阻塞打卡
    // 首次进入：弹出「默认信息」引导
    if (!data.profileDone) {
      setTimeout(function () { openProfile(); }, 260);
    }
  }

  /* 场景切换控件状态 */
  function renderSceneSwitch() {
    var box = $("sceneSwitch");
    if (!box) return;
    var scene = data.scene || "home";
    box.querySelectorAll(".scene-btn").forEach(function (b) {
      b.classList.toggle("sel", b.getAttribute("data-scene") === scene);
    });
  }
  /* 性别选择控件状态 */
  function renderGenderToggle() {
    var box = $("genderToggle");
    if (box) {
      var g = data.gender || "male";
      box.querySelectorAll("button").forEach(function (b) {
        b.classList.toggle("sel", b.getAttribute("data-gender") === g);
      });
    }
    var pbox = $("profileGender");
    if (pbox) {
      var pg = data.gender || "male";
      pbox.querySelectorAll("button").forEach(function (b) {
        b.classList.toggle("sel", b.getAttribute("data-gender") === pg);
      });
    }
  }

  /* ---------- 默认信息引导（首启填写性别/体重/身高/年龄） ---------- */
  var profileGenderSel = "male";
  function openProfile() {
    profileGenderSel = data.gender || "male";
    var n = $("profileName");
    if (n) n.value = data.username || "";
    var w = $("profileWeight"), h = $("profileHeight"), a = $("profileAge");
    if (w) w.value = (typeof data.weight === "number" && data.weight > 0) ? data.weight : "";
    if (h) h.value = (typeof data.height === "number" && data.height > 0) ? data.height : "";
    if (a) a.value = (typeof data.age === "number" && data.age > 0) ? data.age : "";
    var pbox = $("profileGender");
    if (pbox) {
      pbox.querySelectorAll("button").forEach(function (b) {
        b.classList.toggle("sel", b.getAttribute("data-gender") === profileGenderSel);
      });
    }
    $("profileOverlay").hidden = false;
  }
  function closeProfile() { $("profileOverlay").hidden = true; }
  function saveProfile() {
    var n = $("profileName") ? $("profileName").value.trim() : "";
    var w = parseFloat($("profileWeight").value);
    var h = parseFloat($("profileHeight").value);
    var a = parseInt($("profileAge").value, 10);
    data.username = n;
    if (!isNaN(w) && w > 0) data.weight = w;
    if (!isNaN(h) && h > 0) data.height = h;
    if (!isNaN(a) && a > 0) data.age = a;
    data.gender = profileGenderSel === "female" ? "female" : "male";
    data.profileDone = true;
    save();
    // 同步设置页输入框
    if ($("inpName")) $("inpName").value = data.username;
    if ($("inpWeight")) $("inpWeight").value = getWeight();
    if ($("inpHeight")) $("inpHeight").value = getHeight();
    if ($("inpAge")) $("inpAge").value = getAge();
    renderGenderToggle();
    refreshCalorieViews();
    renderToday();      // 刷新首页问候（带上用户名）
    closeProfile();
    toast(data.username ? (data.username + "，信息已保存") : "信息已保存");
  }
  function skipProfile() {
    data.profileDone = true;   // 标记已处理，避免每次打开都弹
    save();
    closeProfile();
  }

  /* ---------- 主题与壁纸 ---------- */
  var DEFAULT_WALLPAPER = "assets/wallpaper-snow.jpg";
  var DEFAULT_THEME = "snow";   // 默认主题「雪光柔白」
  var THEMES = [
    { key: "plain", name: "清爽蓝白", chip: "默认", sw: "linear-gradient(135deg,#2563EB,#EFF4FF)" },
    { key: "night", name: "宁静夜",   chip: "深蓝玻璃", sw: "linear-gradient(135deg,#16203a,#7AA2F7)" },
    { key: "snow",  name: "雪光柔白", chip: "明亮", sw: "linear-gradient(135deg,#EAF1FF,#3B6FD4)" },
    { key: "neon",  name: "暗夜霓虹", chip: "青蓝发光", sw: "linear-gradient(135deg,#0a1020,#22D3EE)" },
    { key: "warm",  name: "暖冬",     chip: "暖蓝紫", sw: "linear-gradient(135deg,#241a3e,#8B7CF6)" }
  ];
  function themeOf(key) { for (var i = 0; i < THEMES.length; i++) if (THEMES[i].key === key) return THEMES[i]; return null; }
  /* 把主题与壁纸应用到 <html> */
  function applyTheme() {
    var root = document.documentElement;
    var key = data.theme || DEFAULT_THEME;
    if (key && key !== "plain") root.setAttribute("data-theme", key);
    else root.removeAttribute("data-theme");
    // 自定义壁纸优先，否则内置
    var wp = data.wallpaper || DEFAULT_WALLPAPER;
    var url = 'url("' + wp + '")';
    root.style.setProperty("--wp-image", url);
    // 标记「用户自定义壁纸」→ theme.css 据此在任何主题（含 plain）下强制显示壁纸层
    if (data.wallpaper) root.setAttribute("data-wp", "custom");
    else root.removeAttribute("data-wp");
  }
  function setTheme(key) {
    data.theme = (key === "plain") ? "plain" : key;
    save();
    applyTheme();
    renderThemeGrid();
  }
  function renderThemeGrid() {
    var grid = $("themeGrid");
    if (!grid) return;
    grid.innerHTML = "";
    var cur = data.theme || DEFAULT_THEME;
    var wpUrl = data.wallpaper || DEFAULT_WALLPAPER;
    THEMES.forEach(function (t) {
      var item = document.createElement("div");
      item.className = "theme-item" + (t.key === cur ? " sel" : "");
      // 缩略图：不能用 style="…url("…")" 拼字符串——url() 里的双引号会提前截断 HTML
      // 属性，导致缩略图失效；必须走 CSSOM 赋值（对超长 dataURL 同样安全）。
      var sw = document.createElement("div");
      sw.className = "theme-swatch";
      if (t.key === "plain") {
        sw.style.background = t.sw;
      } else {
        sw.style.backgroundImage = 'linear-gradient(180deg, rgba(0,0,0,0.25), rgba(0,0,0,0.5)), url("' + wpUrl + '")';
      }
      var chip = document.createElement("span");
      chip.className = "sw-chip";
      chip.textContent = t.chip;
      sw.appendChild(chip);
      var label = document.createElement("div");
      label.className = "theme-label";
      label.textContent = t.name;
      item.appendChild(sw);
      item.appendChild(label);
      item.addEventListener("click", function () { setTheme(t.key); });
      grid.appendChild(item);
    });
  }
  function openTheme() { renderThemeGrid(); updateWallpaperUI(); $("themeOverlay").hidden = false; }
  function closeTheme() { $("themeOverlay").hidden = true; }
  function updateWallpaperUI() {
    var clearBtn = $("wallpaperClear");
    var nameEl = $("wallpaperName");
    if (data.wallpaper) {
      if (clearBtn) clearBtn.hidden = false;
      if (nameEl) nameEl.textContent = "已使用自定义壁纸";
    } else {
      if (clearBtn) clearBtn.hidden = true;
      if (nameEl) nameEl.textContent = "当前为内置壁纸（雪夜）";
    }
  }
  /* 设定/清除壁纸。返回 "ok" | "too-big"（超出 localStorage 上限，已回滚） */
  function setWallpaper(dataUrl) {
    var prev = data.wallpaper || "";
    data.wallpaper = dataUrl || "";
    var ok = true;
    try { save(); } catch (e) { ok = false; }
    if (!ok) {
      // 存不下就回滚：绝不留下「提示成功、其实没保存」的假象
      data.wallpaper = prev;
      applyTheme();
      renderThemeGrid();
      updateWallpaperUI();
      return "too-big";
    }
    applyTheme();
    renderThemeGrid();
    updateWallpaperUI();
    return "ok";
  }
  /* 压缩图片：限制最长边 maxSize，输出 JPEG dataURL（图片无法解码时回退原图） */
  /* 压缩图片：限制最长边 maxSize，输出 JPEG dataURL。
     任一步失败（解码失败 / 无 canvas / 画布输出无效）都回退为原图，绝不产出空 dataURL。 */
  function compressImage(dataUrl, maxSize, quality, cb) {
    var done = false;
    function finish(out) { if (done) return; done = true; cb(out || dataUrl); }
    function fallback() { finish(dataUrl); }
    try {
      var img = new Image();
      img.onload = function () {
        try {
          var w = img.naturalWidth || img.width;
          var h = img.naturalHeight || img.height;
          if (!w || !h) return fallback();
          var scale = Math.min(1, maxSize / Math.max(w, h));
          var cw = Math.max(1, Math.round(w * scale));
          var ch = Math.max(1, Math.round(h * scale));
          var cv = document.createElement("canvas");
          cv.width = cw; cv.height = ch;
          var ctx = cv.getContext && cv.getContext("2d");
          if (!ctx) return fallback();
          ctx.drawImage(img, 0, 0, cw, ch);
          var out = cv.toDataURL("image/jpeg", quality);
          /* 画布异常时会得到 "data:," 之类无效值 —— 必须回退，否则会出现「提示成功却画不出图」 */
          if (!/^data:image\/[a-z0-9.+-]+;base64,/i.test(out || "")) return fallback();
          finish(out);
        } catch (e) { fallback(); }
      };
      img.onerror = fallback;
      img.src = dataUrl;
      /* 兜底：若 3 秒内回调未触发（异常环境），直接使用原图 */
      setTimeout(fallback, 3000);
    } catch (e) { fallback(); }
  }
  /* 校验 dataURL 能否被浏览器真正解码（防止"上传成功但显示不出"的图片被当成功） */
  function verifyImageDecodable(dataUrl, cb) {
    var done = false;
    function fin(v) { if (done) return; done = true; cb(v); }
    try {
      var img = new Image();
      img.onload = function () { fin((img.naturalWidth || img.width) > 0); };
      img.onerror = function () { fin(false); };
      img.src = dataUrl;
      setTimeout(function () { fin(false); }, 3000);
    } catch (e) { fin(false); }
  }
  /* 从任意 dataURL 应用壁纸：逐级压缩（越小越省空间）→ 解码校验 → 保存。
     全部失败才提示失败，且给出可操作的原因。 */
  function applyWallpaperFromDataUrl(src) {
    var ladder = [[1280, 0.82], [1024, 0.72], [800, 0.62], [640, 0.55]];
    var i = 0, retriedWithOriginal = false;
    function tryNext() {
      if (i >= ladder.length) { toast("图片过大，建议换一张小一点的图片"); return; }
      var step = ladder[i++];
      compressImage(src, step[0], step[1], function (out) {
        if (!out) return tryNext();
        verifyImageDecodable(out, function (decodable) {
          if (!decodable) {
            /* 压缩结果解不出，用原图再试一次；仍不行就明确报错，不谎报成功 */
            if (!retriedWithOriginal) {
              retriedWithOriginal = true;
              verifyImageDecodable(src, function (srcOk) {
                if (!srcOk) { toast("这张图片无法显示，请换一张（支持 JPG/PNG 等）"); return; }
                if (setWallpaper(src) === "ok") toast("壁纸已更新");
                else tryNext();
              });
              return;
            }
            toast("这张图片无法显示，请换一张（支持 JPG/PNG 等）");
            return;
          }
          if (setWallpaper(out) === "ok") { toast("壁纸已更新"); return; }
          tryNext();   // 超出存储上限 → 再压小一档重试
        });
      });
    }
    tryNext();
  }
  /* 身体数据变化后，刷新所有与卡路里相关的视图 */
  function refreshCalorieViews() {
    renderCalSummary();
    renderTasks();
    renderSportList();
    updateCalEstimate();
    if ($("wizard") && !$("wizard").hidden) {
      updateWizCal();
    }
    if ($("panel-stats").classList.contains("active")) renderStats();
  }

  /* 根据周计划 + 星期几，自动安排今日任务（仅当今日尚无任务时执行，避免覆盖手动改动） */
  function buildTaskFromPlanItem(it) {
    var p = parsePlanItem(it);
    var a = findExerciseByName(it.split(" ")[0]);
    return {
      id: "t" + Date.now() + Math.floor(Math.random() * 1000),
      text: a ? a.name : it, done: false, src: "plan",
      w: "", s: p.s != null ? String(p.s) : (a ? String(a.sets) : ""), r: p.r != null ? p.r : (a ? String(a.reps) : ""),
      exid: a ? a.id : null, weighted: a ? !!a.weighted : true, timed: a ? !!a.timed : false,
      icon: a ? a.icon : null, part: a ? a.part : null, equip: a ? a.equip : null
    };
  }
  /* 星期 → 训练日映射（推拉腿分化：周一A 周二B 周四C 周五D；周三·周日休息） */
  var WEEK_PLAN = { 1: "A", 2: "B", 4: "C", 5: "D" };
  /* 该星期对应的训练日 id，休息日返回 null */
  function planDayIdFor(day) { return WEEK_PLAN[day] || null; }

  /* 场景化自动排期：训练日按「每周计划」对应训练日的动作自动安排（与计划页保持一致） */
  function autoScheduleToday() {
    var tk = todayKey();
    var tasks = getTasks(tk);
    if (tasks.length) return;                       // 今日已有任务（手动或已排），不覆盖
    var now = new Date();
    var dayId = planDayIdFor(now.getDay());
    if (!dayId) return;                             // 周三/周日 为休息日，不自动排
    ensurePlan();                                   // 确保有计划
    var day = getPlanDay(dayId);
    if (!day || !day.items.length) {
      /* 兜底：计划缺失时退回推荐组合 */
      var picks = pickDailyWorkout(data.scene || "home", 5);
      if (!picks.length) return;
      data.tasks[tk] = picks.map(function (a) { return taskFromExercise(a); });
      save();
      return;
    }
    data.tasks[tk] = day.items.map(function (it) {
      var a = findExerciseByName(it.split(" ")[0]);
      if (a) return taskFromExercise(a);
      return buildTaskFromPlanItem(it);
    });
    save();
  }

  /* 测试 / 调试用只读钩子（不参与任何业务逻辑，仅供 test_*.js 断言内部派生结果） */
  try {
    window.__fit = {
      deriveDay: deriveDay,
      dayActions: dayActions,
      isChecked: isChecked,
      ensureRecord: ensureRecord,
      getRecord: getRecord,
      estTaskKcal: estTaskKcal,
      estExKcal: estExKcal,
      dayCalorie: dayCalorie,
      ctxOf: ctxOf,
      blankData: blankData,
      getData: function () { return data; },
      /* 云端 / 组队（v5.0.0） */
      cloud: cloud,
      cloudOn: cloudOn,
      isCloudReady: isCloudReady,
      cloudInit: cloudInit,
      flushSync: flushSync,
      pushSummary: pushSummary,
      pushProfile: pushProfile,
      pushRecent: pushRecent,
      loadRoom: loadRoom,
      loadRoomData: loadRoomData,
      roomView: roomView,
      createRoom: createRoom,
      joinRoom: joinRoom,
      leaveRoom: leaveRoom,
      renderRoom: renderRoom,
      showTab: showTab,
      /* 看板轮询（v5.1.2：PG 无 Realtime，靠定时拉取） */
      pollRoom: pollRoom,
      startRoomPolling: startRoomPolling,
      stopRoomPolling: stopRoomPolling,
      roomSignature: roomSignature,
      isPolling: function () { return !!roomPollTimer; },
      openAccount: openAccount,
      sendAccountCode: sendAccountCode,
      verifyAccountCode: verifyAccountCode,
      /* 计时器（v5.1.0 timed 动作） */
      isTimedTask: isTimedTask,
      wizTimerState: wizTimerState,
      initWizTimer: initWizTimer,
      stopWizTimer: stopWizTimer,
      startWizTimer: startWizTimer,
      pauseWizTimer: pauseWizTimer,
      resetWizTimer: resetWizTimer,
      toggleWizTimer: toggleWizTimer,
      tickWizTimer: tickWizTimer,
      formatWizTimer: formatWizTimer,
      timerAlarm: timerAlarm,
      beep: beep,
      hideWizTimer: hideWizTimer,
      commitWheel: commitWheel,
      navigateNext: navigateNext,
      navigatePrev: navigatePrev,
      renderAppTitle: renderAppTitle,
      completeCurrent: completeCurrent,
      renderWizardStep: renderWizardStep,
      openWizard: openWizard,
      closeWizard: closeWizard,
      exportData: exportData,
      importData: importData
    };
  } catch (e) {}

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
