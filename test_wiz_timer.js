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
// rAF / cancel: noop（避免 tick 递归），手动调 tickWizTimer 推进时间
window.requestAnimationFrame = () => 0;
window.cancelAnimationFrame = () => {};
// AudioContext 在 jsdom 不存在，函数内部已 try/catch，不需要 mock

// performance.now 模拟：base + mockSeconds*1000，advance 手动推进
let mockSeconds = 0;
const PERF_BASE = 1000;
window.performance = window.performance || {};
window.performance.now = () => PERF_BASE + mockSeconds * 1000;

window.eval(calcjs); window.eval(appjs);
window.document.dispatchEvent(new window.Event("DOMContentLoaded"));

let pass = 0, fail = 0;
function ok(c, n) { if (c) { pass++; console.log("✓ " + n); } else { fail++; console.log("✗ " + n); } }
const $ = (id) => window.document.getElementById(id);

function advance(n) { mockSeconds += n; window.__fit.tickWizTimer(); }
function state() { return window.__fit.wizTimerState; }

/* ===== A. 计时器核心状态机 ===== */

// 1. 初始化
window.__fit.initWizTimer(60);
ok(state().duration === 60 && state().remaining === 60, "initWizTimer(60) duration/remaining=60");
ok(state().running === false && state().finished === false, "init 后未运行未完成");
ok($("wizTimerNum").textContent === "01:00", "init 后显示 01:00");
ok($("wizTimerLbl").textContent === "点击圆圈开始", "init 后 label「点击圆圈开始」");

// 2. start（经 toggleWizTimer，模拟点圆圈）
window.__fit.toggleWizTimer();
ok(state().running === true, "点圆圈后 running=true");
ok($("wizTimerLbl").textContent === "点击圆圈暂停", "运行中 label「点击圆圈暂停」");
ok($("wizTimerRing").classList.contains("running"), "运行中圆环带 .running 样式");

// 3. 推进时间
advance(1);
ok(state().remaining === 59 && $("wizTimerNum").textContent === "00:59", "1 tick 后 remaining=59 / 显示 00:59");
advance(9);
ok(Math.abs(state().remaining - 50) < 0.001, "10 ticks 后 remaining=50");

// 4. 再点圆圈 → 暂停
window.__fit.toggleWizTimer();
ok(state().running === false, "再点圆圈后 running=false（暂停）");
ok($("wizTimerLbl").textContent === "点击圆圈继续", "暂停中 label「点击圆圈继续」");

// 5. 再点圆圈 → 继续
window.__fit.toggleWizTimer();
ok(state().running === true, "再点圆圈恢复运行");
advance(50);
ok(state().remaining === 0 && state().finished === true, "倒计时到 0 → finished=true");
ok(state().running === false, "倒计时到 0 → running=false");
ok($("wizTimerLbl").textContent === "时间到！再点一下重新开始", "完成 label「时间到！…」");
ok($("wizTimerBar").classList.contains("done"), "完成进度环带 .done（绿）");

// 6. finished 后再点圆圈 → 重置并重新开始
window.__fit.toggleWizTimer();
ok(state().remaining === 60 && state().running === true && state().finished === false, "finished 后点圆圈 → 重置为 60 并重新运行");

// 7. formatWizTimer 边界
ok(window.__fit.formatWizTimer(0) === "00:00", "formatWizTimer(0)=00:00");
ok(window.__fit.formatWizTimer(65) === "01:05", "formatWizTimer(65)=01:05");
ok(window.__fit.formatWizTimer(3599) === "59:59", "formatWizTimer(3599)=59:59");
ok(window.__fit.formatWizTimer(-5) === "00:00", "formatWizTimer(-5) 防御负数");
ok(window.__fit.formatWizTimer(NaN) === "00:00", "formatWizTimer(NaN) 防御");

// 8. 防御：duration=0
window.__fit.initWizTimer(0);
ok(state().duration === 0 && $("wizTimerLbl").textContent === "—", "duration=0 时 label「—」（防御）");

// 9. stopWizTimer(true) 停止并恢复
window.__fit.initWizTimer(30);
window.__fit.startWizTimer();
window.__fit.stopWizTimer(true);
ok(state().running === false && state().remaining === 30, "stopWizTimer(true) 停止并恢复 remaining=duration");

