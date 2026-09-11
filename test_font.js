/* v5.1.3 界面字体切换验证
   ------------------------------------------------------------
   字体走的是「<html data-font="…"> + CSS 变量 --font-ui」这条路，
   和主题（data-theme）完全同构，所以这里主要验证：
     · 默认不写属性（= 系统无衬线），切到 serif / round / mono 会正确写属性
     · 选择会落盘（data.font），重启后保持；非法值回落到 sans
     · 弹层里 4 个选项都渲染出来，选中态跟着走，说明文案同步
   真实的字体渲染效果在 jsdom 里测不出来（没有字体度量），只测状态与落盘。 */
const { JSDOM } = require("jsdom");
const fs = require("fs");

const html = fs.readFileSync("index.html", "utf8").replace(/<link rel="stylesheet"[^>]*>/g, "");
const cfgjs = fs.readFileSync("js/cloud-config.js", "utf8");
const cloudjs = fs.readFileSync("js/cloud.js", "utf8");
const socialjs = fs.readFileSync("js/social.js", "utf8");
const calcjs = fs.readFileSync("js/calc.js", "utf8");
const appjs = fs.readFileSync("js/app.js", "utf8");

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("✓ " + name); }
  else { fail++; console.log("✗ " + name + (detail ? "   → " + detail : "")); }
}

const SEED = {
  profileDone: true, username: "小明", weight: 72, height: 180, age: 25, gender: "male",
  scene: "home", theme: "snow", wallpaper: "", records: {}, tasks: {}, plan: null, recDismiss: {}, wizResume: 0
};
function boot(seed) {
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "http://localhost:8080/" });
  const { window } = dom;
  const RealDate = window.Date;
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(2026, 0, 5); else super(...a); } // 2026-01-05 周一
  }
  window.Date = FakeDate;
  window.confirm = () => true;
  window.alert = () => {};
  window.requestAnimationFrame = function (cb) { return setTimeout(function () { try { cb(); } catch (e) {} }, 0); };
  window.localStorage.setItem("fitapp_data", JSON.stringify(Object.assign({}, SEED, seed || {})));
  Object.defineProperty(window.document, "hidden", { value: false, configurable: true });
  /* 本用例不碰云端：注入空配置，FitCloud 会保持未配置状态（纯本地模式） */
  window.eval(cfgjs);
  window.eval(cloudjs);
  window.eval(socialjs);
  window.FIT_CLOUD_CONFIG = null;
  window.eval(calcjs);
  window.eval(appjs);
  try { window.document.dispatchEvent(new window.Event("DOMContentLoaded")); } catch (e) {}
  return { window: window, document: window.document };
}
const tick = async function (n) { for (var i = 0; i < (n || 25); i++) await new Promise(function (r) { setTimeout(r, 0); }); };

(async function run() {

/* ==================== A. 默认：系统无衬线 ==================== */
var T = boot({});
var doc = T.document;
var root = doc.documentElement;
await tick(30);
ok("A · 默认不写 data-font（走系统无衬线）", !root.hasAttribute("data-font"), root.getAttribute("data-font"));
ok("A · 提供 4 种字体方案", T.window.__fit.FONTS.length === 4);
ok("A · 方案 key 为 sans/serif/round/mono",
  T.window.__fit.FONTS.map(function (f) { return f.key; }).join(",") === "sans,serif,round,mono");

/* ==================== B. 切换到衬线 ==================== */
T.window.__fit.openTheme();
await tick(10);
var grid = doc.getElementById("fontGrid");
ok("B · 弹层里有字体区", !!grid);
ok("B · 渲染 4 个字体选项", grid.querySelectorAll(".font-item").length === 4);
ok("B · 默认选中「无衬线」",
  grid.querySelectorAll(".font-item.sel").length === 1 &&
  grid.querySelector(".font-item.sel .font-label").textContent === "无衬线");
ok("B · 每个选项都有字样示例", grid.querySelectorAll(".font-sample").length === 4);

var serifItem = grid.querySelectorAll(".font-item")[1];
serifItem.click();
await tick(20);
ok("B · 切到衬线后 <html data-font=serif>", root.getAttribute("data-font") === "serif");
ok("B · 选中态跟着走",
  grid.querySelector(".font-item.sel .font-label").textContent === "衬线");
var stored = JSON.parse(T.window.localStorage.getItem("fitapp_data"));
ok("B · 已写入 localStorage", stored.font === "serif");
ok("B · 说明文案同步", doc.getElementById("fontNote").textContent.indexOf("纸质") !== -1);

/* ==================== C. 圆体 / 等宽数字 ==================== */
grid.querySelectorAll(".font-item")[2].click();
await tick(15);
ok("C · 圆体 → data-font=round", root.getAttribute("data-font") === "round");
grid.querySelectorAll(".font-item")[3].click();
await tick(15);
ok("C · 等宽数字 → data-font=mono", root.getAttribute("data-font") === "mono");
ok("C · 等宽选项的说明是「数字对齐」", doc.getElementById("fontNote").textContent.indexOf("数字") !== -1);
/* 回到无衬线：属性要被移除而不是留一个 data-font="sans" */
grid.querySelectorAll(".font-item")[0].click();
await tick(15);
ok("C · 回到无衬线会移除 data-font 属性", !root.hasAttribute("data-font"), root.getAttribute("data-font"));

/* ==================== D. 重启保持 / 非法值回落 ==================== */
var T2 = boot({ font: "round" });
await tick(30);
ok("D · 重启后字体保持（round）", T2.document.documentElement.getAttribute("data-font") === "round");

var T3 = boot({ font: "不存在的字体" });
await tick(30);
ok("D · 非法字体值回落到无衬线", !T3.document.documentElement.hasAttribute("data-font"),
  T3.document.documentElement.getAttribute("data-font"));

var T4 = boot({ font: "sans" });
await tick(30);
ok("D · 显式 sans 也不写属性", !T4.document.documentElement.hasAttribute("data-font"));

/* 旧备份没有 font 字段 → 不能报错 */
var T5 = boot({});
await tick(30);
ok("D · 旧数据缺 font 字段不报错", !T5.document.documentElement.hasAttribute("data-font"));

console.log("\n结果: " + pass + " 通过, " + fail + " 失败");
process.exit(fail ? 1 : 0);

})();
