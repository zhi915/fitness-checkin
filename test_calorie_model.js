/* 卡路里算法「落地验证」——纯函数单测（Node 直接 require js/calc.js，不经 jsdom/DOM）
   目的：把 v3 时代写在 app.js 里、与全局 data 耦合的公式，改为可用显式入参验证的纯函数后，
        用参考值 + 单调性 + 边界 + 量级 四类断言把它们钉死，防止以后改算法悄悄跑偏。
   模型说明：
     力量训练 = 做功法（有效负荷×位移×次数×组数×g，除以人体效率 0.25，再乘代谢补偿 1.6）+ BMR 摊分
     计时动作 = MET × 体重 × 秒数 × 组数 + BMR 摊分
     有氧等   = MET × 体重 × 分钟数 / 60
*/
const C = require("./js/calc.js");

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log("✓ " + name); }
  else { fail++; console.log("✗ " + name); }
}
function near(a, b, tol) { return typeof a === "number" && Math.abs(a - b) <= (tol == null ? 1e-6 : tol); }

/* ---------- 1. 参数表完整性 ---------- */
const K = C.CALIB;
ok("CALIB 存在且关键参数齐全", K && ["gravity", "joulesPerKcal", "efficiency", "compensation", "restSecPerSet", "displacement", "selfLoadFallback", "bmrMinutesPerDay"].every((k) => typeof K[k] === "number"));
ok("重力=9.8 / 焦耳当量=4184", K.gravity === 9.8 && K.joulesPerKcal === 4184);
ok("人体做功效率在 (0,1)", K.efficiency > 0 && K.efficiency < 1);
ok("自重系数在 (0,1)", K.selfLoadFallback > 0 && K.selfLoadFallback < 1);

/* ---------- 2. BMR（Mifflin-St Jeor）参考值 ---------- */
ok("BMR 男 72kg/180cm/25 → 1725", C.bmrPure(72, 180, 25, "male") === 1725);
ok("BMR 女 72kg/180cm/25 → 1559", C.bmrPure(72, 180, 25, "female") === 1559);
ok("BMR 女 60kg/165cm/30 → 1320.25", near(C.bmrPure(60, 165, 30, "female"), 1320.25));
ok("BMR 男 80kg/175cm/40 → 1698.75", near(C.bmrPure(80, 175, 40, "male"), 1698.75));
ok("同身高体重年龄下 男 > 女", C.bmrPure(70, 175, 30, "male") > C.bmrPure(70, 175, 30, "female"));

/* ---------- 3. 有氧 / 球类（MET × 体重 × 小时） ---------- */
ok("羽毛球 MET5.5 × 72kg × 40min → 264 千卡", C.kcalCardioPure(5.5, 72, 40) === 264);
ok("跑步 MET7 × 72kg × 30min → 252 千卡", C.kcalCardioPure(7, 72, 30) === 252);
ok("时长翻倍 → 热量翻倍（线性）", C.kcalCardioPure(5.5, 72, 80) === 2 * C.kcalCardioPure(5.5, 72, 40));
ok("有氧边界：时长=0 → null", C.kcalCardioPure(5.5, 72, 0) === null);
ok("有氧边界：MET=0 → null", C.kcalCardioPure(0, 72, 40) === null);
ok("有氧边界：体重=0 → null", C.kcalCardioPure(5.5, 0, 40) === null);

/* ---------- 4. 力量训练（做功 + 代谢） ---------- */
/* 20kg × 10次 × 3组 × 位移0.5m，BMR=1725，每组105s：
   W = 20×9.8×0.5×10×3 = 2940J → 0.70268kcal → /0.25×1.6 = 4.4971
   BMR = 1725/1440 × (3×105/60) = 6.2891  → 合计 10.7862 */
