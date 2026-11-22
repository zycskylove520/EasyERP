#!/usr/bin/env bash
# 后端测试：必须用 Electron 的 Node 跑（better-sqlite3 编译为 Electron ABI 130）。
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ELECTRON="$ROOT/node_modules/.pnpm/electron@33.4.11/node_modules/electron/dist/electron.exe"
JEST="$(ls -d "$ROOT"/node_modules/.pnpm/jest@*/node_modules/jest/bin/jest.js 2>/dev/null | head -1)"

cd "$ROOT/apps/api"
ELECTRON_RUN_AS_NODE=1 "$ELECTRON" "$JEST" "$@"
