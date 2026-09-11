const { JSDOM } = require("jsdom");
const fs = require("fs");

const html = fs.readFileSync("index.html", "utf8").replace(/<link rel="stylesheet"[^>]*>/g, "");
const appjs = fs.readFileSync("js/app.js", "utf8");
const calcjs = fs.readFileSync("js/calc.js", "utf8");

const dom = new JSDOM(html, { runScripts: "outside-only", url: "http://localhost:8080/" });
const { window } = dom;
class FakeDate extends window.Date {
  constructor(...a) { if (a.length === 0) super(2026, 0, 5); else super(...a); }
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
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const mkFile = (txt) => new window.File([txt], "backup.json", { type: "application/json" });
const snap = () => JSON.stringify(window.__fit.getData());
const store = () => window.localStorage.getItem("fitapp_data") || "";

// 1. UI 存在
ok($("exportBtn") !== null, "存在「导出数据」按钮");
ok($("importBtn") !== null, "存在「导入数据」按钮");
ok($("importFile") !== null, "存在隐藏的文件选择框");
ok($("importFile").hidden === true, "文件选择框默认隐藏");

const VALID = JSON.stringify({
  tasks: { "2026-01-05": [{ text: "杠铃深蹲", done: true, s: 3, r: 10 }] },
  records: { "2026-01-05": { exercises: [{ type: "strength", name: "杠铃深蹲", duration: 600 }] } },
  username: "老数据",
  appTitle: "我的健身"
});

(async () => {
  // 2. 合法备份导入
  window.__fit.importData(mkFile(VALID));
  await wait(150);
  const d = window.__fit.getData();
  ok(d.username === "老数据", "导入后用户名来自备份");
  ok(d.appTitle === "我的健身", "导入后应用标题来自备份");
  ok(!!(d.tasks && d.tasks["2026-01-05"]), "导入后任务数据来自备份");
  ok(!!(d.records && d.records["2026-01-05"]), "导入后打卡记录来自备份");
  ok(store().indexOf("老数据") >= 0, "导入后已写入 localStorage");
  ok($("headerTitle").textContent === "我的健身", "导入后 header 标题同步");

  // 3. 旧备份缺字段 → 走 load() 迁移补默认
  const OLD = JSON.stringify({ tasks: {}, records: {}, username: "旧版用户" });
  window.__fit.importData(mkFile(OLD));
  await wait(150);
  ok(window.__fit.getData().appTitle === "健身打卡", "旧备份缺 appTitle → 迁移补默认");
  ok(window.__fit.getData().username === "旧版用户", "旧备份用户名保留");
  ok(typeof window.__fit.getData().weight === "number", "旧备份缺体重 → 补默认值");

  // 4. 非法 JSON 不破坏现有数据
  const before = snap();
  window.__fit.importData(mkFile("{这不是 json"));
  await wait(150);
  ok(snap() === before, "非法 JSON 不覆盖现有数据");

  // 5. 没有打卡数据的文件不导入
  window.__fit.importData(mkFile('{"foo":1}'));
  await wait(150);
  ok(snap() === before, "无打卡数据的文件不覆盖");

  // 6. 数组也不接受
  window.__fit.importData(mkFile("[1,2,3]"));
  await wait(150);
  ok(snap() === before, "数组型 JSON 不覆盖");

  // 7. 用户取消确认 → 不导入
  window.confirm = () => false;
  window.__fit.importData(mkFile(VALID));
  await wait(150);
  ok(window.__fit.getData().username === "旧版用户", "取消确认时不导入");
  window.confirm = () => true;

  // 8. 不传文件不报错
  let threw = false;
  try { window.__fit.importData(null); } catch (e) { threw = true; }
  ok(threw === false, "importData(null) 不抛错");

  console.log("\n结果: " + pass + " 通过, " + fail + " 失败");
  process.exit(fail ? 1 : 0);
})();
