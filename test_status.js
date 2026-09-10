/* 端到端验证：向导-上一个/完成按钮/返回主页/断点续练 v2.7.0 */
const { JSDOM } = require("jsdom");
const fs = require("fs");

const html = fs.readFileSync("index.html", "utf8")
  .replace(/<link rel="stylesheet"[^>]*>/g, "");
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
window.requestAnimationFrame = function () { return 0; }; // 防止 buildWheel 异步重置 scrollTop

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log("✓ " + name); }
  else { fail++; console.log("✗ " + name); }
}

try {
  window.eval(appjs);
  try { document.dispatchEvent(new window.Event("DOMContentLoaded")); } catch (e) {}
} catch (e) { console.log("EVAL ERROR:", e.message); }

ok("版本号 v3.0.10", (document.getElementById("appVersion").textContent || "").indexOf("3.0.10") !== -1);
const taskList = document.getElementById("taskList");
const total = taskList.children.length;
ok("自动排程产生任务", total > 0);

function setWheel(wheelId, idx) {
  const wheel = document.getElementById(wheelId);
  wheel.scrollTop = idx * 44;
  wheel.dispatchEvent(new window.Event("scroll"));
}
function exitToHome() {
  document.getElementById("wizBack").click(); // 左上角返回直接回主页
}

// 1. 向导含 上一个 / 圆形完成 / 下一个
document.getElementById("checkinBtn").click();
ok("向导已打开", document.getElementById("wizard").hidden === false);
ok("存在 上一个 按钮", !!document.getElementById("wizPrev"));
ok("存在 圆形完成 按钮", !!document.getElementById("wizDone"));
ok("存在 下一个 按钮", !!document.getElementById("wizNext"));
ok("第1步时 上一个 禁用", document.getElementById("wizPrev").disabled === true);
ok("起始显示 1/N", document.getElementById("wizCount").textContent.trim().indexOf("1 /") === 0);

// 2. 为第1个动作设定参数（自适应：仅负重动作有重量滚轮），按圆形完成 -> 标记完成并前进
setWheel("wheelS", 3);
if (document.getElementById("wheelItemsW").children.length) setWheel("wheelW", 8);
setWheel("wheelR", 9);
document.getElementById("wizDone").click();
ok("完成后前进到第2步", document.getElementById("wizCount").textContent.trim().indexOf("2 /") === 0);

// 3. 左上角返回 -> 直接回主页；首页实时反映第1项已完成+参数
exitToHome();
ok("返回后向导关闭", document.getElementById("wizard").hidden === true);
let first = taskList.children[0];
ok("第1项=已完成", first.querySelector(".task-status").textContent.indexOf("已完成") !== -1);
const firstW = first.querySelector(".tf-w");
if (firstW) ok("第1项重量回显20", firstW.value === "20");
else ok("第1项为自主动作(无重量输入)", !!first.querySelector(".tf-static"));
ok("第2项=未完成", taskList.children[1].querySelector(".task-status").textContent.indexOf("未完成") !== -1);

// 4. 再次进入 -> 断点续练，回到上次退出的第2步
document.getElementById("checkinBtn").click();
ok("再次进入停留在第2步(断点续练)", document.getElementById("wizCount").textContent.trim().indexOf("2 /") === 0);
ok("第2步时 上一个 可用", document.getElementById("wizPrev").disabled === false);
ok("非末步时 下一个 可用", document.getElementById("wizNext").disabled === false);

// 5. 上一个/下一个 仅翻页、不标记完成
document.getElementById("wizPrev").click();
ok("上一个 -> 第1步", document.getElementById("wizCount").textContent.trim().indexOf("1 /") === 0);
ok("第1步 上一个 禁用", document.getElementById("wizPrev").disabled === true);
document.getElementById("wizNext").click(); // -> 第2步
document.getElementById("wizNext").click(); // -> 第3步（纯翻页，不完成）
ok("下一个翻到第3步", document.getElementById("wizCount").textContent.trim().indexOf("3 /") === 0);
ok("翻页不改动完成状态(第2项仍未完成)", taskList.children[1].querySelector(".task-status").textContent.indexOf("未完成") !== -1);

// 6. 回到第2项（曾被翻页经过但未完成），逐个按圆形完成 -> 全部完成并结束打卡
document.getElementById("wizPrev").click(); // 第3步 -> 第2步（index1，尚未完成）
ok("回到第2步", document.getElementById("wizCount").textContent.trim().indexOf("2 /") === 0);
// 动态点完成直到全部完成（向导关闭）
let guard = 0;
while (!document.getElementById("wizard").hidden && guard < taskList.children.length + 4) {
  document.getElementById("wizDone").click();
  guard++;
}

setTimeout(function () {
  ok("结束后向导关闭", document.getElementById("wizard").hidden === true);
  const allDone = Array.prototype.every.call(taskList.children, function (row) {
    return row.querySelector(".task-status").textContent.indexOf("已完成") !== -1;
  });
  ok("全部动作=已完成", allDone);
  ok("主页显示已打卡", (document.getElementById("checkinText").textContent || "").indexOf("已打卡") !== -1);
  console.log("\n结果: " + pass + " 通过, " + fail + " 失败");
  process.exit(fail ? 1 : 0);
}, 1600);
