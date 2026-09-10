/* 端到端验证：旧版（GitHub Pages 上 v2.4.0）残留数据 “已打卡=true 但动作未完成” 的自愈
   目标：打开 App 后绝不能显示“今日打卡完成”，且重新进入向导不显示完成页 v2.8.2 */
const { JSDOM } = require("jsdom");
const fs = require("fs");

const html = fs.readFileSync("index.html", "utf8").replace(/<link rel="stylesheet"[^>]*>/g, "");
const appjs = fs.readFileSync("js/app.js", "utf8");

// 预置“旧版残留”数据：已打卡=true，但还有 2 个未完成动作
const stale = {
  records: { "2026-01-05": { date: "2026-01-05", checkedIn: true, exercises: [] } },
  tasks: {
    "2026-01-05": [
      { id: "a1", text: "哑铃卧推 4组 × 8-10", done: false, w: "", s: "4", r: "8" },
      { id: "a2", text: "杠铃深蹲 4组 × 8-10", done: false, w: "", s: "4", r: "8" }
    ]
  },
  plan: null, recDismiss: {}, wizResume: 0
};

const dom = new JSDOM(html, { runScripts: "outside-only", url: "http://localhost:8080/" });
const { window } = dom;
const { document } = window;

// 用 FakeDate 固定为 2026-01-05（与预置数据同一天），确保今天=残留数据那天
const RealDate = window.Date;
class FakeDate extends RealDate {
  constructor(...a) { if (a.length === 0) super(2026, 0, 5); else super(...a); }
}
window.Date = FakeDate;
window.localStorage.setItem("fitapp_data", JSON.stringify(stale));
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

const checkinText = document.getElementById("checkinText");
const taskList = document.getElementById("taskList");

ok("A0 残留数据已载入(任务数=2)", (document.getElementById("taskCurrent").querySelector(".task-current-card") ? 1 : 0) + taskList.children.length === 2);
ok("A1 打开即自愈：首页不显示“已打卡”", checkinText.textContent.indexOf("已打卡") === -1);
ok("A2 首页显示“今日打卡”(未完成态)", checkinText.textContent.indexOf("今日打卡") !== -1);

// 重新进入今日打卡 -> 必须是动作步骤页，绝不能显示“今日打卡完成”完成页
document.getElementById("checkinBtn").click();
ok("B0 向导打开且显示动作步骤(wizBody可见)", document.getElementById("wizard").hidden === false && document.getElementById("wizBody").hidden === false);
ok("B1 完成页 wizDoneView 已隐藏", document.getElementById("wizDoneView").hidden === true);
ok("B2 停在第一个未完成动作(1 / 2)", document.getElementById("wizCount").textContent.trim() === "1 / 2");
ok("B3 动作显示“未完成”", document.getElementById("taskCurrent").querySelector(".task-status").textContent.indexOf("未完成") !== -1);

// 完成全部 -> 才显示成功
document.getElementById("wizDone").click();
document.getElementById("wizDone").click();
setTimeout(function () {
  ok("C0 全部完成后才显示“已打卡”", checkinText.textContent.indexOf("已打卡") !== -1);
  console.log("\n结果: " + pass + " 通过, " + fail + " 失败");
  process.exit(fail ? 1 : 0);
}, 1600);
