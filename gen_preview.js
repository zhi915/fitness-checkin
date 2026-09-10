/* 生成 preview.html：把 css/style.css、css/theme.css 与 js/app.js 内联进 index.html，
   并把内置壁纸内联为 base64，便于沙箱单文件预览（相对路径失效时） */
const fs = require("fs");

let html = fs.readFileSync("index.html", "utf8");
const css = fs.readFileSync("css/style.css", "utf8");
const themeCss = fs.readFileSync("css/theme.css", "utf8");
const js = fs.readFileSync("js/app.js", "utf8");

// 内置壁纸内联为 base64
let themeCssInline = themeCss;
try {
  const wpBuf = fs.readFileSync("assets/wallpaper-snow.jpg");
  const wpB64 = "data:image/jpeg;base64," + wpBuf.toString("base64");
  themeCssInline = themeCss.replace(/url\("\.\.\/assets\/wallpaper-snow\.jpg"\)/g, 'url("' + wpB64 + '")');
} catch (e) { console.log("（未找到内置壁纸，跳过内联）"); }

// 注入 CSS
html = html.replace(/<link rel="stylesheet" href="css\/style\.css[^>]*>/, "<style>\n" + css + "\n</style>");
html = html.replace(/<link rel="stylesheet" href="css\/theme\.css[^>]*>/, "<style>\n" + themeCssInline + "\n</style>");
// 注入 JS：预览里把默认壁纸也指向 base64（若存在）
let jsInline = js;
try {
  const wpBuf = fs.readFileSync("assets/wallpaper-snow.jpg");
  const wpB64 = "data:image/jpeg;base64," + wpBuf.toString("base64");
  jsInline = js.replace('var DEFAULT_WALLPAPER = "assets/wallpaper-snow.jpg";', 'var DEFAULT_WALLPAPER = "' + wpB64 + '";');
} catch (e) {}
html = html.replace(/<script src="js\/app\.js[^>]*><\/script>/, "<script>\n" + jsInline + "\n</script>");
// 去掉 manifest / icon 等可能在 file:// 下报错的外部引用（预览用，不影响正式版）
html = html.replace(/<link rel="manifest"[^>]*>/, "");
html = html.replace(/<link rel="apple-touch-icon"[^>]*>/, "");

fs.writeFileSync("preview.html", html);
console.log("preview.html 已重新生成（内联 css/theme.js + 壁纸 base64）");
