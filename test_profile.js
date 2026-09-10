/* 端到端验证：默认信息引导（首启填写性别/体重/身高/年龄）*/
const { JSDOM } = require("jsdom");
const fs = require("fs");

const html = fs.readFileSync("index.html", "utf8").replace(/<link rel="stylesheet"[^>]*>/g, "");
const appjs = fs.readFileSync("js/app.js", "utf8");

const dom = new JSDOM(html, { runScripts: "outside-only", url: "http://localhost:8080/" });
const { window } = dom;
const { document } = window;
const RealDate = window.Date;
class FakeDate extends RealDate { constructor(...a) { if (a.length === 0) super(2026, 0, 5); else super(...a); } }
window.Date = FakeDate;
window.confirm = () => true;
window.alert = () => {};

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log("✓ " + name); } else { fail++; console.log("✗ " + name); } }
const $ = (id) => document.getElementById(id);

// 用可控的 setTimeout 捕获首启延迟弹窗
let pending = [];
const realSetTimeout = window.setTimeout;
window.setTimeout = function (cb) { pending.push(cb); return 0; };

try { window.eval(appjs); document.dispatchEvent(new window.Event("DOMContentLoaded")); }
catch (e) { console.log("EVAL ERROR:", e.message); }

// 1. 首次进入：推迟回调里有打开弹窗（初始 hidden=true）
ok("首次进入前弹窗默认隐藏", $("profileOverlay").hidden === true);
ok("首启注册了延迟打开回调", pending.length > 0);
pending.forEach(cb => cb());   // 执行延迟回调 -> 打开弹窗
ok("首启弹窗已打开", $("profileOverlay").hidden === false);

// 2. 弹窗默认值回显（默认男 / 72 / 180 / 25）
ok("默认性别=男", $("profileGender").querySelector('button[data-gender="male"]').classList.contains("sel"));
ok("默认体重回显 72", String($("profileWeight").value) === "72");
ok("默认身高回显 180", String($("profileHeight").value) === "180");
ok("默认年龄回显 25", String($("profileAge").value) === "25");
ok("存在用户名输入框", !!$("profileName"));
ok("用户名默认为空", String($("profileName").value) === "");

// 2b. 填写用户名 -> 首页问候带上用户名
$("profileName").value = "小健";
$("profileSave").click();
ok("保存后首页问候带上用户名", $("heroGreet").textContent.indexOf("小健") === 0);
const storedName = JSON.parse(window.localStorage.getItem("fitapp_data")).username;
ok("用户名已保存", storedName === "小健");
ok("设置页用户名同步", String($("inpName").value) === "小健");

// 设置页改名 -> 首页问候实时更新
$("inpName").value = "阿强";
$("inpName").dispatchEvent(new window.Event("input"));
ok("设置页改名后首页问候同步", $("heroGreet").textContent.indexOf("阿强") === 0);

// 重新打开弹窗应回显用户名
$("editProfileBtn").click();
ok("重开弹窗回显用户名", String($("profileName").value) === "阿强");
$("profileSkip").click();

// 复位为无用户名以便后续断言不受影响

// 3. 改为 女 / 60 / 165 / 30 并保存
$("profileGender").querySelector('button[data-gender="female"]').click();
ok("切换性别为女(高亮)", $("profileGender").querySelector('button[data-gender="female"]').classList.contains("sel"));
$("profileWeight").value = "60";
$("profileHeight").value = "165";
$("profileAge").value = "30";
$("profileSave").click();
ok("保存后弹窗关闭", $("profileOverlay").hidden === true);

const stored = JSON.parse(window.localStorage.getItem("fitapp_data"));
ok("性别已保存为 female", stored.gender === "female");
ok("体重已保存为 60", stored.weight === 60);
ok("身高已保存为 165", stored.height === 165);
ok("年龄已保存为 30", stored.age === 30);
ok("profileDone 标记为 true", stored.profileDone === true);

// 4. 设置页输入框已同步
ok("设置页体重同步为 60", String($("inpWeight").value) === "60");
ok("设置页身高同步为 165", String($("inpHeight").value) === "165");
ok("设置页性别控件同步为女", $("genderToggle").querySelector('button[data-gender="female"]').classList.contains("sel"));

// 5. 重新加载：profileDone=true 时不再自动弹
const dom2 = new JSDOM(html, { runScripts: "outside-only", url: "http://localhost:8080/" });
const w2 = dom2.window;
w2.Date = FakeDate; w2.confirm = () => true; w2.alert = () => {};
// 复用同一份 localStorage 内容
const store = {};
w2.localStorage.setItem("fitapp_data", JSON.stringify(stored));
let pending2 = [];
w2.setTimeout = function (cb) { pending2.push(cb); return 0; };
w2.eval(appjs);
w2.document.dispatchEvent(new w2.Event("DOMContentLoaded"));
pending2.forEach(cb => cb());
ok("已完成信息后不再自动弹窗", w2.document.getElementById("profileOverlay").hidden === true);

// 6. 通过「完善个人信息」按钮手动打开
w2.document.getElementById("editProfileBtn").click();
ok("点击完善个人信息可手动打开弹窗", w2.document.getElementById("profileOverlay").hidden === false);
ok("手动打开时回显已保存的体重 60", String(w2.document.getElementById("profileWeight").value) === "60");
ok("手动打开时回显已保存的性别 女", w2.document.getElementById("profileGender").querySelector('button[data-gender="female"]').classList.contains("sel"));

// 7. 跳过按钮：关闭且标记 profileDone
const dom3 = new JSDOM(html, { runScripts: "outside-only", url: "http://localhost:8080/" });
const w3 = dom3.window;
w3.Date = FakeDate; w3.confirm = () => true; w3.alert = () => {};
let pending3 = [];
w3.setTimeout = function (cb) { pending3.push(cb); return 0; };
w3.eval(appjs);
w3.document.dispatchEvent(new w3.Event("DOMContentLoaded"));
pending3.forEach(cb => cb());
w3.document.getElementById("profileSkip").click();
ok("跳过按钮关闭弹窗", w3.document.getElementById("profileOverlay").hidden === true);
const stored3 = JSON.parse(w3.localStorage.getItem("fitapp_data"));
ok("跳过后 profileDone=true（不再重复弹）", stored3.profileDone === true);

console.log("\n结果: " + pass + " 通过, " + fail + " 失败");
process.exit(fail ? 1 : 0);
