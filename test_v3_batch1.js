/* 端到端验证：v4.0.0 第一批改造
   - 蓝白主题（CSS 变量 + 主色 #2563EB）
   - 动作数据库结构化：数量 >= 110、含 scenes/weighted/icon 字段
   - 场景切换（居家/健身房）：切换后动作库按场景过滤
   - 线型 SVG 图标集存在并被动作引用
   - 场景影响推荐与计划
*/
const { JSDOM } = require("jsdom");
const fs = require("fs");

const html = fs.readFileSync("index.html", "utf8").replace(/<link rel="stylesheet"[^>]*>/g, "");
const appjs = fs.readFileSync("js/app.js", "utf8");
const calcjs = fs.readFileSync("js/calc.js", "utf8");
const css = fs.readFileSync("css/style.css", "utf8");

const dom = new JSDOM(html, { runScripts: "outside-only", url: "http://localhost:8080/" });
const { window } = dom;
const { document } = window;

const RealDate = window.Date;
class FakeDate extends RealDate {
  constructor(...a) { if (a.length === 0) super(2026, 6, 29); else super(...a); } // 2026-07-29 周三
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

/* ---------- 1. 版本 & 蓝白主题 ---------- */
ok("版本号 v5.1.3", (document.getElementById("appVersion").textContent || "").indexOf("5.1.3") !== -1);
ok("CSS 主色为蓝 #2563EB", css.indexOf("--primary: #2563EB") !== -1);
ok("CSS 无残留 teal #0F6E56", css.indexOf("#0F6E56") === -1);
ok("CSS 无残留 teal #11998e", css.indexOf("#11998e") === -1);
ok("主题色 meta 为蓝", html.indexOf('#2563EB') !== -1);

/* ---------- 2. 场景切换 ---------- */
const sceneBtns = document.querySelectorAll(".scene-btn");
ok("存在场景切换（居家/健身房）", sceneBtns.length === 2);
ok("默认场景为居家", document.querySelector(".scene-btn.sel").getAttribute("data-scene") === "home");

/* ---------- 3. 动作数据库（结构化） ---------- */
/* 从 app.js 源码统计 ex() 调用数量 */
const exCount = (appjs.match(/\bex\(\{/g) || []).length;
ok("动作总数 >= 110（实际 " + exCount + "）", exCount >= 110);
ok("动作含 scenes 字段", appjs.indexOf('scenes: ["home"') !== -1);
ok("动作含 weighted 字段", appjs.indexOf("weighted: true") !== -1 && appjs.indexOf("weighted: false") !== -1);
ok("动作含 icon 字段", appjs.indexOf('icon: "ic-') !== -1);
ok("动作含 met 字段", appjs.indexOf("met: ") !== -1);
ok("区分居家/健身房动作（引体仅健身房）", /引体向上[\s\S]{0,200}scenes: \["gym"\]/.test(appjs));

/* ---------- 4. SVG 图标集 ---------- */
ok("SVG symbol 图标 >= 20", document.querySelectorAll("symbol").length >= 20);
ok("含部位图标 ic-chest", !!document.getElementById("ic-chest"));
ok("含器械图标 ic-dumbbell", !!document.getElementById("ic-dumbbell"));
ok("含自重图标 ic-bodyweight", !!document.getElementById("ic-bodyweight"));

/* ---------- 5. 切换场景 → 动作库变化 ---------- */
// 次日(修复日期为周三=休息日，用周四避免休息日逻辑干扰)
const gymBtn = document.querySelector('.scene-btn[data-scene="gym"]');
gymBtn.click();
ok("切换到健身房后选中态更新", document.querySelector(".scene-btn.sel").getAttribute("data-scene") === "gym");

// 打开动作库，检查健身房专属动作（引体向上）出现在「背」部位
document.getElementById("addExerciseBtn").click();
ok("动作库弹层打开", document.getElementById("addLibOverlay").hidden === false);
const partTexts = Array.from(document.querySelectorAll(".lib-part")).map(function (e) { return e.textContent; });
ok("动作库有部位标签", partTexts.length >= 4);
// 选择「背」部位
const backTab = Array.from(document.querySelectorAll(".lib-part")).find(function (e) {
  return e.textContent.indexOf("背") !== -1;
});
ok("存在「背」部位标签", !!backTab);
if (backTab) {
  backTab.click();
  const itemNames = Array.from(document.querySelectorAll(".lib-item-name")).map(function (e) { return e.textContent; });
  ok("健身房「背」含引体向上", itemNames.indexOf("引体向上") !== -1);
  ok("动作库项带图标", document.querySelectorAll(".lib-item .lib-ico svg").length > 0);
  ok("动作库项显示器械信息", document.querySelectorAll(".lib-item-meta").length > 0);
}
document.getElementById("addLibClose").click();

// 切回居家，「背」不应含引体向上
document.querySelector('.scene-btn[data-scene="home"]').click();
document.getElementById("addExerciseBtn").click();
const backTab2 = Array.from(document.querySelectorAll(".lib-part")).find(function (e) {
  return e.textContent.indexOf("背") !== -1;
});
if (backTab2) {
  backTab2.click();
  const homeItems = Array.from(document.querySelectorAll(".lib-item-name")).map(function (e) { return e.textContent; });
  ok("居家「背」不含引体向上", homeItems.indexOf("引体向上") === -1);
}
document.getElementById("addLibClose").click();

/* ---------- 6. 身体数据设置 ---------- */
ok("设置含身高输入", !!document.getElementById("inpHeight"));
ok("设置含年龄输入", !!document.getElementById("inpAge"));
ok("设置含性别切换", document.querySelectorAll("#genderToggle button").length === 2);

/* ---------- 7. 「载入」按钮（替代原推荐横幅） ---------- */
ok("今日任务标题含「载入」按钮", !!document.getElementById("taskLoadBtn"));
ok("旧推荐横幅已移除", !document.getElementById("recoBanner"));

console.log("\n结果: " + pass + " 通过, " + fail + " 失败");
process.exit(fail ? 1 : 0);
