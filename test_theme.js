/* 端到端验证：主题与壁纸功能（切换主题、上传壁纸、持久化）*/
const { JSDOM } = require("jsdom");
const fs = require("fs");

const rawHtml = fs.readFileSync("index.html", "utf8");
const html = rawHtml.replace(/<link rel="stylesheet"[^>]*>/g, "");
const appjs = fs.readFileSync("js/app.js", "utf8");
const themeCss = fs.readFileSync("css/theme.css", "utf8");

function boot(preload, stubTimeout) {
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "http://localhost:8080/" });
  const { window } = dom;
  const RealDate = window.Date;
  class FakeDate extends RealDate { constructor(...a) { if (a.length === 0) super(2026, 0, 5); else super(...a); } }
  window.Date = FakeDate;
  window.confirm = () => true;
  window.alert = () => {};
  window.requestAnimationFrame = function () { return 0; };
  // mock Image：jsdom 中 img.onload 不会触发，这里让 onload 立即执行（无 canvas 时压缩回退原图）
  if (window.Image) {
    const OrigImage = window.Image;
    window.Image = function () {
      const img = new OrigImage();
      Object.defineProperty(img, "src", {
        set(v) { img.setAttribute("src", v); setTimeout(() => { if (img.onload) img.onload(); }, 0); },
        get() { return img.getAttribute("src"); },
      });
      return img;
    };
  }
  if (preload) window.localStorage.setItem("fitapp_data", JSON.stringify(preload));
  window.eval(appjs);
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
  return window;
}

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log("✓ " + name); } else { fail++; console.log("✗ " + name); } }

const w = boot();   // 用真实异步，等待 FileReader 完成
const d = w.document;
const root = d.documentElement;

// 1. 入口存在
ok("设置页存在主题入口按钮", !!d.getElementById("themeBtn"));
ok("存在主题弹层", !!d.getElementById("themeOverlay"));
ok("存在壁纸上传 input", !!d.getElementById("wallpaperInput"));

// 1b. 静态：雪光柔白为「磨砂半透明」（卡片半透明 + backdrop-filter 轻磨砂），壁纸可透出
ok("snow 卡片为半透明白(--card 含 rgba)", /html\[data-theme="snow"\][\s\S]*?--card:\s*rgba\(255,\s*255,\s*255,\s*0\.\d+\)/.test(themeCss));
ok("snow 卡片有 backdrop-filter 磨砂", /html\[data-theme="snow"\]\s*\.card[\s\S]*?backdrop-filter:\s*blur\(/.test(themeCss));
ok("snow 含 -webkit-backdrop-filter 兼容", themeCss.indexOf("-webkit-backdrop-filter: blur(") !== -1);
ok("snow 白色控件改为半透明(含 input 规则)", /html\[data-theme="snow"\]\s*input[\s\S]*?rgba\(255,\s*255,\s*255,\s*0\.\d+\)/.test(themeCss));
ok("snow 磨砂度较轻(blur ≤ 8px)", (function () {
  const m = [...themeCss.matchAll(/html\[data-theme="snow"\][^{]*\{[^}]*?backdrop-filter:\s*blur\((\d+)px\)/g)].map(x => +x[1]);
  return m.length > 0 && Math.max(...m) <= 8;
})());

// 2. 默认主题「雪光柔白」
ok("默认 html[data-theme=snow]（雪光柔白）", root.getAttribute("data-theme") === "snow");

// 3. 打开主题弹层 -> 渲染 5 个主题
d.getElementById("themeBtn").click();
ok("主题弹层已打开", d.getElementById("themeOverlay").hidden === false);
const items = d.querySelectorAll("#themeGrid .theme-item");
ok("渲染 5 个主题", items.length === 5);
ok("默认选中「雪光柔白」(第3项)", items[2].classList.contains("sel"));

// 4. 切到「宁静夜」
items[1].click();
ok("切换到 night 后 html[data-theme=night]", root.getAttribute("data-theme") === "night");
ok("night 项已高亮", d.querySelectorAll("#themeGrid .theme-item")[1].classList.contains("sel"));
ok("主题已持久化", JSON.parse(w.localStorage.getItem("fitapp_data")).theme === "night");

// 5. 切到「暗夜霓虹」
items[3].click();
ok("切换到 neon", root.getAttribute("data-theme") === "neon");

// 6. 回到「清爽蓝白」-> 移除 data-theme，并持久化为 "plain"
items[0].click();
ok("切回 plain 移除 data-theme", !root.getAttribute("data-theme"));
ok("plain 持久化为 \"plain\"", JSON.parse(w.localStorage.getItem("fitapp_data")).theme === "plain");

// 7. 壁纸：模拟上传图片（等待 FileReader 异步完成）
try {
  const file = new w.File([Buffer.from("fakeimg")], "wp.png", { type: "image/png" });
  const input = d.getElementById("wallpaperInput");
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  input.dispatchEvent(new w.Event("change"));
} catch (e) { console.log("· 跳过 File 构造：", e.message); }

setTimeout(function () {
  const storedWp = JSON.parse(w.localStorage.getItem("fitapp_data")).wallpaper;
  ok("上传后写入自定义壁纸(dataURL)", typeof storedWp === "string" && storedWp.indexOf("data:image") === 0);
  ok("--wp-image 指向自定义壁纸", (root.style.getPropertyValue("--wp-image") || "").indexOf("data:") !== -1);
  ok("显示「已使用自定义壁纸」", d.getElementById("wallpaperName").textContent.indexOf("自定义") !== -1);
  ok("移除按钮已出现", d.getElementById("wallpaperClear").hidden === false);

  // 8. 移除壁纸 -> 恢复内置
  d.getElementById("wallpaperClear").click();
  ok("移除后 wallpaper 为空", JSON.parse(w.localStorage.getItem("fitapp_data")).wallpaper === "");
  ok("--wp-image 恢复内置壁纸", (root.style.getPropertyValue("--wp-image") || "").indexOf("wallpaper-snow") !== -1);

  // 9. 持久化：重启用 night + 自定义壁纸
  const w2 = boot({ theme: "night", wallpaper: "data:image/png;base64,BBBB", profileDone: true });
  ok("重启后恢复主题 night", w2.document.documentElement.getAttribute("data-theme") === "night");
  ok("重启后恢复自定义壁纸", (w2.document.documentElement.style.getPropertyValue("--wp-image") || "").indexOf("BBBB") !== -1);

  console.log("\n结果: " + pass + " 通过, " + fail + " 失败");
  process.exit(fail ? 1 : 0);
}, 400);
