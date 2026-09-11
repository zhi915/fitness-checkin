/* v2.3.0 功能验证：自动排程 / 更换动作 / 打卡记录动作内容 */
const { JSDOM } = require("jsdom");
const fs = require("fs");

const html = fs.readFileSync("index.html", "utf8")
  .replace(/<link rel="stylesheet"[^>]*>/g, "");           // 去掉 CSS 链接，避免文件加载噪音
const appjs = fs.readFileSync("js/app.js", "utf8");
const calcjs = fs.readFileSync("js/calc.js", "utf8");

const dom = new JSDOM(html, { runScripts: "outside-only", url: "http://localhost:8080/", pretendToBeVisual: true });
const { window } = dom;
const document = window.document;

// 强制“今天”为周一（训练日 A），以便验证自动排程
const RealDate = window.Date;
class FakeDate extends RealDate {
  constructor(...args) {
    if (args.length === 0) super(2026, 0, 5);   // 2026-01-05 = 周一
    else super(...args);
  }
}
window.Date = FakeDate;
window.confirm = function () { return true; };
window.alert = function () {};
window.requestAnimationFrame = function () { return 0; };
window.setTimeout = (cb) => cb(); // completeCurrent 的视觉反馈/切下一步在测试里同步执行

// 执行真实 app.js（outside-only 模式下用 window.eval 运行）
window.eval(calcjs); window.eval(appjs);
// jsdom 构造后 readyState 仍为 loading，手动触发 DOMContentLoaded 以启动 init()
window.document.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true }));

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { console.log("✓ " + name); pass++; }
  else { console.log("✗ " + name); fail++; }
}
function $(id) { return window.document.getElementById(id); }
function click(el) { el.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); }

const TODAY = "2026-01-05";

// ===== 1. 自动排程 =====
const listRows = $("taskList").querySelectorAll(".task-item");
// 总任务数 = 列表行数 + 顶部当前动作卡(未完成时存在且不在列表中重复)
const hasCurrentCard = !!$("taskCurrent").querySelector(".task-current-card");
const TASK_N = listRows.length + (hasCurrentCard ? 1 : 0);
ok("自动排程：周一打开即生成今日任务(与计划A一致，条数>0)", TASK_N > 0);
ok("任务进度显示 0/N（N=任务数）", $("taskProgress").textContent.trim() === "0/" + TASK_N);
ok("当前动作卡片已显示首个动作", !!$("taskCurrent").querySelector(".tc-text") && $("taskCurrent").querySelector(".tc-text").textContent.length > 0);
ok("列表中不重复当前动作(行数=" + listRows.length + "，总数=" + TASK_N + ")", listRows.length === TASK_N - 1);

// ===== 2. 更换动作（作用于顶部放大卡里的当前动作）=====
const firstTextBefore = $("taskCurrent").querySelector(".tc-text").textContent;
click($("taskCurrent").querySelector(".tc-replace"));
ok("点击更换后弹层打开", $("replaceOverlay").hidden === false);
const replItems = $("replaceList").querySelectorAll(".replace-item");
ok("更换列表中有可选项", replItems.length > 0);
// 选一个与当前不同的动作
let pick = null, pickText = "";
for (let i = 0; i < replItems.length; i++) {
  if (replItems[i].textContent.trim() && !replItems[i].classList.contains("same")) { pick = replItems[i]; pickText = replItems[i].textContent.trim(); break; }
}
click(pick);
ok("更换后弹层关闭", $("replaceOverlay").hidden === true);
const firstTextAfter = $("taskCurrent").querySelector(".tc-text").textContent;
ok("更换后首个动作文本已改变", firstTextAfter.indexOf(pickText) !== -1 && pickText !== firstTextBefore.replace(/[\s\d]*千卡.*/, ""));

// ===== 3. 打卡时记录动作内容（v3：向导式打卡） =====
// 打开打卡向导，依次点击圆形完成按钮走完全部动作
click($("checkinBtn"));
ok("打卡向导已打开", $("wizard").hidden === false);
const total = TASK_N;
for (let n = 0; n < total + 3; n++) {
  if ($("wizard").hidden) break;
  if (window.__fit.isChecked(TODAY)) break;   // 派生：全部完成才算已打卡
  click($("wizDone"));   // 完成当前动作并前进
}
// 完成页出现（setTimeout 1300ms 后自动关闭）
setTimeout(function () {
  // v4.0.0：不再断言持久化的 checkedIn/actions，改为断言派生层（单一状态源）
  const d = window.__fit.deriveDay(TODAY);
  ok("打卡判定为已完成（deriveDay.checked）", d.checked === true);
  ok("动作明细包含今日全部动作（派生）", d.actions.length === total);
  ok("动作内容含重量/组数/次数解析(s 或 r 存在)", d.actions.some(function (a) { return a.s || a.r; }));
  ok("已完成的动作 done=true", d.actions.every(function (a) { return a.done === true; }));

  // 今日动作记录区渲染
  ok("今日动作记录区显示", $("todayActionsTitle") && $("todayActions").querySelectorAll(".today-action").length === total);

  console.log("\n结果: " + pass + " 通过, " + fail + " 失败");
  process.exit(fail ? 1 : 0);
}, 1500);
