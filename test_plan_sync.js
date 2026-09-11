/* 端到端验证：今日任务数量与「每日计划」对应训练日一致（不再出现 0/7 vs 计划X项 的错位）*/
const { JSDOM } = require("jsdom");
const fs = require("fs");

const html = fs.readFileSync("index.html", "utf8").replace(/<link rel="stylesheet"[^>]*>/g, "");
const appjs = fs.readFileSync("js/app.js", "utf8");
const calcjs = fs.readFileSync("js/calc.js", "utf8");

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log("✓ " + name); } else { fail++; console.log("✗ " + name); } }

// 用同一份 app.js 在指定「星期」下启动，返回 {window, document}
function bootOnWeekday(jsDay) {
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "http://localhost:8080/" });
  const { window } = dom;
  const RealDate = window.Date;
  // 2026-01-05 是周一(jsDay=1)。偏移到目标 weekday。
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(2026, 0, 5 + (jsDay - 1)); else super(...a); }
  }
  window.Date = FakeDate;
  window.confirm = () => true;
  window.alert = () => {};
  window.requestAnimationFrame = function () { return 0; };
  window.eval(calcjs); window.eval(appjs);
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
  return window;
}

// 星期一：训练日 A
const w1 = bootOnWeekday(1);
const d1 = w1.document;
// 顶部进度条分母 = 今日任务总数（当前动作在顶部放大卡，列表里不再重复）
const progress1 = d1.getElementById("taskProgress").textContent.trim();
const taskCount = parseInt(progress1.split("/")[1], 10);
ok("周一自动排程生成任务(>0)", taskCount > 0);
ok("顶部进度条分母=今日任务数 (" + progress1 + ")", progress1 === "0/" + taskCount);

// 当前动作不应在列表中重复出现：列表行数 = 总任务数 - 1（未完成时顶部卡展示首个未完成动作）
const w1done = d1.getElementById("taskCurrent").querySelector(".task-current-card");
ok("顶部放大卡展示当前动作", !!w1done);
ok("列表中不重复当前动作 (行数 " + d1.getElementById("taskList").children.length + " = 总数 " + taskCount + " - 1)",
  d1.getElementById("taskList").children.length === taskCount - 1);

// 计划页 A 日的项数应与今日任务数一致
d1.querySelector('.nav-btn[data-tab="plan"]').click();
const cardsA = [...d1.querySelectorAll("#planList .plan-card")];
const cardA = cardsA.find(c => c.querySelector(".plan-name").textContent.indexOf("A ·") === 0);
ok("计划页存在 A 日卡片", !!cardA);
const planACount = cardA.querySelectorAll("li").length;
ok("计划A日项数 = 今日任务数 (" + planACount + " = " + taskCount + ")", planACount === taskCount);
ok("A 日卡片标记「今天」", !!cardA.querySelector(".plan-today-tag"));

// 星期三：休息日，不自动排
const w3 = bootOnWeekday(3);
const d3 = w3.document;
ok("周三(休息日)不自动生成任务", d3.getElementById("taskList").children.length === 0);
d3.querySelector('.nav-btn[data-tab="plan"]').click();
const today3 = [...d3.querySelectorAll("#planList .plan-card")].find(c => c.querySelector(".plan-today-tag"));
ok("周三计划页无「今天」标记(休息)", !today3);

// 星期四：训练日 C
const w4 = bootOnWeekday(4);
const d4 = w4.document;
const taskCount4 = parseInt(d4.getElementById("taskProgress").textContent.trim().split("/")[1], 10);
d4.querySelector('.nav-btn[data-tab="plan"]').click();
const cardC = [...d4.querySelectorAll("#planList .plan-card")].find(c => c.querySelector(".plan-name").textContent.indexOf("C ·") === 0);
ok("周四自动排程生成任务(>0)", taskCount4 > 0);
ok("周四计划C日项数 = 今日任务数 (" + cardC.querySelectorAll("li").length + " = " + taskCount4 + ")", cardC.querySelectorAll("li").length === taskCount4);
ok("C 日卡片标记「今天」", !!cardC.querySelector(".plan-today-tag"));

console.log("\n结果: " + pass + " 通过, " + fail + " 失败");
process.exit(fail ? 1 : 0);