// 10. 重置按钮
window.__fit.startWizTimer();
advance(10);
window.__fit.resetWizTimer();
ok(state().remaining === 30 && state().running === false && state().finished === false, "重置按钮恢复 remaining=duration 且停止");

// 11. timerAlarm / beep 不抛错
let threw = false;
try { window.__fit.timerAlarm(); window.__fit.beep(100, 880); } catch (e) { threw = true; }
ok(threw === false, "timerAlarm/beep 无 AudioContext 时不抛错");

/* ===== B. 向导集成：计时器显隐（无按钮） + 滚轮联动 ===== */

// 构造任务：平板支撑（timed 60s）+ 俯卧撑（非 timed）
const data = window.__fit.getData();
data.wizResume = 0;
data.tasks["2026-01-05"] = [
  { text: "平板支撑", timed: true, weighted: false, s: 3, r: 60 },
  { text: "俯卧撑", timed: false, weighted: false, s: 3, r: 12 }
];
window.__fit.openWizard("2026-01-05");

ok($("wizard").hidden === false, "向导已打开");
ok($("wizTimerBtn") === null, "「开始计时」按钮已删除");
ok($("wizTimerBox").hidden === false, "timed 动作直接显示计时器");
ok(state().duration === 60, "计时器初始化 duration=60（取自任务预设 r）");
ok($("wizActionMeta") === null, "「预设…」行已移除（无 wizActionMeta 元素）");

// 12. 滚轮联动：改秒数 → 计时器时长实时同步
window.__fit.commitWheel("wheelR", 90);
ok(state().duration === 90 && state().remaining === 90, "滚轮改 90s → 计时器实时联动 duration=90");
ok($("wizTimerNum").textContent === "01:30", "联动后显示 01:30");

// 13. 运行中改秒数 → 重置为新时长（防脏状态）
window.__fit.startWizTimer();
advance(5);
window.__fit.commitWheel("wheelR", 45);
ok(state().duration === 45 && state().remaining === 45 && state().running === false, "运行中滚轮改 45s → 计时器重置为新时长");

// 14. hideWizTimer 收回 / 切回 timed 动作重新显示
window.__fit.hideWizTimer();
ok($("wizTimerBox").hidden === true, "hideWizTimer 隐藏计时器");
window.__fit.renderWizardStep();
ok($("wizTimerBox").hidden === false, "timed 动作 renderWizardStep 重新显示计时器");

// 15. 圆圈点击（真实 DOM 事件）→ 开始/暂停
$("wizTimerRing").click();
ok(state().running === true, "点击圆圈（DOM 事件）→ 开始计时");
$("wizTimerRing").click();
ok(state().running === false, "再点圆圈 → 暂停");

// 16. 非 timed 动作：计时器隐藏、计时器停止
window.__fit.navigateNext();
ok($("wizActionName").textContent === "俯卧撑", "切到俯卧撑");
ok($("wizTimerBox").hidden === true, "非 timed 动作隐藏计时器");
ok(state().running === false, "非 timed 动作计时器已停止");

// 18. isTimedTask 识别
ok(window.__fit.isTimedTask({ text: "平板支撑", timed: true, r: 60 }) === true, "isTimedTask timed:true");
ok(window.__fit.isTimedTask({ text: "杠铃深蹲", timed: false, r: 10 }) === false, "isTimedTask timed:false");
ok(window.__fit.isTimedTask({ text: "X", r: "30秒" }) === true, "isTimedTask 含「秒」自动识别");

// 19. completeCurrent 停计时 + 隐藏计时器
window.__fit.navigatePrev(); // 回到平板支撑
ok($("wizTimerBox").hidden === false, "切回 timed 动作计时器重新显示");
window.__fit.startWizTimer();
window.__fit.completeCurrent();
ok(state().running === false, "completeCurrent 停止计时");
ok($("wizTimerBox").hidden === true, "completeCurrent 隐藏计时器");

console.log("\n结果: " + pass + " 通过, " + fail + " 失败");
process.exit(fail ? 1 : 0);
