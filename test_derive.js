/* v4.0.0 打卡逻辑重构验证——「单一事实源 + 纯函数派生」
   重构前：checkedIn 状态位有 5 处写入、actions 镜像有 3 处写入，彼此容易不一致
           （典型 bug：任务没做完却显示已打卡）。
   重构后：唯一事实源 = data.tasks[date]（每项 done）+ records[date].exercises；
           是否已打卡 / 动作明细 / 进度 全部由 deriveDay() 派生，不存在可写坏的状态位。
   本测试直接断言派生层结果（走 window.__fit 只读钩子）。
*/
const { JSDOM } = require("jsdom");
const fs = require("fs");

const html = fs.readFileSync("index.html", "utf8").replace(/<link rel="stylesheet"[^>]*>/g, "");
const appjs = fs.readFileSync("js/app.js", "utf8");
const calcjs = fs.readFileSync("js/calc.js", "utf8");

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log("✓ " + name); }
  else { fail++; console.log("✗ " + name); }
}

function boot(opts) {
  opts = opts || {};
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "http://localhost:8080/" });
  const { window } = dom;
  const RealDate = window.Date;
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(2026, 0, 5); else super(...a); } // 周一（训练日 A）
  }
  window.Date = FakeDate;
  window.confirm = () => true;
  window.alert = () => {};
  window.requestAnimationFrame = function () { return 0; };
  if (opts.store) window.localStorage.setItem("fitapp_data", JSON.stringify(opts.store));
  window.eval(calcjs);
  window.eval(appjs);
  try { window.document.dispatchEvent(new window.Event("DOMContentLoaded")); } catch (e) {}
  return { dom: dom, window: window, document: window.document };
}

/* ================= 1. 派生层基本规则 ================= */
const w1 = boot();
const F = w1.window.__fit;
const D = F.getData();
const TK = "2026-01-05";

ok("__fit 暴露 deriveDay / dayActions / isChecked", typeof F.deriveDay === "function" && typeof F.dayActions === "function" && typeof F.isChecked === "function");

// 受控任务：1 完成 + 1 未完成
D.tasks[TK] = [
  { id: "a", text: "卧推", done: true, w: 40, s: 3, r: 10 },
  { id: "b", text: "深蹲", done: false, w: 60, s: 4, r: 10 }
];
delete D.records[TK];

let dd = F.deriveDay(TK);
ok("total=2 / doneCount=1 / pending=1", dd.total === 2 && dd.doneCount === 1 && dd.pending === 1);
ok("有未完成动作 → checked=false", dd.checked === false);
ok("allDone=false", dd.allDone === false);
ok("actions 派生自 tasks（长度=2）", dd.actions.length === 2);
ok("actions 保留重量/组数/次数参数", dd.actions[0].s === 3 && dd.actions[0].r === 10 && dd.actions[0].w === 40);
ok("actions 保留 done 标记", dd.actions[0].done === true && dd.actions[1].done === false);

// 全部完成 → 自动变已打卡（零手工同步，替代原 syncCheckin 的职责）
D.tasks[TK][1].done = true;
dd = F.deriveDay(TK);
ok("全部完成 → checked=true（无需任何手工同步）", dd.checked === true);
ok("allDone=true / pending=0", dd.allDone === true && dd.pending === 0);

// 新增一个未完成动作 → 自动取消已打卡
D.tasks[TK].push({ id: "c", text: "划船", done: false, w: 30, s: 3, r: 12 });
ok("新增未完成动作 → 自动回到未打卡", F.isChecked(TK) === false);
ok("派生 actions 同步包含新动作（长度=3）", F.deriveDay(TK).actions.length === 3);
D.tasks[TK].pop();
ok("删除该动作 → 自动恢复已打卡", F.isChecked(TK) === true);

/* ================= 2. 核心规则：确认 ≠ 可跳过任务 ================= */
const tk2 = "2026-01-06";
D.tasks[tk2] = [{ id: "x", text: "引体向上", done: false, s: 3, r: 8 }];
F.ensureRecord(tk2).confirmed = true;
ok("有未完成任务 + 用户已确认 → 仍判定未打卡（核心规则）", F.isChecked(tk2) === false);
D.tasks[tk2][0].done = true;
ok("任务完成后 → 已打卡（confirmed 与完成度共同生效）", F.isChecked(tk2) === true);

