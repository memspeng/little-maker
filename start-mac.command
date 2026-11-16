#!/bin/bash
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "请先从 https://nodejs.org 安装 Node.js 22 或 24 LTS，然后重新打开此文件。"
  read -r -p "按回车关闭…"
  exit 1
fi
if [ ! -d node_modules ] || [ ! -f public/python/pyodide.asm.wasm ]; then
  npm ci || { read -r -p "安装失败，请检查网络。按回车关闭…"; exit 1; }
fi
npm run dev -- --open
read -r -p "服务已退出，按回车关闭…"
