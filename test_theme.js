/* 端到端验证：主题与壁纸功能（切换主题、上传壁纸、持久化）*/
const { JSDOM } = require("jsdom");
const fs = require("fs");

const rawHtml = fs.readFileSync("index.html", "utf8");
const html = rawHtml.replace(/<link rel="stylesheet"[^>]*>/g, "");
const appjs = fs.readFileSync("js/app.js", "utf8");
const calcjs = fs.readFileSync("js/calc.js", "utf8");
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
        set(v) {
          img.setAttribute("src", v);
          setTimeout(() => {
            // 模拟"解码成功"：给出真实尺寸（jsdom 不加载图片，尺寸恒为 0，
            // 而新的 compressImage/verifyImageDecodable 会据此判定图片不可用）
            if (!img.naturalWidth) {
              Object.defineProperty(img, "naturalWidth", { value: 240, configurable: true });
              Object.defineProperty(img, "naturalHeight", { value: 320, configurable: true });
            }
            if (img.onload) img.onload();
          }, 0);
        },
        get() { return img.getAttribute("src"); },
      });
      return img;
    };
  }
  if (preload) window.localStorage.setItem("fitapp_data", JSON.stringify(preload));
  window.eval(calcjs); window.eval(appjs);
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

// 1c. 静态回归：自定义壁纸必须在**任何主题**（尤其「清爽蓝白」plain）下都真实可见
//     否则 #app 的不透明 var(--bg) 会把 z-index:-2 的壁纸层整片盖住
ok("存在 custom 强制显示壁纸层规则(opacity:1)", /html\[data-wp="custom"\]\s*body::before\s*\{[^}]*opacity:\s*1/.test(themeCss));
ok("custom 下清掉 #app 不透明底色", /html\[data-wp="custom"\][^{]*#app[^{]*\{[^}]*background-color:\s*transparent/.test(themeCss));
ok("custom 下 --bg 为 transparent", /html\[data-wp="custom"\]\s*\{[^}]*--bg:\s*transparent/.test(themeCss));

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
  // 关键回归：此时主题是 plain（第 6 步切过去的），上传壁纸也必须打上 custom 标记，
  // 否则 #app 的不透明 var(--bg) 会把壁纸层整片盖住 →「提示成功却看不到壁纸」
  ok("plain 主题下上传壁纸仍标记 data-wp=custom（回归）", root.getAttribute("data-wp") === "custom");
  ok("custom 标记与 plain(无 data-theme) 可共存", !root.getAttribute("data-theme"));

  // 8. 移除壁纸 -> 恢复内置
  d.getElementById("wallpaperClear").click();
  ok("移除后 wallpaper 为空", JSON.parse(w.localStorage.getItem("fitapp_data")).wallpaper === "");
  ok("--wp-image 恢复内置壁纸", (root.style.getPropertyValue("--wp-image") || "").indexOf("wallpaper-snow") !== -1);
  ok("移除后清除 data-wp 标记", !root.getAttribute("data-wp"));

  // 8b. 缩略图：必须走 CSSOM 赋值，不能被 url("…") 的双引号截断 style 属性
  const swSnow = d.querySelector('#themeGrid .theme-item:nth-child(3) .theme-swatch');
  ok("主题缩略图 background-image 已生效", !!swSnow && (swSnow.style.backgroundImage || "").indexOf("wallpaper-snow") !== -1);
  const swPlain = d.querySelector('#themeGrid .theme-item:nth-child(1) .theme-swatch');
  ok("plain 缩略图用色卡(不加载壁纸)", !!swPlain && (swPlain.style.backgroundImage || "").indexOf("wallpaper") === -1);

  // 9. 持久化：重启用 night + 自定义壁纸
  const w2 = boot({ theme: "night", wallpaper: "data:image/png;base64,BBBB", profileDone: true });
  ok("重启后恢复主题 night", w2.document.documentElement.getAttribute("data-theme") === "night");
  ok("重启后恢复自定义壁纸", (w2.document.documentElement.style.getPropertyValue("--wp-image") || "").indexOf("BBBB") !== -1);
  ok("重启后恢复 data-wp=custom", w2.document.documentElement.getAttribute("data-wp") === "custom");

  // 10. 关键回归：plain 主题 + 自定义壁纸（启动态）—— 必须标记 custom
  const w3 = boot({ theme: "plain", wallpaper: "data:image/png;base64,CCCC", profileDone: true });
  const r3 = w3.document.documentElement;
  ok("plain 主题不设 data-theme", !r3.getAttribute("data-theme"));
  ok("plain + 自定义壁纸标记 data-wp=custom（回归）", r3.getAttribute("data-wp") === "custom");
  ok("plain + 自定义壁纸写入 --wp-image", (r3.style.getPropertyValue("--wp-image") || "").indexOf("CCCC") !== -1);

  console.log("\n结果: " + pass + " 通过, " + fail + " 失败");
  process.exit(fail ? 1 : 0);
}, 400);
