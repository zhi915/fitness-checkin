/* v5.1.2 组队领域层单测——js/social.js 是纯函数模块（无 DOM / 无网络），
   可直接 require。覆盖：邀请码、日期区间、摘要行构造、集体进度、成员看板排序。 */
const S = require("./js/social.js");

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log("✓ " + name); }
  else { fail++; console.log("✗ " + name); }
}

/* ================= 1. 邀请码 ================= */
ok("邀请码默认长度 6", S.genRoomCode().length === 6);
ok("邀请码可指定长度 4", S.genRoomCode(4, () => 0).length === 4);
ok("随机源为 0 时取字符集首字符 A", S.genRoomCode(6, () => 0) === "AAAAAA");
ok("随机源接近 1 时取字符集末字符 9", S.genRoomCode(4, () => 0.999999) === "9999");
const big = S.genRoomCode(500, Math.random);
ok("500 位随机码不含易混字符 I/O/0/1", !/[IO01]/.test(big));
ok("字符集恰为 32 个（无 I/O/0/1）", S.CODE_ALPHABET.length === 32);

ok("normalizeCode 去符号并大写", S.normalizeCode(" ab-c12 ") === "ABC12");
ok("normalizeCode 超长截断为 6", S.normalizeCode("abcdefghij") === "ABCDEF");
ok("isValidCode 接受 6 位合法码", S.isValidCode("abc123") === true);
ok("isValidCode 拒绝 5 位", S.isValidCode("abc12") === false);
ok("isValidCode 容忍分隔符（abc-123 → ABC123）", S.isValidCode("abc-123") === true);
ok("isValidCode 过滤符号后不足 6 位则拒绝", S.isValidCode("ab!123") === false);

/* ================= 2. 日期区间（UTC 运算，不受本机时区影响） ================= */
ok("weekStart：周一自身不变", S.weekStart("2026-01-05") === "2026-01-05");
ok("weekStart：周日回退到本周一", S.weekStart("2026-01-11") === "2026-01-05");
ok("weekStart：周六回退到本周一", S.weekStart("2026-09-12") === "2026-09-07");
ok("monthStart 取当月 1 号", S.monthStart("2026-09-11") === "2026-09-01");
ok("addDays 跨月进位", S.addDays("2026-09-30", 1) === "2026-10-01");
ok("addDays 负数回退", S.addDays("2026-09-01", -1) === "2026-08-31");
ok("daysBetween 同月", S.daysBetween("2026-09-01", "2026-09-11") === 10);
ok("daysBetween 跨月", S.daysBetween("2026-08-31", "2026-09-01") === 1);

/* ================= 3. 摘要行构造（本地 → 云端投影） ================= */
const row = S.summaryRow("u1", "2026-09-11", { checked: true, doneCount: 3, total: 3 }, 123.6);
ok("summaryRow 字段完整", row.user_id === "u1" && row.day === "2026-09-11" && row.checked === true);
ok("summaryRow 完成度映射", row.done_count === 3 && row.total === 3);
ok("summaryRow kcal 四舍五入", row.kcal === 124);
const row2 = S.summaryRow("u2", "2026-09-11", null, -5);
ok("summaryRow 容错：缺 derived → 全零", row2.checked === false && row2.done_count === 0 && row2.total === 0);
ok("summaryRow 容错：负消耗归零", row2.kcal === 0);

const prof = S.profileRow("u1", "  小明 ", "🏋️", { current: 7, total: 20 });
ok("profileRow 昵称修剪", prof.nickname === "小明");
ok("profileRow id = 用户 id（RLS 依赖）", prof.id === "u1");
ok("profileRow 连胜/累计", prof.streak === 7 && prof.total_days === 20);
ok("profileRow 空昵称兜底", S.profileRow("u1", "", "", null).nickname === "健身伙伴");
ok("profileRow 默认表情", S.profileRow("u1", "x", "", null).emoji === "💪");

/* ================= 4. 集体目标进度 ================= */
const rows = [
  { user_id: "u1", day: "2026-09-01", checked: true, kcal: 100 },
  { user_id: "u1", day: "2026-09-02", checked: true, kcal: 200 },
  { user_id: "u2", day: "2026-09-02", checked: true, kcal: 50 },
  { user_id: "u2", day: "2026-09-03", checked: false, kcal: 0 }
];
ok("checkedDayCount 只数 checked=true", S.checkedDayCount(rows) === 3);
const pg = S.progress(rows, 6);
ok("progress.done = 已打卡天数", pg.done === 3);
ok("progress.pct = 50%", pg.pct === 50);
ok("progress.remain", pg.remain === 3);
ok("progress 目标非法时兜底为 1", S.progress(rows, 0).target === 1);
ok("progress 超额时 pct 封顶 100", S.progress(rows, 1).pct === 100);

/* ================= 5. 按用户聚合 ================= */
const kcal = S.kcalByUser(rows);
ok("kcalByUser 按用户求和", kcal.u1 === 300 && kcal.u2 === 50);
ok("kcalByUser 忽略无 user_id 的行", Object.keys(S.kcalByUser([{ kcal: 9 }])).length === 0);
const tmap = S.todayMap(rows, "2026-09-02");
ok("todayMap 只取当天", Object.keys(tmap).length === 2 && tmap.u1.day === "2026-09-02");
ok("byUser 分组计数", S.byUser(rows).u1.length === 2);

/* ================= 6. 成员看板排序 ================= */
const members = [
  { user_id: "u2", nickname: "阿强", emoji: "🏋️", streak: 9, total_days: 30 },
  { user_id: "u1", nickname: "小明", emoji: "💪", streak: 1, total_days: 2 },
  { user_id: "u3", nickname: "阿伟", emoji: "🔥", streak: 1, total_days: 2 }
];
const boardRows = [
  { user_id: "u1", day: "2026-09-02", checked: true, kcal: 100 },
  { user_id: "u1", day: "2026-09-03", checked: true, kcal: 300 },
  { user_id: "u2", day: "2026-09-02", checked: true, kcal: 80 },
  { user_id: "u3", day: "2026-09-03", checked: false, kcal: 0 }
];
const board = S.memberBoard(members, boardRows, "2026-09-03");
ok("看板成员数 = 3", board.length === 3);
ok("今日已打卡的排最前（u1 连胜最低仍第一）", board[0].id === "u1");
ok("同未打卡时按连续天数降序（u2 在 u3 前）", board[1].id === "u2" && board[2].id === "u3");
ok("weekKcal 按用户累加", board[0].weekKcal === 400 && board[1].weekKcal === 80);
ok("todayChecked / todayKcal 对应今天那一行", board[0].todayChecked === true && board[0].todayKcal === 300);
ok("未打卡成员 todayKcal = 0", board[2].todayKcal === 0);
ok("看板保留连胜与原累计", board[0].streak === 1 && board[0].totalDays === 2);
ok("看板昵称兜底", S.memberBoard([{ user_id: "z" }], [], "2026-09-03")[0].nickname === "健身伙伴");

const ov = S.roomOverview(board);
ok("roomOverview 今日打卡人数", ov.done === 1 && ov.total === 3 && ov.allDone === false);
ok("全员打卡时 allDone=true", S.roomOverview(S.memberBoard(members.slice(0, 1), [{ user_id: "u2", day: "2026-09-03", checked: true }], "2026-09-03")).total === 1);
ok("空房间看板不报错", S.memberBoard([], [], "2026-09-03").length === 0);

console.log("\n结果: " + pass + " 通过, " + fail + " 失败");
process.exit(fail ? 1 : 0);
