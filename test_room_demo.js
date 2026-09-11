/* 组队页演示（room-demo.html）回归测试
   —— 演示页是「假云端」注入的产物，一旦 index.html 的脚本标签结构变了、
      或者 demo/room-mock.js 与 app.js 的调用约定脱节，演示就会静默退化成
      「未配置云端」的样子。本测试专门守住这一点。
   —— 需要先跑 `node gen_room_demo.js` 生成 room-demo.html。 */
const { JSDOM } = require("jsdom");
const fs = require("fs");

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log("✓ " + name); }
  else { fail++; console.log("✗ " + name); }
}

let html = "";
try { html = fs.readFileSync("room-demo.html", "utf8"); }
catch (e) { console.log("缺少 room-demo.html，请先执行 node gen_room_demo.js"); }

const dom = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost:8080/", pretendToBeVisual: true });
const { window } = dom;
const { document } = window;

setTimeout(function () {
  const doc = document;
  ok("演示页内联了 FitCloud / FitSocial", typeof window.FitCloud === "object" && typeof window.FitSocial === "object");
  ok("演示页注入的是假 CloudBase 环境", !!(window.FIT_CLOUD_CONFIG && /^demo-env$/.test(window.FIT_CLOUD_CONFIG.envId)));
  ok("App 已启动并暴露 __fit", !!window.__fit);
  ok("云端被识别为已配置", !!(window.__fit && window.__fit.cloudOn()));
  ok("已拿到（假的）会话", !!(window.__fit && window.__fit.isCloudReady()));
  ok("已识别到演示房间", !!(window.__fit && window.__fit.cloud.room && window.__fit.cloud.room.code === "K7X2QM"));

  const account = doc.getElementById("roomAccount");
  ok("账号卡不是「纯本地模式」", account && account.textContent.indexOf("纯本地模式") === -1);
  ok("账号卡显示昵称小明", account && account.textContent.indexOf("小明") !== -1);
  ok("账号卡标记为设备账号", account && account.textContent.indexOf("设备账号") !== -1);

  const body = doc.getElementById("roomBody");
  ok("组队页给出演示说明横幅", !!doc.getElementById("demoNote"));
  ok("演示说明写明是假数据", doc.getElementById("demoNote").textContent.indexOf("假数据") !== -1);
  ok("演示说明给出「打卡看变化」的引导", doc.getElementById("demoNote").textContent.indexOf("已打卡") !== -1);
  ok("不是「未配置云端」引导页", body.textContent.indexOf("组队需要先接上云端") === -1);
  ok("不是「还没有加入任何房间」页", body.textContent.indexOf("还没有加入任何房间") === -1);
  ok("展示演示房间名", body.textContent.indexOf("晨练小分队") !== -1);
  ok("展示邀请码 K7X2QM", body.textContent.indexOf("K7X2QM") !== -1);

  const cards = doc.querySelectorAll("#roomBody .room-member");
  ok("成员看板渲染 3 人", cards.length === 3);
  ok("看板含队友「阿强」", body.textContent.indexOf("阿强") !== -1);
  ok("看板含队友「小美」", body.textContent.indexOf("小美") !== -1);
  ok("今日已打卡的成员排在最前（阿强，连续 11 天）", cards.length === 3 && cards[0].textContent.indexOf("阿强") !== -1 && cards[0].textContent.indexOf("已打卡") !== -1);
ok("只有 1 人今天已打卡（我和小美都还没）", doc.querySelectorAll("#roomBody .rm-state.done").length === 1);
ok("今天还没打卡的成员显示「未打卡」", body.textContent.indexOf("未打卡") !== -1);
ok("我自己也在看板中", body.textContent.indexOf("小明") !== -1);
  ok("存在未打卡成员", body.textContent.indexOf("未打卡") !== -1);
  ok("展示了本周消耗", /本周 \d+ 千卡/.test(body.textContent));
  ok("展示集体目标进度", body.textContent.indexOf("本月全队进度") !== -1);

  const v = window.__fit.roomView();
  ok("集体进度目标 30 天", v.prog.target === 30);
  ok("集体进度已统计到本月已打卡天数（>0）", v.prog.done > 0);
  const fill = doc.getElementById("roomProgFill");
  ok("进度条宽度非 0", !!fill && fill.style.width !== "" && fill.style.width !== "0%");

  ok("已自动切到组队页", doc.getElementById("panel-room").classList.contains("active"));
  ok("底部导航为 5 个", doc.querySelectorAll(".nav-btn").length === 5);
  ok("打卡按钮仍在（本地功能不受演示影响）", !!doc.getElementById("checkinBtn"));

  console.log("\n结果: " + pass + " 通过, " + fail + " 失败");
  process.exit(fail ? 1 : 0);
}, 900);
