const { JSDOM } = require("jsdom");
const fs = require("fs");

const html = fs.readFileSync("index.html", "utf8").replace(/<link rel="stylesheet"[^>]*>/g, "");
const appjs = fs.readFileSync("js/app.js", "utf8");
const calcjs = fs.readFileSync("js/calc.js", "utf8");

const dom = new JSDOM(html, { runScripts: "outside-only", url: "http://localhost:8080/" });
const { window } = dom;
class FakeDate extends window.Date {
  constructor(...a) { if (a.length === 0) super(2026, 0, 5); else super(...a); } // 2026-01-05 周一(训练日)
}
window.Date = FakeDate;
window.confirm = () => true;
window.alert = () => {};
window.requestAnimationFrame = () => 0;
window.cancelAnimationFrame = () => {};

window.eval(calcjs); window.eval(appjs);
window.document.dispatchEvent(new window.Event("DOMContentLoaded"));

let pass = 0, fail = 0;
function ok(c, n) { if (c) { pass++; console.log("✓ " + n); } else { fail++; console.log("✗ " + n); } }
const $ = (id) => window.document.getElementById(id);
const click = (el) => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
const key = (el, k) => el.dispatchEvent(new window.KeyboardEvent("keydown", { key: k, bubbles: true }));
const store = () => JSON.parse(window.localStorage.getItem("fitapp_data") || "{}");

// ---------- 1. 默认值 ----------
ok($("headerTitle").textContent === "健身打卡", "默认 header 显示「健身打卡」");
ok(window.__fit.getData().appTitle === "健身打卡", "blankData.appTitle 默认「健身打卡」");

// ---------- 2. 统计页输入框 → header 实时同步 + 持久化 ----------
$("inpAppTitle").value = "我的训练";
$("inpAppTitle").dispatchEvent(new window.Event("input", { bubbles: true }));
ok($("headerTitle").textContent === "我的训练", "改应用标题后 header 实时同步");
ok(window.__fit.getData().appTitle === "我的训练", "改应用标题后 data.appTitle 持久化");

// ---------- 3. 空串回退默认（避免顶部空白） ----------
$("inpAppTitle").value = "   ";
$("inpAppTitle").dispatchEvent(new window.Event("input", { bubbles: true }));
ok($("headerTitle").textContent === "健身打卡", "空串回退到默认「健身打卡」");
ok(window.__fit.getData().appTitle === "健身打卡", "空串 data.appTitle 回退默认");

// ---------- 4. header 标题原位点击编辑 ----------
ok($("headerTitleEdit") !== null, "存在 header 原位编辑输入框");
ok(!$("headerTitleEdit").classList.contains("show"), "初始状态编辑框隐藏");

click($("headerTitle"));
ok($("headerTitle").hidden === true, "点击标题后标题文本隐藏");
ok($("headerTitleEdit").classList.contains("show"), "点击标题后编辑框显示");
ok($("headerTitleEdit").value === "健身打卡", "编辑框预填当前标题");

// 编辑态下重复点击不应出问题（防重入）
click($("headerTitle"));
ok($("headerTitleEdit").classList.contains("show") && $("headerTitle").hidden === true, "编辑态下重复点击标题不异常");

// Enter 确认
$("headerTitleEdit").value = "每日打卡";
key($("headerTitleEdit"), "Enter");
ok($("headerTitle").hidden === false, "Enter 后标题文本恢复显示");
ok(!$("headerTitleEdit").classList.contains("show"), "Enter 后编辑框收起");
ok($("headerTitle").textContent === "每日打卡", "Enter 确认后 header 显示新标题");
ok(window.__fit.getData().appTitle === "每日打卡", "Enter 确认后 data.appTitle 更新");
ok(store().appTitle === "每日打卡", "Enter 确认后写入 localStorage");

// Escape 取消：值不应改变
click($("headerTitle"));
$("headerTitleEdit").value = "临时改的名字";
key($("headerTitleEdit"), "Escape");
ok(window.__fit.getData().appTitle === "每日打卡", "Escape 取消后 appTitle 不变");
ok($("headerTitle").textContent === "每日打卡", "Escape 取消后 header 文本不变");
ok($("headerTitle").hidden === false, "Escape 后标题文本恢复显示");

// 失焦确认
click($("headerTitle"));
ok($("headerTitleEdit").value === "每日打卡", "再次进入编辑时预填最新标题");
$("headerTitleEdit").value = "失焦也要保存";
$("headerTitleEdit").dispatchEvent(new window.Event("blur"));
ok(window.__fit.getData().appTitle === "失焦也要保存", "失焦后自动确认保存");
ok($("headerTitle").textContent === "失焦也要保存", "失焦后 header 同步新标题");
ok(!$("headerTitleEdit").classList.contains("show"), "失焦后编辑框收起");

// 编辑态输入空串 → 回退默认
click($("headerTitle"));
$("headerTitleEdit").value = "   ";
key($("headerTitleEdit"), "Enter");
ok(window.__fit.getData().appTitle === "健身打卡", "原位编辑空串回退默认「健身打卡」");
ok($("headerTitle").textContent === "健身打卡", "原位编辑空串 header 显示默认");

// 未进入编辑态时触发 commit 不应误改数据
$("inpAppTitle").value = "不该被改";
$("inpAppTitle").dispatchEvent(new window.Event("input", { bubbles: true }));
$("headerTitleEdit").dispatchEvent(new window.Event("blur"));
ok(window.__fit.getData().appTitle === "不该被改", "未在编辑态时 blur 不会误改标题");

// ---------- 5. 旧数据迁移（用全新 DOM，避免重复 eval 造成监听器串味） ----------
{
  const dom2 = new JSDOM(html, { runScripts: "outside-only", url: "http://localhost:8080/" });
  const w2 = dom2.window;
  class FakeDate2 extends w2.Date {
    constructor(...a) { if (a.length === 0) super(2026, 0, 5); else super(...a); }
  }
  w2.Date = FakeDate2;
  w2.confirm = () => true;
  w2.alert = () => {};
  w2.requestAnimationFrame = () => 0;
  w2.cancelAnimationFrame = () => {};

  w2.eval(calcjs); w2.eval(appjs);
  const oldObj = JSON.parse(JSON.stringify(w2.__fit.blankData()));
  delete oldObj.appTitle;                 // 模拟 v5.1.0 之前的旧数据
  oldObj.username = "fairy";
  w2.localStorage.setItem("fitapp_data", JSON.stringify(oldObj));
  w2.eval(appjs);                         // 重新加载 → load() 读旧数据
  w2.document.dispatchEvent(new w2.Event("DOMContentLoaded"));

  ok(w2.__fit.getData().appTitle === "健身打卡", "旧数据无 appTitle 字段时 load() 迁移补默认");
  ok(w2.document.getElementById("headerTitle").textContent === "健身打卡", "迁移后 header 显示默认标题");
  ok(w2.document.getElementById("inpAppTitle").value === "健身打卡", "迁移后设置页输入框回填默认");
}

console.log("\n结果: " + pass + " 通过, " + fail + " 失败");
process.exit(fail ? 1 : 0);
