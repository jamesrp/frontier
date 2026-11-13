#!/usr/bin/env bash
# Bundles src/main.ts and inlines it with web/style.css into one HTML file: dist/frontier.html
# Also writes ../index.html, the same game wrapped in a full HTML page, for GitHub Pages.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p dist
npx --yes esbuild@0.28.2 src/main.ts --bundle --minify --format=iife --target=es2020 --outfile=dist/app.js --log-level=warning
node -e '
const fs=require("fs");
let t=fs.readFileSync("web/template.html","utf8");
const css=fs.readFileSync("web/style.css","utf8");
const js=fs.readFileSync("dist/app.js","utf8").replace(/<\/script/gi,"<\\/script");
const font="data:font/woff2;base64,"+fs.readFileSync("web/fonts/jersey20-latin.woff2").toString("base64");
t=t.split("/*FONT*/").join(font).split("/*CSS*/").join(css).split("/*JS*/").join(js);
fs.writeFileSync("dist/frontier.html",t);
console.log("dist/frontier.html", (t.length/1024).toFixed(1)+" KB");
const page="<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n</head>\n<body>\n"+t+"\n</body>\n</html>\n";
fs.writeFileSync("../index.html",page);
console.log("../index.html", (page.length/1024).toFixed(1)+" KB");'
