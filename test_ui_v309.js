/* 端到端验证：v3.0.10 UI 调整
   - 顶栏改为圆角悬浮卡
   - 「今日任务」标题右侧小「载入」按钮（原「推荐训练」横幅已移除）
   - 当前动作卡布局不再拥挤（状态徽标移到头部行，操作行只留 更换/删除）
   - 今日消耗改为环形图（中心显示总消耗，按运动类型占比着色）
*/
const { JSDOM } = require("jsdom");
const fs = require("fs");

const rawHtml = fs.readFileSync("index.html", "utf8");
const html = rawHtml.replace(/<link rel="stylesheet"[^>]*>/g, "");
const appjs = fs.readFileSync("js/app.js", "utf8");
const css = fs.readFileSync("css/style.css", "utf8");

const dom = new JSDOM(html, { runScripts: "outside-only", url: "http://localhost:8080/" });
const { window } = dom;
const { document } = window;
const RealDate = window.Date;
// 2026-01-05 是周一（训练日 A，会自动排程今日任务）
class FakeDate extends RealDate { constructor(...a) { if (a.length === 0) super(2026, 0, 5); else super(...a); } }
window.Date = FakeDate;
window.confirm = () => true;
window.alert = () => {};
window.requestAnimationFrame = function () { return 0; };

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log("✓ " + name); } else { fail++; console.log("✗ " + name); } }

window.eval(appjs);
try { document.dispatchEvent(new window.Event("DOMContentLoaded")); } catch (e) { console.log("EVAL ERROR:", e.message); }

/* ---------- 1. 顶栏：圆角悬浮卡（静态 CSS） ---------- */
const headerRule = (css.match(/\.app-header\s*\{[^}]*\}/) || [""])[0];
ok("顶栏规则含 border-radius", /border-radius:\s*\d+px/.test(headerRule));
ok("顶栏规则含外边距(悬浮)", /margin:\s*calc\(/.test(headerRule));

/* ---------- 2. 「载入」按钮替代推荐横幅 ---------- */
ok("存在「载入」按钮 #taskLoadBtn", !!document.getElementById("taskLoadBtn"));
ok("旧推荐横幅 #recoBanner 已移除", !document.getElementById("recoBanner"));
ok("「载入」按钮位于今日任务标题行内", !!document.querySelector(".section-title-row #taskLoadBtn"));
ok("section-title-row 为 flex 行布局", /\.section-title-row\s*\{[^}]*display:\s*flex/.test(css));
ok("存在 .sec-load-btn 样式(圆角)", /\.sec-load-btn\s*\{[^}]*border-radius/.test(css));

/* ---------- 3. 当前动作卡布局（消除拥挤） ---------- */
const cur = document.getElementById("taskCurrent");
ok("当前动作卡已渲染", !!cur.querySelector(".task-current-card"));
ok("当前动作卡含 .tc-head 头部行", !!cur.querySelector(".tc-head"));
ok("状态徽标位于头部行内", !!cur.querySelector(".tc-head .task-status"));
ok("操作行内不再有状态徽标(不再拥挤)", !cur.querySelector(".tc-actions .task-status"));
ok("操作行含 更换动作 按钮", !!cur.querySelector(".tc-actions .tc-replace"));
ok("操作行含 删除 按钮", !!cur.querySelector(".tc-actions .tc-del"));
ok("CSS .tc-actions 有上间距", /\.tc-actions\s*\{[^}]*margin-top:\s*\d+px/.test(css));
ok("CSS .task-fields 间距加大(gap:10px)", /\.task-fields\s*\{[^}]*gap:\s*10px/.test(css));
ok("CSS .task-fields 标签与输入框间距加大(gap:6px)", /\.task-fields \.tf\s*\{[^}]*gap:\s*6px/.test(css));

/* ---------- 4. 今日消耗：环形图 ---------- */
const ring = document.getElementById("calRing");
ok("存在环形图容器 #calRing", !!ring);
ok("环形图渲染出弧段 circle", ring.innerHTML.indexOf("<circle") !== -1);
ok("弧段按类型着色(含 stroke 颜色)", /stroke="#[0-9A-Fa-f]{3,6}"/.test(ring.innerHTML));
ok("含底色轨道 ring-track", ring.innerHTML.indexOf("ring-track") !== -1);
ok("中心显示总消耗数字", /^\d+$/.test(document.getElementById("calSumNum").textContent.trim()));
ok("图例渲染出条目(>0)", document.querySelectorAll("#calTypeLegend .cal-legend-item").length > 0);
ok("图例含各类型数值", /\d/.test(document.getElementById("calTypeLegend").textContent));

/* ---------- 5. 点「载入」可生成今日任务 ---------- */
document.getElementById("taskLoadBtn").click();
const prog = document.getElementById("taskProgress").textContent.trim();
ok("点「载入」后今日任务非空 (" + prog + ")", /\/[1-9]/.test(prog));

console.log("\n结果: " + pass + " 通过, " + fail + " 失败");
process.exit(fail ? 1 : 0);
