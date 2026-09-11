/* ============================================================
   健身打卡 App · 卡路里计算核心（纯函数模块，v4.0.0）
   ------------------------------------------------------------
   设计原则：
   1. 本文件所有函数**只依赖显式入参**，不读 localStorage / DOM / 全局 data，
      因此可在 Node 里直接 require 做纯函数单测（test_calorie_model.js）。
   2. 所有模型参数集中在 CALIB，便于审阅与微调。
   3. 双用封装（UMD-lite）：
      - 浏览器：在 index.html 中以 js/calc.js 引入 → 得到 window.FitCalc
      - Node  ：const FitCalc = require("./js/calc.js")
   ============================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FitCalc = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /* ---------- 集中参数表（单位与来源见注释） ---------- */
  var CALIB = {
    gravity: 9.8,           // 重力加速度 m/s²
    joulesPerKcal: 4184,    // 1 kcal = 4184 J
    efficiency: 0.25,       // 人体机械做功效率（力量训练约 0.20~0.25）
    compensation: 1.6,      // 组间休息等额外代谢的补偿系数
    restSecPerSet: 105,     // 每组「计时约 45s + 休息约 60s」的合计秒数
    displacement: 0.5,      // 每次动作平均位移（米）；动作可用 ex.disp 覆盖
    selfLoadFallback: 0.6,  // 自重动作有效负荷 ≈ 体重 × 该系数；动作可用 ex.selfLoad 覆盖
    bmrMinutesPerDay: 1440  // 一天分钟数（把 BMR 按分钟摊分到运动时长上）
  };

  /* ---------- 基础代谢率 BMR（Mifflin-St Jeor 公式，kcal/天） ---------- */
  function bmrPure(weight, height, age, gender) {
    var base = 10 * weight + 6.25 * height - 5 * age;
    return (gender === "female") ? (base - 161) : (base + 5);
  }

  /* ---------- 力量训练（做功法 + 代谢） ----------
     effW    有效负荷(kg)
     reps    每组次数
     sets    组数
     disp    每次动作位移(m)
     bmrVal  基础代谢率(kcal/天)
     restSec 每组总耗时(含组间休息, 秒)
     返回 kcal（未取整的小数）；入参非法时返回 null。 */
  function kcalStrengthPure(effW, reps, sets, disp, bmrVal, restSec) {
    if (!(effW > 0) || !(reps > 0) || !(sets > 0) || !(disp > 0)) return null;
    var workJ = effW * CALIB.gravity * disp * reps * sets;   // 总机械功（焦耳）
    var workKcal = workJ / CALIB.joulesPerKcal;              // 转千卡
    var kcal = workKcal / CALIB.efficiency * CALIB.compensation;
    kcal += (bmrVal / CALIB.bmrMinutesPerDay) * ((sets * restSec) / 60);
    return kcal;
  }

  /* ---------- 时间型动作（平板支撑 / 开合跳秒数等） ----------
     MET × 体重(kg) × 时长(小时) × 组数 + BMR 摊分。 */
  function kcalTimedPure(met, weight, secs, sets, bmrVal) {
    if (!(met > 0) || !(weight > 0) || !(secs > 0) || !(sets > 0)) return null;
    var kcal = met * weight * (secs / 3600) * sets;
    kcal += (bmrVal / CALIB.bmrMinutesPerDay) * ((secs * sets) / 60);
    return kcal;
  }

  /* ---------- 有氧 / 球类 / 游泳（运动记录） ----------
     MET × 体重(kg) × 时长(分钟) / 60。 */
  function kcalCardioPure(met, weight, minutes) {
    if (!(met > 0) || !(weight > 0) || !(minutes > 0)) return null;
    return met * weight * (minutes / 60);
  }

  /* ---------- 解析时长文本为秒数 ----------
     支持："45-60秒" / "30秒" / "20分钟" / "12"（纯数字需 fallbackText 含「秒」才按秒算）。
     注意：匹配顺序与 v3 实现保持一致——`(\\d+)秒` 先命中，故 "45-60秒" 取 60。 */
  function parseDurationSec(v, fallbackText) {
    var txt = (v == null ? "" : String(v));
    var mMin = txt.match(/(\d+)\s*分/);
    if (mMin) return parseInt(mMin[1], 10) * 60;
    var mSec = txt.match(/(\d+)\s*秒/);
    if (mSec) return parseInt(mSec[1], 10);
    var mNum = txt.match(/^(\d+)$/);
    if (mNum) {
      if (fallbackText && String(fallbackText).indexOf("秒") !== -1) return parseInt(mNum[1], 10);
      return null;
    }
    var mRange = txt.match(/(\d+)\s*-\s*(\d+)\s*秒/);
    if (mRange) return parseInt(mRange[1], 10);
    return null;
  }

  return {
    CALIB: CALIB,
    bmrPure: bmrPure,
    kcalStrengthPure: kcalStrengthPure,
    kcalTimedPure: kcalTimedPure,
    kcalCardioPure: kcalCardioPure,
    parseDurationSec: parseDurationSec
  };
});
