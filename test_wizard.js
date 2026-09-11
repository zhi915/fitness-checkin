const { JSDOM } = require("jsdom");
const fs = require("fs");

const html = fs.readFileSync("index.html", "utf8").replace(/<link rel="stylesheet"[^>]*>/g, "");
const appjs = fs.readFileSync("js/app.js", "utf8");
const calcjs = fs.readFileSync("js/calc.js", "utf8");

const dom = new JSDOM(html, { runScripts: "outside-only", url: "http://localhost:8080/" });
const { window } = dom;
const RealDate = window.Date;
class FakeDate extends RealDate {
  constructor(...a) { if (a.length === 0) super(2026, 0, 5); else super(...a); } // 2026-01-05 = 周一(训练日)
}
window.Date = FakeDate;
window.confirm = () => true;
window.alert = () => {};
window.requestAnimationFrame = (cb) => cb();
window.setTimeout = (cb) => cb(); // 让向导关闭定时器立即执行，便于断言

window.eval(calcjs); window.eval(appjs);
window.document.dispatchEvent(new window.Event("DOMContentLoaded"));

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log("✓ " + name); } else { fail++; console.log("✗ " + name); } }

const $ = (id) => window.document.getElementById(id);

// 1. 自动排程：训练日应有今日任务
ok($("taskList").querySelectorAll(".task-item").length > 0, "训练日自动生成今日任务");
// 首个（当前）动作在顶部放大卡展示
const firstTask = $("taskCurrent").querySelector(".tc-text").textContent;
// 今日任务总数（顶部进度条分母；列表里不含当前动作，不重复展示）
const total = parseInt(($("taskProgress").textContent || "0/0").split("/")[1], 10);

// 2. 点击今日打卡 -> 打开向导
$("checkinBtn").click();
ok($("wizard").hidden === false, "点击今日打卡打开分步向导");
ok($("wizActionName").textContent.length > 0, "向导显示第一个动作名称");
ok(firstTask.indexOf($("wizActionName").textContent) !== -1, "向导首屏动作与任务首项一致");

// 3. 滚轮已渲染（次数或时长为自适应，至少渲染若干项）
ok($("wheelItemsS").children.length === 10, "组数滚轮 1-10");
ok($("wheelItemsR").children.length > 0, "次数/时长滚轮已渲染选项");

// 4. 进度与计数
ok($("wizCount").textContent.indexOf("/") > 0, "显示进度计数 x / N");

// 5. 依次点击圆形完成按钮，走完全部动作（点击 total 次即全部标记完成）
for (let i = 0; i < total; i++) $("wizDone").click();
// v4.0.0：不再断言持久化的 checkedIn/actions 状态位，改为断言派生层结果（唯一事实源）
const d1 = window.__fit.deriveDay("2026-01-05");
ok(d1.checked === true, "全部完成后自动完成打卡（deriveDay.checked）");
ok(d1.total === total && d1.doneCount === total, "派生进度：全部完成 (" + d1.doneCount + "/" + d1.total + ")");

// 6. 校验动作明细（派生自 data.tasks）
ok(d1.actions.length === total, "动作明细包含全部动作（派生）");
ok(d1.actions.every(a => a.done === true), "动作均标记为已完成");

// 7. 向导关闭（setTimeout 同步执行 -> 立即关闭）
ok($("wizard").hidden === true, "打卡后向导关闭");

// 8. 休息日：无任务直接打卡
class FakeSun extends RealDate { constructor(...a){ if(a.length===0) super(2026,0,4); else super(...a);} } // 周日
window.Date = FakeSun;
window.localStorage.clear();
window.eval(calcjs); window.eval(appjs);
window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
$("checkinBtn").click();
ok($("wizBody").classList.contains("empty"), "休息日向导显示空状态");
$("wizDone").click();
// 休息日：无任务，用户确认后由 confirmed 派生「已打卡」
ok(window.__fit.isChecked("2026-01-04") === true, "休息日完成打卡成功（deriveDay.checked）");

console.log("\n结果: " + pass + " 通过, " + fail + " 失败");
process.exit(fail ? 1 : 0);
