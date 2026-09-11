/* 无登录版自测：打开即进入主界面，无登录页，核心功能可运行 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const root = __dirname;
let html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const appjs = fs.readFileSync(path.join(root, "js", "app.js"), "utf8");
const calcjs = fs.readFileSync(path.join(root, "js", "calc.js"), "utf8");

// 剥掉外部 css / 外部 script（避免 jsdom 去 fetch 网络资源），改为内联 calc.js + app.js
html = html.replace(/<link[^>]*stylesheet[^>]*>/g, "");
html = html.replace(/<script src="js\/(app|calc)\.js[^"]*"><\/script>/g, "");
html = html.replace("</body>", "<script>\n" + calcjs + "\n</script>\n<script>\n" + appjs + "\n</script></body>");

const dom = new JSDOM(html, {
  runScripts: "dangerously",
  url: "http://localhost/",
  pretendToBeVisual: true,
});
const { window } = dom;
const doc = window.document;

let pass = 0, fail = 0;
function assert(c, m) {
  if (c) { console.log("✓ " + m); pass++; }
  else { console.log("✗ " + m); fail++; }
}

// 给一个内存版 localStorage（部分 jsdom 默认无），确保 load/save 正常工作
if (!window.localStorage) {
  const store = {};
  window.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
}

setTimeout(function () {
  assert(!doc.getElementById("authScreen"), "登录页 authScreen 已彻底移除");
  const app = doc.getElementById("app");
  assert(!!app, "主界面 #app 存在");
  assert(!/display\s*:\s*none/.test(app.getAttribute("style") || ""), "#app 没有 display:none（默认可见）");
  const ver = doc.getElementById("appVersion");
  assert(ver && /5\.1\.3/.test(ver.textContent), "顶栏版本号显示 v5.1.3（实际：" + (ver && ver.textContent) + "）");
  const loadBtn = doc.getElementById("taskLoadBtn");
  assert(!!loadBtn, "「今日任务」标题右侧有「载入」按钮");
  assert(!doc.getElementById("recoBanner"), "旧推荐横幅已移除");
  // 模拟点击“今日打卡”能否打开打卡向导
  const wiz = doc.getElementById("wizard");
  doc.getElementById("checkinBtn").dispatchEvent(new window.Event("click"));
  assert(wiz && !wiz.hidden, "点击打卡按钮可打开打卡向导");
  // 退出/切换按钮应不存在
  assert(!doc.getElementById("logoutBtn"), "不存在“退出”按钮（无登录）");

  console.log("\n结果: " + pass + " 通过, " + fail + " 失败");
  process.exit(fail === 0 ? 0 : 1);
}, 200);
