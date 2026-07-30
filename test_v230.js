/* v2.3.0 功能验证：自动排程 / 更换动作 / 打卡记录动作内容 */
const { JSDOM } = require("jsdom");
const fs = require("fs");

const html = fs.readFileSync("index.html", "utf8")
  .replace(/<link rel="stylesheet"[^>]*>/g, "");           // 去掉 CSS 链接，避免文件加载噪音
const appjs = fs.readFileSync("js/app.js", "utf8");

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

// 执行真实 app.js（outside-only 模式下用 window.eval 运行）
window.eval(appjs);
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
const taskRows = $("taskList").querySelectorAll(".task-item");
ok("自动排程：周一打开即生成今日任务(来自计划A=5项)", taskRows.length === 5);
ok("任务进度显示 0/5", /0\/5/.test($("taskProgress").textContent));
ok("当前动作卡片已显示首个动作", !!$("taskCurrent").querySelector(".tc-text") && $("taskCurrent").querySelector(".tc-text").textContent.length > 0);

// ===== 2. 更换动作 =====
const firstTextBefore = taskRows[0].querySelector(".task-text").textContent;
click(taskRows[0].querySelector(".task-replace"));
ok("点击更换后弹层打开", $("replaceOverlay").hidden === false);
ok("更换列表中有可选项", $("replaceList").querySelectorAll(".replace-item").length > 0);
// 选一个不同的动作（取第 3 个候选，避开与首项相同）
const items = $("replaceList").querySelectorAll(".replace-item");
const pick = items[2];
const pickText = pick.textContent;
click(pick);
ok("更换后弹层关闭", $("replaceOverlay").hidden === true);
const firstTextAfter = $("taskList").querySelectorAll(".task-item")[0].querySelector(".task-text").textContent;
ok("更换后首个动作文本已改变", firstTextAfter !== firstTextBefore && firstTextAfter === pickText);

// ===== 3. 打卡时记录动作内容 =====
// 先把第一个动作标记完成
click($("taskList").querySelectorAll(".task-item")[0].querySelector(".task-check"));
ok("标记完成后进度变为 1/5", /1\/5/.test($("taskProgress").textContent));

// 打开打卡弹层并完成打卡
click($("checkinBtn"));
ok("打卡弹层已打开", $("sheetOverlay").hidden === false);
click($("btnFinish"));

const stored = JSON.parse(window.localStorage.getItem("fitapp_data"));
const rec = stored.records[TODAY];
ok("打卡记录已写入且 checkedIn=true", rec && rec.checkedIn === true);
ok("打卡记录包含今日动作内容(actions 数组)", rec && Array.isArray(rec.actions) && rec.actions.length === 5);
ok("动作内容含重量/组数/次数解析(s 或 r 存在)", rec && rec.actions.some(function (a) { return a.s || a.r; }));
ok("已完成的动作 done=true", rec && rec.actions[0].done === true);

// 今日动作记录区渲染
ok("今日动作记录区显示", $("todayActionsTitle").hidden === false && $("todayActions").querySelectorAll(".today-action").length === 5);

console.log("\n结果：" + pass + " 通过, " + fail + " 失败");
process.exit(fail ? 1 : 0);
