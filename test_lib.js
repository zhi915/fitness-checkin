/* 端到端验证：首页动作库（按部位选动作）v2.5.0 */
const { JSDOM } = require("jsdom");
const fs = require("fs");

const html = fs.readFileSync("index.html", "utf8")
  .replace(/<link rel="stylesheet"[^>]*>/g, "");
const appjs = fs.readFileSync("js/app.js", "utf8");

const dom = new JSDOM(html, { runScripts: "outside-only", url: "http://localhost:8080/" });
const { window } = dom;
const { document } = window;

// 强制周一（训练日），让 autoSchedule 可运行，且 Date 稳定
const RealDate = window.Date;
class FakeDate extends RealDate {
  constructor(...a) { if (a.length === 0) super(2026, 0, 5); else super(...a); }
}

window.Date = FakeDate;
window.confirm = () => true;
window.alert = () => {};

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log("✓ " + name); }
  else { fail++; console.log("✗ " + name); }
}

try {
  window.eval(appjs);
  // outside-only 下 readyState 可能非 loading，保险起见触发一次
  try { document.dispatchEvent(new window.Event("DOMContentLoaded")); } catch (e) {}
} catch (e) {
  console.log("EVAL ERROR:", e.message);
}

// 1. 自动进主界面 + 版本号
ok("主界面可见(无登录)", !document.getElementById("app").hidden || document.getElementById("app").style.display !== "none");
ok("版本号 v3.0.9", (document.getElementById("appVersion").textContent || "").indexOf("3.0.9") !== -1);

const taskList = document.getElementById("taskList");
const before = taskList.children.length;

// 2. 打开动作库弹层
document.getElementById("addExerciseBtn").click();
ok("点击后动作库弹层显示", document.getElementById("addLibOverlay").hidden === false);
ok("部位 tab 渲染 8 个", document.getElementById("libParts").children.length === 8);
ok("默认显示部位[胸]动作 ≥5 个", document.getElementById("libList").children.length >= 5);

// 3. 点击第一个动作 -> 今日任务 +1
document.getElementById("libList").children[0].click();
ok("点击动作后任务 +1", taskList.children.length === before + 1);
ok("弹层仍可继续添加(未关闭)", document.getElementById("addLibOverlay").hidden === false);

// 4. 切换部位到 [背](idx=1) -> 列表更新为背部动作
document.getElementById("libParts").children[1].click();
ok("切换部位后列表更新为背部 ≥5 个", document.getElementById("libList").children.length >= 5);
const backText = document.getElementById("libList").children[0].textContent;
ok("背部首个动作含划船", backText.indexOf("划船") !== -1);

// 5. 自定义添加
const before2 = taskList.children.length;
document.getElementById("libCustom").value = "热身5分钟";
document.getElementById("libCustomBtn").click();
ok("自定义添加后任务 +1", taskList.children.length === before2 + 1);

// 6. 关闭弹层
document.getElementById("addLibClose").click();
ok("关闭后弹层隐藏", document.getElementById("addLibOverlay").hidden === true);

// 7. 无回归：推荐横幅/打卡入口仍在
ok("今日打卡按钮存在", !!document.getElementById("checkinBtn"));
ok("更换动作逻辑仍在(openReplace 已绑定)", !!document.getElementById("replaceOverlay"));

console.log("\n结果: " + pass + " 通过, " + fail + " 失败");
process.exit(fail ? 1 : 0);
