#!/usr/bin/env bash
# 打包 Windows 安装包（Electron + 内置后端 + 本地数据库）。
# 全部使用项目内自包含工具；electron-builder 会在打包阶段自动为 Electron ABI 重建原生模块。
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE="$ROOT/.tools/node/node.exe"
PNPM_SH="$ROOT/.tools/pnpm.sh"
cd "$ROOT"

echo "==> [1/3] 构建前后端"
bash "$PNPM_SH" -r build

echo "==> [2/3] 为 Electron 重建原生模块（better-sqlite3 → ABI 130）"
ER_CLI="$(ls -d node_modules/.pnpm/@electron+rebuild@4.2.1/node_modules/@electron/rebuild/lib/cli.js 2>/dev/null | head -1)"
if [ -z "$ER_CLI" ]; then echo "找不到 electron-rebuild cli"; exit 1; fi
ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" \
  "$NODE" "$ER_CLI" -m . -v 33.4.11 -f -w better-sqlite3

echo "==> [3/3] electron-builder 打 Windows 安装包"
EB_CLI="$(ls -d node_modules/.pnpm/electron-builder@*/node_modules/electron-builder/cli.js 2>/dev/null | head -1)"
if [ -z "$EB_CLI" ]; then echo "找不到 electron-builder cli"; exit 1; fi
# 缓存全部指向项目内，不污染用户目录。
# electron-builder 是 Windows 原生进程：必须用 Windows 绝对路径，MSYS 的 /d/... 会被
# 当成相对当前盘符的 \d\...（曾生成 D:\d\Project\... 和 D:\.cache 两处污染，已清）。
export ELECTRON_BUILDER_CACHE="$(cygpath -w "$ROOT/.cache/electron-builder")"
mkdir -p "$ROOT/.cache/electron-builder"
ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" \
  "$NODE" "$EB_CLI" --win --x64

echo ""
echo "完成。安装包在 $ROOT/release/"
