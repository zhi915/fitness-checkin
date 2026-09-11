/* 端到端验证：打卡向导卡路里实时计算（切换组数/重量/次数/时长即时变化）*/
const { JSDOM } = require("jsdom");
const fs = require("fs");

const html = fs.readFileSync("index.html", "utf8").replace(/<link rel="stylesheet"[^>]*>/g, "");
const appjs = fs.readFileSync("js/app.js", "utf8");
const calcjs = fs.readFileSync("js/calc.js", "utf8");

const dom = new JSDOM(html, { runScripts: "outside-only", url: "http://localhost:8080/" });
const { window } = dom;
const { document } = window;
const RealDate = window.Date;
class FakeDate extends RealDate { constructor(...a) { if (a.length === 0) super(2026, 0, 5); else super(...a); } }
window.Date = FakeDate;
window.confirm = () => true;
window.alert = () => {};
window.requestAnimationFrame = function () { return 0; };

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log("✓ " + name); } else { fail++; console.log("✗ " + name); } }
const $ = (id) => document.getElementById(id);

try { window.eval(calcjs); window.eval(appjs); document.dispatchEvent(new window.Event("DOMContentLoaded")); }
catch (e) { console.log("EVAL ERROR:", e.message); }

function setWheel(wheelId, idx) {
  const wheel = $(wheelId);
  wheel.scrollTop = idx * 44;
  wheel.dispatchEvent(new window.Event("scroll"));
}
function num(txt) { const m = String(txt).match(/(\d+)/); return m ? parseInt(m[1], 10) : null; }
function toFirstPage() { while ($("wizPrev").disabled === false) $("wizPrev").click(); }

// 打开向导
$("checkinBtn").click();
ok("向导已打开", $("wizard").hidden === false);
ok("存在当前动作卡路里元素", !!$("wizCalCur"));
ok("存在今日累计卡路里元素", !!$("wizCalTotal"));

const total = $("taskList").querySelectorAll(".task-item").length;

// ===== 先从第 1 页找「负重」动作做重量/组数/次数测试 =====
toFirstPage();
let weightedOK = false;
for (let i = 0; i < total; i++) {
  if ($("wheelItemsW").children.length > 0) {
    const base = num($("wizCalCur").textContent);
    if (base != null && base > 0) {
      ok("当前动作卡路里已显示数值", true);
      weightedOK = true;
      // ① 加大重量 -> 变大
      setWheel("wheelW", 20);
      const afterW = num($("wizCalCur").textContent);
      ok("加大重量后卡路里增大", afterW != null && afterW > base);
      // ② 减小重量 -> 变小
      setWheel("wheelW", 2);
      const afterW2 = num($("wizCalCur").textContent);
      ok("减小重量后卡路里变小", afterW2 != null && afterW2 < afterW);
      // ③ 增加组数 -> 变大
      const beforeS = num($("wizCalCur").textContent);
      setWheel("wheelS", 8);
      const afterS = num($("wizCalCur").textContent);
      ok("增加组数后卡路里增大", afterS != null && afterS > beforeS);
      // ④ 增加次数 -> 变大
      const beforeR = num($("wizCalCur").textContent);
      setWheel("wheelR", 25);
      const afterR = num($("wizCalCur").textContent);
      ok("增加次数后卡路里增大", afterR != null && afterR > beforeR);
    }
    break;
  }
  if (i < total - 1) $("wizNext").click();
}
if (!weightedOK) console.log("· 本轮任务未包含负重动作，跳过重量实时断言");

// ===== 今日累计随当前动作变化联动 =====
const totalBefore = num($("wizCalTotal").textContent);
ok("今日累计已显示数值", totalBefore != null);
setWheel("wheelS", 10);
const totalAfter = num($("wizCalTotal").textContent);
ok("调整组数后今日累计同步变化", totalAfter != null && totalAfter !== totalBefore);

// ===== 计时动作：调时长 -> 实时变化 =====
toFirstPage();
let timedFound = false;
for (let i = 0; i < total; i++) {
  if ($("lblR").textContent.indexOf("时长") !== -1) {
    timedFound = true;
    setWheel("wheelS", 3);
    setWheel("wheelR", 1);   // 更短
    const t2 = num($("wizCalCur").textContent);
    setWheel("wheelR", 15);  // 更长
    const t3 = num($("wizCalCur").textContent);
    ok("计时动作调整时长后卡路里实时变化", t2 != null && t3 != null && t3 > t2);
    break;
  }
  if (i < total - 1) $("wizNext").click();
}
if (!timedFound) console.log("· 本轮任务未包含计时动作，跳过时长实时断言");

console.log("\n结果: " + pass + " 通过, " + fail + " 失败");
process.exit(fail ? 1 : 0);