/* ================= 3. 休息日（无任务）分支 ================= */
const tk3 = "2026-01-07";
delete D.tasks[tk3]; delete D.records[tk3];
ok("无任务/无确认/无运动 → 未打卡", F.isChecked(tk3) === false);
const r3 = F.ensureRecord(tk3);
r3.exercises.push({ type: "running", sport: "", duration: 30, calories: 252 });
ok("无任务但记录了运动 → 已打卡", F.isChecked(tk3) === true);

const tk4 = "2026-01-08";
delete D.tasks[tk4]; delete D.records[tk4];
F.ensureRecord(tk4).confirmed = true;
ok("无任务 + 用户确认 → 已打卡（休息日手动打卡）", F.isChecked(tk4) === true);

/* ================= 4. 旧数据兜底（无 tasks 但有 rec.actions） ================= */
const tk5 = "2026-01-09";
delete D.tasks[tk5];
D.records[tk5] = { date: tk5, confirmed: true, exercises: [], actions: [{ text: "旧动作", done: true, s: 3, r: 10 }] };
ok("旧数据兜底：dayActions 回退 rec.actions", F.dayActions(tk5).length === 1 && F.dayActions(tk5)[0].text === "旧动作");
ok("旧数据兜底：deriveDay.actions 同样回退", F.deriveDay(tk5).actions.length === 1);

/* ================= 5. 计算层：ctx 显式传参（纯函数可用） ================= */
const t72 = F.estTaskKcal({ text: "卧推", w: 40, s: 3, r: 10 }, { weight: 72, bmr: 1725 });
const t100 = F.estTaskKcal({ text: "卧推", w: 40, s: 3, r: 10 }, { weight: 100, bmr: 2000 });
ok("estTaskKcal 支持显式 ctx", typeof t72 === "number" && t72 > 0);
ok("ctx 体重/BMR 更大 → 热量更高（BMR 摊分项生效）", t100 > t72);
ok("estExKcal 单车羽毛球 40min@72kg = 264", F.estExKcal({ sport: "羽毛球", duration: 40 }, { weight: 72, bmr: 1725 }) === 264);
ok("estTaskKcal 信息不足（无组数）→ null", F.estTaskKcal({ text: "卧推", r: 10 }, { weight: 72, bmr: 1725 }) === null);

/* ================= 6. 旧数据迁移（load） ================= */
const legacy = {
  records: { "2026-01-02": { date: "2026-01-02", checkedIn: true, exercises: [] } },
  tasks: {}, plan: null, recDismiss: {}, wizResume: 0,
  weight: 72, height: 180, age: 25, gender: "male", scene: "home",
  username: "", theme: "snow", wallpaper: "", profileDone: true
};
const w2 = boot({ store: legacy });
const F2 = w2.window.__fit;
ok("迁移：旧 checkedIn=true → confirmed=true", F2.getRecord("2026-01-02").confirmed === true);
ok("迁移：旧的 checkedIn 字段已清除", !("checkedIn" in F2.getRecord("2026-01-02")));
ok("迁移后（无任务）仍判为已打卡", F2.isChecked("2026-01-02") === true);

/* 旧数据自愈：残留 checkedIn=true 但任务未完成 → 派生层自动纠正（原 syncCheckin 的职责） */
const legacy2 = {
  records: { "2026-01-02": { date: "2026-01-02", checkedIn: true, exercises: [] } },
  tasks: { "2026-01-02": [{ id: "p", text: "卧推", done: true, s: 3, r: 10 }, { id: "q", text: "深蹲", done: false, s: 3, r: 10 }] },
  plan: null, recDismiss: {}, wizResume: 0,
  weight: 72, height: 180, age: 25, gender: "male", scene: "home",
  username: "", theme: "snow", wallpaper: "", profileDone: true
};
const w3 = boot({ store: legacy2 });
ok("旧数据自愈：残留已打卡但有未完成任务 → 自动纠正为未打卡", w3.window.__fit.isChecked("2026-01-02") === false);

console.log("\n结果: " + pass + " 通过, " + fail + " 失败");
process.exit(fail ? 1 : 0);
