/* 端到端验证：打卡后新增动作取消“已完成”；只有全部完成才显示成功；完成页不再破坏向导结构 v2.8.2 */
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

const checkinText = document.getElementById("checkinText");
const taskList = document.getElementById("taskList");
const wizCount = document.getElementById("wizCount");

/* ---------- PART B：完成最后一个但前面仍有未完成 -> 不结束打卡 ---------- */
document.getElementById("checkinBtn").click();
ok("B0 向导正常打开", document.getElementById("wizard").hidden === false);
document.getElementById("wizDone").click(); // 第1项完成 -> 第2项
document.getElementById("wizDone").click(); // 第2项完成 -> 第3项
document.getElementById("wizDone").click(); // 第3项完成 -> 第4项(index3, 未完成)
document.getElementById("wizNext").click(); // 翻到第5项(index4)
document.getElementById("wizDone").click(); // 完成末项，但第4项未完成
ok("B1 完成末项但有未完成 -> 向导不结束(仍打开)", document.getElementById("wizard").hidden === false);
ok("B2 自动跳回未完成的第4项 (4 / 5)", wizCount.textContent.trim() === "4 / 5");
document.getElementById("wizDone").click(); // 完成第4项 -> 全部完成
setTimeout(function () {
  ok("B3 全部完成后显示已打卡", checkinText.textContent.indexOf("已打卡") !== -1);
  partA();
}, 1600);

/* ---------- PART A：完成打卡后再新增动作 -> 取消“已完成”，全部完成才再成功 ---------- */
function partA() {
  const total0 = taskList.children.length;

  // 重新进入向导（已完成态），确认结构完整、不报错
  document.getElementById("checkinBtn").click();
  ok("A0 重开向导结构完整(无崩溃)", document.getElementById("wizard").hidden === false && !!document.getElementById("wizActionName"));
  for (let i = 0; i < total0; i++) document.getElementById("wizDone").click();
  setTimeout(function () {
    ok("A1 全部完成显示已打卡", checkinText.textContent.indexOf("已打卡") !== -1);
    const before = document.getElementById("todayActions").children.length;
    ok("A2 打卡后今日动作记录=" + total0, before === total0);

    // 模拟“从动作库添加”一个动作
    document.getElementById("addExerciseBtn").click();
    const row = document.querySelector("#libList .lib-item");
    ok("A3 动作库弹层有可点项", !!row);
    row.click();

    ok("A4 新增后首页回到“今日打卡”(已取消完成)", checkinText.textContent.indexOf("今日打卡") !== -1 && checkinText.textContent.indexOf("已打卡") === -1);
    ok("A5 任务数 +1", taskList.children.length === total0 + 1);
    ok("A6 今日动作记录含新动作(共" + (total0 + 1) + ")", document.getElementById("todayActions").children.length === total0 + 1);

    // 再进入向导 -> 应跳到新增的未完成动作（末项）
    document.getElementById("checkinBtn").click();
    ok("A7 重进停在新动作(末项 " + (total0 + 1) + "/" + (total0 + 1) + ")", wizCount.textContent.trim() === (total0 + 1) + " / " + (total0 + 1));
    ok("A8 新动作显示未完成", taskList.children[total0].querySelector(".task-status").textContent.indexOf("未完成") !== -1);

    document.getElementById("wizDone").click(); // 完成新动作 -> 全部完成
    setTimeout(function () {
      ok("A9 全部完成后再次显示已打卡", checkinText.textContent.indexOf("已打卡") !== -1);
      console.log("\n结果: " + pass + " 通过, " + fail + " 失败");
      process.exit(fail ? 1 : 0);
    }, 1600);
  }, 1600);
}
