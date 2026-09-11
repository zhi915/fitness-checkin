/* 端到端验证：卡路里计算功能 v2.9.1
   - 今日任务列表显示做功法 ≈kcal 徽标
   - 首页「今日预计消耗」汇总卡有数值 + 类型色条
   - 记录运动弹层：球类选具体项目(羽毛球)自动带入时长并估算卡路里，无需手动输入
   - 向导底部显示「今日累计 ≈kcal」
   - 体重修改后卡路里实时变化
*/
const { JSDOM } = require("jsdom");
const fs = require("fs");

const html = fs.readFileSync("index.html", "utf8").replace(/<link rel="stylesheet"[^>]*>/g, "");
const appjs = fs.readFileSync("js/app.js", "utf8");
const calcjs = fs.readFileSync("js/calc.js", "utf8");

const dom = new JSDOM(html, { runScripts: "outside-only", url: "http://localhost:8080/" });
const { window } = dom;
const { document } = window;

const RealDate = window.Date;
class FakeDate extends RealDate {
  constructor(...a) { if (a.length === 0) super(2026, 0, 5); else super(...a); } // 周一，自动排程 Day A
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
  window.eval(calcjs); window.eval(appjs);
  try { document.dispatchEvent(new window.Event("DOMContentLoaded")); } catch (e) {}
} catch (e) { console.log("EVAL ERROR:", e.message); }

ok("版本号 v5.1.0", (document.getElementById("appVersion").textContent || "").indexOf("5.1.0") !== -1);

// 1. 首页汇总卡有数值（今日任务做功法估算之和 > 0）
const calSum = document.getElementById("calSumNum");
const beforeTotal = parseInt(calSum.textContent, 10);
ok("首页「今日预计消耗」有数值", !isNaN(beforeTotal) && beforeTotal > 0);
ok("汇总卡含环形图容器", !!document.getElementById("calRing"));
ok("环形图渲染出弧段(>0)", document.getElementById("calRing").innerHTML.indexOf("<circle") !== -1);
ok("环形图中心显示总消耗", /^\d+$/.test(document.getElementById("calSumNum").textContent.trim()));

// 2. 今日任务列表显示 ≈kcal 徽标
const taskList = document.getElementById("taskList");
ok("今日任务列表含 千卡 徽标", taskList.innerHTML.indexOf("千卡") !== -1);

// 3. 向导底部显示「今日累计 ≈kcal」
document.getElementById("checkinBtn").click();
ok("向导打开", document.getElementById("wizard").hidden === false);
ok("向导底部显示累计卡路里", (document.getElementById("wizCal").textContent || "").indexOf("千卡") !== -1);
document.getElementById("wizBack").click(); // 返回主页

// 4. 记录运动弹层：球类选具体项目
// v2.9.1 起，添加运动入口在首页「今日运动」的「添加运动」按钮，日历仅作查看
document.getElementById("addTodayExBtn").click(); // -> openSheet(今天)
ok("记录运动弹层打开", document.getElementById("sheetOverlay").hidden === false);

// 选「球类」类型
const chips = document.querySelectorAll("#typeChips .chip");
let ballChip = null;
chips.forEach(function (c) { if (c.textContent.indexOf("球类") !== -1) ballChip = c; });
ok("存在 球类 类型标签", !!ballChip);
ballChip.click();
const sportList = document.getElementById("sportList");
ok("选球类后显示具体项目列表", sportList.hidden === false && sportList.children.length > 0);
ok("项目列表含 羽毛球", sportList.innerHTML.indexOf("羽毛球") !== -1);

// 点击 羽毛球
let badminton = null;
sportList.querySelectorAll(".sport-item").forEach(function (it) {
  if (it.textContent.indexOf("羽毛球") !== -1) badminton = it;
});
badminton.click();
ok("选羽毛球后自动带入时长 40 分钟", document.getElementById("inpDuration").value === "40");
ok("选羽毛球后实时显示预计消耗", (document.getElementById("calEstimate").textContent || "").indexOf("千卡") !== -1);
ok("羽毛球预计≈264千卡(72kg)", (document.getElementById("calEstimate").textContent || "").indexOf("264") !== -1);

// 添加到今日
document.getElementById("btnAddExercise").click();
const todayList = document.getElementById("todayList");
ok("今日运动出现 羽毛球", todayList.innerHTML.indexOf("羽毛球") !== -1);
ok("羽毛球记录含 264 千卡", todayList.innerHTML.indexOf("264") !== -1);

// 5. 体重改为 100kg，卡路里变化
const wInput = document.getElementById("inpWeight");
wInput.value = "100";
wInput.dispatchEvent(new window.Event("input"));
const afterTotal = parseInt(calSum.textContent, 10);
ok("修改体重后卡路里变化", afterTotal !== beforeTotal);
// 重新选 羽毛球（时长会重新带入），验证体重影响估算值
let badminton2 = null;
document.getElementById("sportList").querySelectorAll(".sport-item").forEach(function (it) {
  if (it.textContent.indexOf("羽毛球") !== -1) badminton2 = it;
});
badminton2.click();
ok("体重100时羽毛球预计≈367千卡", (document.getElementById("calEstimate").textContent || "").indexOf("367") !== -1);

console.log("\n结果: " + pass + " 通过, " + fail + " 失败");
process.exit(fail ? 1 : 0);
