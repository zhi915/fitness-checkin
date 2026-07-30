const { JSDOM } = require("jsdom");
const fs = require("fs");

const html = fs.readFileSync("index.html", "utf8").replace(/<link rel="stylesheet"[^>]*>/g, "");
const appjs = fs.readFileSync("js/app.js", "utf8");

const dom = new JSDOM(html, { runScripts: "outside-only", url: "http://localhost:8080/" });
const { window } = dom;
const RealDate = window.Date;
class FakeDate extends RealDate {
  constructor(...a) { if (a.length === 0) super(2026, 0, 5); else super(...a); } // 2026-01-05 = 周一(训练日)
}
window.Date = FakeDate;
window.confirm = () => true;
window.alert = () => {};
window.requestAnimationFrame = (cb) => cb();
window.setTimeout = (cb) => cb(); // 让向导关闭定时器立即执行，便于断言

window.eval(appjs);
window.document.dispatchEvent(new window.Event("DOMContentLoaded"));

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log("✓ " + name); } else { fail++; console.log("✗ " + name); } }

const $ = (id) => window.document.getElementById(id);

// 1. 自动排程：训练日应有今日任务
ok($("taskList").querySelectorAll(".task-item").length > 0, "训练日自动生成今日任务");
const firstTask = $("taskList").querySelector(".task-item .task-text").textContent;

// 2. 点击今日打卡 -> 打开向导
$("checkinBtn").click();
ok($("wizard").hidden === false, "点击今日打卡打开分步向导");
ok($("wizActionName").textContent === firstTask, "向导显示第一个动作名称");

// 3. 滚轮已渲染
ok($("wheelItemsW").children.length > 0, "重量滚轮已渲染选项");
ok($("wheelItemsS").children.length === 10, "组数滚轮 1-10");
ok($("wheelItemsR").children.length === 30, "次数滚轮 1-30");

// 4. 进度与计数
ok($("wizCount").textContent.indexOf("/") > 0, "显示进度计数 x / N");

// 5. 点击「下一个」推进
const total = $("taskList").querySelectorAll(".task-item").length;
for (let i = 1; i < total; i++) $("wizNext").click();
ok($("wizNext").textContent === "完成", "最后一步按钮变为「完成」");

// 6. 完成 -> 写入打卡记录
$("wizNext").click();
const rec = JSON.parse(window.localStorage.getItem("fitapp_data")).records["2026-01-05"];
ok(rec && rec.checkedIn === true, "完成向导后今日已打卡");
ok(rec && rec.actions && rec.actions.length === total, "打卡记录包含全部动作内容");
ok(rec && rec.actions.every(a => a.done === true), "动作均标记为已完成");

// 7. 向导关闭 + 成功提示
ok($("wizard").hidden === true, "打卡后向导关闭");

// 8. 休息日：无任务直接打卡
class FakeSun extends RealDate { constructor(...a){ if(a.length===0) super(2026,0,4); else super(...a);} } // 周日
window.Date = FakeSun;
window.localStorage.clear();
window.eval(appjs);
window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
$("checkinBtn").click();
ok($("wizBody").classList.contains("empty"), "休息日向导显示空状态");
$("wizNext").click();
const rec2 = JSON.parse(window.localStorage.getItem("fitapp_data")).records["2026-01-04"];
ok(rec2 && rec2.checkedIn === true, "休息日完成打卡成功");

console.log("\n结果: " + pass + " 通过, " + fail + " 失败");
process.exit(fail ? 1 : 0);