ok("力量参考值 20kg×10×3 ≈ 10.786 千卡", near(C.kcalStrengthPure(20, 10, 3, 0.5, 1725, 105), 10.7862, 1e-3));
const base = C.kcalStrengthPure(20, 10, 3, 0.5, 1725, 105);
ok("单调性：重量↑ → 热量↑", C.kcalStrengthPure(40, 10, 3, 0.5, 1725, 105) > base);
ok("单调性：次数↑ → 热量↑", C.kcalStrengthPure(20, 15, 3, 0.5, 1725, 105) > base);
ok("单调性：组数↑ → 热量↑", C.kcalStrengthPure(20, 10, 5, 0.5, 1725, 105) > base);
ok("单调性：位移↑ → 热量↑", C.kcalStrengthPure(20, 10, 3, 0.8, 1725, 105) > base);
ok("BMR 越高 → 同动作热量越高（代谢摊分生效）", C.kcalStrengthPure(20, 10, 3, 0.5, 2000, 105) > base);
ok("做功部分与次数成线性（去掉 BMR 项对比）",
  near(C.kcalStrengthPure(20, 20, 3, 0.5, 0, 105), 2 * C.kcalStrengthPure(20, 10, 3, 0.5, 0, 105)));
ok("力量边界：组数=0 → null", C.kcalStrengthPure(20, 10, 0, 0.5, 1725, 105) === null);
ok("力量边界：次数=0 → null", C.kcalStrengthPure(20, 0, 3, 0.5, 1725, 105) === null);
ok("力量边界：有效负荷=0 → null", C.kcalStrengthPure(0, 10, 3, 0.5, 1725, 105) === null);
ok("力量边界：位移=0 → null", C.kcalStrengthPure(20, 10, 3, 0, 1725, 105) === null);

/* ---------- 5. 计时动作（MET × 体重 × 秒 + BMR 摊分） ---------- */
/* 平板支撑 MET4 × 72kg × 45s × 3组 = 10.8；BMR = 1725/1440 × (45×3/60) = 2.6953 → 13.4953 */
ok("计时参考值（MET4/72kg/45s×3）≈ 13.495 千卡", near(C.kcalTimedPure(4, 72, 45, 3, 1725), 13.4953, 1e-3));
ok("计时单调性：秒数↑ → 热量↑", C.kcalTimedPure(4, 72, 90, 3, 1725) > C.kcalTimedPure(4, 72, 45, 3, 1725));
ok("计时边界：秒数=0 → null", C.kcalTimedPure(4, 72, 0, 3, 1725) === null);

/* ---------- 6. 时长文本解析 ---------- */
ok('解析 "30秒" → 30', C.parseDurationSec("30秒", null) === 30);
ok('解析 "20分钟" → 1200', C.parseDurationSec("20分钟", null) === 1200);
ok('解析纯数字 "12" + 动作文本含「秒」→ 12', C.parseDurationSec("12", "12秒") === 12);
ok('解析纯数字 "12" + 动作文本是次数 → null', C.parseDurationSec("12", "12次") === null);
ok("解析空值 → null", C.parseDurationSec(null, null) === null);
/* 已知行为（保留 v3 原顺序）：`(\\d+)秒` 先于区间匹配命中，"45-60秒" 取 60 而非 45。
   若要改为取下界，需同步评估所有计时动作的显示热量——故这里只锁定现状。 */
ok('解析 "45-60秒" → 60（沿用 v3 匹配顺序，见注释）', C.parseDurationSec("45-60秒", null) === 60);

/* ---------- 7. 量级 sanity（防单位错误导致的 100 倍偏差） ---------- */
const session = [
  C.kcalStrengthPure(60, 10, 4, 0.5, 1725, 105),  // 深蹲
  C.kcalStrengthPure(40, 10, 4, 0.5, 1725, 105),  // 卧推
  C.kcalStrengthPure(30, 12, 3, 0.5, 1725, 105),  // 划船
  C.kcalTimedPure(4, 72, 60, 3, 1725),            // 平板支撑
  C.kcalCardioPure(7, 72, 20)                     // 收尾有氧 20 分钟
].reduce((a, b) => a + b, 0);
ok("单次训练总量在合理量级 (100~800 千卡)，实际≈" + Math.round(session),
  session > 100 && session < 800);
ok("单个力量动作不会超过 500 千卡（无单位错误）", C.kcalStrengthPure(100, 20, 10, 0.5, 1725, 105) < 500);

console.log("\n结果: " + pass + " 通过, " + fail + " 失败");
process.exit(fail ? 1 : 0);
