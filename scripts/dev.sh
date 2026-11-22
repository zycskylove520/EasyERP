#!/usr/bin/env bash
# 开发模式：在 Electron 窗口里跑（内置后端 + Vite 前端热更新）。
# 运行时统一用 Electron 的 Node（ABI 130），原生模块按此 ABI 编译。
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE="$ROOT/.tools/node/node.exe"
PNPM_SH="$ROOT/.tools/pnpm.sh"
cd "$ROOT"

echo "==> [1/3] 构建后端"
bash "$PNPM_SH" --filter @easyerp/api build

echo "==> [2/3] 为 Electron 重建原生模块"
ER_CLI="$(ls -d node_modules/.pnpm/@electron+rebuild@4.2.1/node_modules/@electron/rebuild/lib/cli.js 2>/dev/null | head -1)"
ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" \
  "$NODE" "$ER_CLI" -m . -v 33.4.11 -f -w better-sqlite3

echo "==> [3/3] 启动 Vite dev server + Electron 窗口"
VITE_BIN="$(ls -d node_modules/.pnpm/vite@*/node_modules/vite/bin/vite.js 2>/dev/null | head -1)"
(
  cd "$ROOT/apps/web"
  "$NODE" "$ROOT/$VITE_BIN" --host 127.0.0.1 --port 5173
) &
VITE_PID=$!

ELECTRON_CLI="$(ls -d node_modules/.pnpm/electron@33.4.11/node_modules/electron/cli.js 2>/dev/null | head -1)"
cleanup() {
  kill "$VITE_PID" 2>/dev/null || true
}
trap cleanup EXIT

# 必须清掉可能是会话残留的变量，否则 Electron 会以纯 Node 模式启动（app 为 undefined）
unset ELECTRON_RUN_AS_NODE
EASYERP_DEV=1 ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" \
  "$NODE" "$ELECTRON_CLI" .
