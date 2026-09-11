/* 生成 room-demo.html：组队页演示（假云端）
   —— 用途：用户还没建 CloudBase 环境时，也能看到「已接上云端 + 已加入房间」的真实样子。
   —— 与 preview.html 的区别：preview 是「未配置云端」的真身；本文件注入 demo/room-mock.js
      把 fetch 换成内存假后端，并自动切到「组队」页。
   —— 正式 App（index.html）不引用 demo/ 下的任何文件。 */
const fs = require("fs");

let html = fs.readFileSync("index.html", "utf8");
const css = fs.readFileSync("css/style.css", "utf8");
const themeCss = fs.readFileSync("css/theme.css", "utf8");
const calc = fs.readFileSync("js/calc.js", "utf8");
const js = fs.readFileSync("js/app.js", "utf8");
const cloud = fs.readFileSync("js/cloud.js", "utf8");
const social = fs.readFileSync("js/social.js", "utf8");
const mock = fs.readFileSync("demo/room-mock.js", "utf8");

// 内置壁纸内联为 base64
let themeCssInline = themeCss;
let wpB64 = "";
try {
  wpB64 = "data:image/jpeg;base64," + fs.readFileSync("assets/wallpaper-snow.jpg").toString("base64");
  themeCssInline = themeCss.replace(/url\("\.\.\/assets\/wallpaper-snow\.jpg"\)/g, 'url("' + wpB64 + '")');
} catch (e) { console.log("（未找到内置壁纸，跳过内联）"); }

html = html.replace(/<link rel="stylesheet" href="css\/style\.css[^>]*>/, "<style>\n" + css + "\n</style>");
html = html.replace(/<link rel="stylesheet" href="css\/theme\.css[^>]*>/, "<style>\n" + themeCssInline + "\n</style>");

let jsInline = js;
if (wpB64) jsInline = js.replace('var DEFAULT_WALLPAPER = "assets/wallpaper-snow.jpg";', 'var DEFAULT_WALLPAPER = "' + wpB64 + '";');

/* 1) 云端配置 + 演示数据种子（必须在 cloud.js / app.js 之前） */
const seed = "<script>\n" +
  "window.FIT_CLOUD_CONFIG = { envId: \"demo-env\", accessKey: \"demo0000000000000000000000000000000000000\" };\n" +
  "try {\n" +
  "  localStorage.setItem(\"fitapp_data\", JSON.stringify({\n" +
  "    profileDone: true, username: \"小明\", weight: 72, height: 180, age: 25, gender: \"male\",\n" +
  "    scene: \"home\", theme: \"snow\", wallpaper: \"\", records: {}, tasks: {}, plan: null, recDismiss: {}, wizResume: 0\n" +
  "  }));\n" +
  "} catch (e) {}\n" +
  "</script>";

html = html.replace(/<script src="js\/cloud-config\.js[^>]*><\/script>/, seed);
html = html.replace(/<script src="js\/cloud\.js[^>]*><\/script>/, "<script>\n" + cloud + "\n</script>\n<script>\n" + mock + "\n</script>");
html = html.replace(/<script src="js\/social\.js[^>]*><\/script>/, "<script>\n" + social + "\n</script>");
html = html.replace(/<script src="js\/calc\.js[^>]*><\/script>/, "<script>\n" + calc + "\n</script>");
html = html.replace(/<script src="js\/app\.js[^>]*><\/script>/, "<script>\n" + jsInline + "\n</script>");

/* 2) 演示引导：切到组队页 + 顶部说明（这不是真实数据） */
const kick = "<script>\n" +
  "(function () {\n" +
  "  function go() {\n" +
  "    var btn = document.querySelector('.nav-btn[data-tab=\"room\"]');\n" +
  "    if (btn) btn.click();\n" +
  "    var box = document.getElementById('panel-room');\n" +
  "    if (box && !document.getElementById('demoNote')) {\n" +
  "      var n = document.createElement('div');\n" +
  "      n.id = 'demoNote';\n" +
  "      n.className = 'room-card';\n" +
  "      n.style.cssText = 'border:1px dashed var(--primary-100);background:var(--primary-50);margin-top:4px';\n" +
  "      n.innerHTML = '<div class=\"room-card-title\">演示模式</div>' +\n" +
  "        '<div class=\"room-card-sub\">这里的队友、邀请码、打卡记录都是<b>假数据</b>，用来展示「接上云端并加入房间后」的组队页长什么样。<br>' +\n" +
  "        '想看得更真实：回「今日」完成一次打卡，再回本页——你自己的状态会从「未打卡」变成「已打卡 ✓」，集体进度也会涨。<br>' +\n" +
  "        '真实启用：先在 <code>js/cloud-config.js</code> 填 CloudBase 环境 ID，再执行一次 <code>cloudbase/schema.sql</code>。</div>';\n" +
  "      box.insertBefore(n, box.firstChild);\n" +
  "    }\n" +
  "  }\n" +
  "  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(go, 400); });\n" +
  "  else setTimeout(go, 400);\n" +
  "})();\n" +
  "</script>";

html = html.replace(/<\/body>/, kick + "\n</body>");
html = html.replace(/<link rel="manifest"[^>]*>/, "");
html = html.replace(/<link rel="apple-touch-icon"[^>]*>/, "");

fs.writeFileSync("room-demo.html", html);
const left = (html.match(/<script src="[^"]+"[^>]*><\/script>/g) || []);
console.log("room-demo.html 已生成；剩余外链脚本：" + (left.length ? left.join(" | ") : "无（全部内联）"));
