/* 端到端验证：完成打卡后添加动作，再次进入“每日打卡”向导，
   「今日打卡完成」成功页（wizDoneView）必须被隐藏，直接显示动作列表 v2.8.2
   重点覆盖本次 bug 根因：CSS 带 display 的类需显式处理 [hidden]，否则 hidden 属性被作者样式覆盖 */
const { JSDOM } = require("jsdom");
const fs = require("fs");

const html = fs.readFileSync("index.html", "utf8").replace(/<link rel="stylesheet"[^>]*>/g, "");
const appjs = fs.readFileSync("js/app.js", "utf8");
const css = fs.readFileSync("css/style.css", "utf8");

const dom = new JSDOM(html, { runScripts: "outside-only", url: "http://localhost:8080/" });
const { window } = dom;
const { document } = window;

const RealDate = window.Date;
class FakeDate extends RealDate {
  constructor(...a) { if (a.length === 0) super(2026, 0, 5); else super(...a); } // 周一（训练日）
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

/* 静态断言：CSS 必须显式处理 [hidden]，否则成功页无法真正隐藏（本次 bug 根因） */
ok("CSS 含 .wiz-done-view[hidden] 隐藏规则", css.indexOf("wiz-done-view[hidden]") !== -1);
ok("CSS 含 .wiz-body[hidden] 隐藏规则", css.indexOf(".wiz-body[hidden]") !== -1);

try {
  window.eval(appjs);
  try { document.dispatchEvent(new window.Event("DOMContentLoaded")); } catch (e) {}
} catch (e) { console.log("EVAL ERROR:", e.message); }

const checkinText = document.getElementById("checkinText");
const wizDoneView = document.getElementById("wizDoneView");
const wizBody = document.getElementById("wizBody");
const wizWizard = document.getElementById("wizard");

ok("版本号 v2.9.1", (document.getElementById("appVersion").textContent || "").indexOf("2.9.1") !== -1);

/* 1. 自动排程产生任务（周一训练日） */
const before = document.getElementById("taskList").children.length;
ok("自动排程产生任务", before > 0);

/* 2. 完成全部打卡：打开向导，逐个按圆形完成，直到成功页出现 */
document.getElementById("checkinBtn").click();
ok("打开向导后 wizBody 可见", wizBody.hidden === false);
let guard = 0;
while (wizDoneView.hidden === true && guard < 30) {
  document.getElementById("wizDone").click(); // completeCurrent 完成当前动作
  guard++;
}
ok("全部完成后显示成功页", wizDoneView.hidden === false);

/* 3. 等待成功页自动关闭（1.3s 后 closeWizard 才刷新首页“已打卡”文案） */
setTimeout(function () {
  ok("成功页自动关闭向导", wizWizard.hidden === true);
  ok("全部完成后已打卡", (checkinText.textContent || "").indexOf("已打卡") !== -1);

  /* 4. 完成打卡后再添加动作（首页自定义添加） */
  const listBefore = document.getElementById("taskList").children.length;
  document.getElementById("libCustom").value = "额外加练 哑铃弯举 3组 × 12";
  document.getElementById("libCustomBtn").click(); // addTask

  /* 5. 添加后：必须取消“已打卡”，首页回到“今日打卡” */
  ok("添加动作后取消已打卡态", (checkinText.textContent || "").indexOf("已打卡") === -1);
  ok("添加动作后首页显示今日打卡", (checkinText.textContent || "").indexOf("今日打卡") !== -1);
  ok("任务数 +1", document.getElementById("taskList").children.length === listBefore + 1);

  /* 6. 再次进入“每日打卡”向导：成功页必须被隐藏，显示动作列表 */
  document.getElementById("checkinBtn").click();
  ok("再次进入向导：成功页已隐藏", wizDoneView.hidden === true);
  ok("再次进入向导：动作列表可见", wizBody.hidden === false);
  ok("再次进入向导：仍在向导内", wizWizard.hidden === false);
  ok("再次进入向导：显示进度计数", (document.getElementById("wizCount").textContent || "").length > 0);
  // 定位应停在未完成的新动作，而非完成页
  ok("再次进入向导：当前动作非完成态页面", wizDoneView.hidden === true);

  console.log("\n结果: " + pass + " 通过, " + fail + " 失败");
  process.exit(fail ? 1 : 0);
}, 1600);
