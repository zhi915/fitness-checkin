/* 端到端验证：v2.9.1 首页「今日运动」添加入口 + 日历仅查看
   - 首页「今日运动」有「添加运动」按钮，点击打开记录运动弹层（作用于今天）
   - 点击日历某天（含今天）只显示当日详情，不再弹出添加/打卡弹层
*/
const { JSDOM } = require("jsdom");
const fs = require("fs");

const html = fs.readFileSync("index.html", "utf8").replace(/<link rel="stylesheet"[^>]*>/g, "");
const appjs = fs.readFileSync("js/app.js", "utf8");

const dom = new JSDOM(html, { runScripts: "outside-only", url: "http://localhost:8080/" });
const { window } = dom;
const { document } = window;

const RealDate = window.Date;
class FakeDate extends RealDate {
  constructor(...a) { if (a.length === 0) super(2026, 0, 5); else super(...a); }
}
window.Date = FakeDate;
window.confirm = () => true;
window.alert = () => {};
window.requestAnimationFrame = function () { return 0; };

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log("✓ " + name); }
  else { fail++; console.log("✗ " + name); }
}

try {
  window.eval(appjs);
  try { document.dispatchEvent(new window.Event("DOMContentLoaded")); } catch (e) {}
} catch (e) { console.log("EVAL ERROR:", e.message); }

ok("版本号 v2.9.1", (document.getElementById("appVersion").textContent || "").indexOf("2.9.1") !== -1);

// 1. 首页「今日运动」添加按钮存在
const addBtn = document.getElementById("addTodayExBtn");
ok("首页「今日运动」有「添加运动」按钮", !!addBtn && addBtn.textContent.indexOf("添加运动") !== -1);

// 2. 点击按钮打开记录运动弹层（作用于今天）
addBtn.click();
ok("点击后记录运动弹层打开", document.getElementById("sheetOverlay").hidden === false);
ok("弹层标题含「运动记录」", (document.getElementById("sheetTitle").textContent || "").indexOf("运动记录") !== -1);
document.getElementById("sheetClose").click(); // 关闭，便于后续日历验证
ok("关闭后弹层收起", document.getElementById("sheetOverlay").hidden === true);

// 3. 点击日历今天格，不应弹出弹层（日历仅查看）
document.querySelector('.nav-btn[data-tab="calendar"]').click();
const todayCell = document.querySelector(".cal-cell.today");
ok("找到今天日历格", !!todayCell);
todayCell.click();
ok("点日历今天格不再弹出添加弹层", document.getElementById("sheetOverlay").hidden === true);
ok("日历当天详情已渲染", document.getElementById("dayDetail").innerHTML.length > 0);

console.log("\n结果: " + pass + " 通过, " + fail + " 失败");
process.exit(fail ? 1 : 0);
