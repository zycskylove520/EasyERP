# EasyERP

A local-first desktop ERP for small businesses, built with NestJS, Vue 3, Electron and SQLite. It covers the full flow from products and partners to quotations, purchase orders, delivery notes, statements, inventory and finance — all running offline with data stored locally.

> No cloud service, no account, no preloaded data. Product categories and company profile are filled in by the user on first use.

## Features

- **Base data** — product categories with customizable spec schemas, products, suppliers and customers (supply / sales domains kept separate).
- **Documents** — quotations, purchase orders, delivery notes and statements with draft / confirm / reject flows, document numbering, print preview and Word / PDF export.
- **Inventory** — a ledger-based stock model (current stock = sum of ledger deltas), with initial adjustments, receive/consume flows and a full movement history.
- **Finance** — receivables and payables derived from confirmed statements and orders, with payment records and automatic invalidation when a document is rejected.
- **Overview** — a dashboard with KPI cards and charts (inventory, sales trends, document status, receivables ranking, stock movements, top products) and low-stock alerts.

## Tech stack

| Layer | Technology |
| --- | --- |
| Desktop shell | Electron 33 |
| Backend | NestJS 11 (Node.js, TypeScript) |
| Frontend | Vue 3 + Vite + Vue Router |
| Database | SQLite via better-sqlite3 (compiled for Electron ABI 130) |
| Documents | docx (Word export), Electron `printToPDF` |
| Charts | ECharts |
| Package manager | pnpm workspace (monorepo) |

The SQLite database lives in Electron's `userData` directory at runtime, so it travels with the installed app and is never part of this repository.

## Project structure

```
apps/api/     NestJS backend (database, modules, document rendering)
apps/web/     Vue 3 frontend (views, API client, router)
electron/     Electron main process and preload
scripts/      dev / build / test scripts
```

## Getting started

The repository includes a self-contained toolchain under `.tools/` (Node + pnpm); commands run through the scripts in `scripts/`.

```bash
# Development (Electron window + Vite hot reload)
bash scripts/dev.sh

# Run backend tests (uses Electron's Node to match the native module ABI)
bash scripts/test.sh

# Build a Windows installer (output in release-v6/)
bash scripts/build-exe.sh
```

Prerequisites: Git Bash (MSYS) on Windows. The scripts pin all stores and caches inside the project so nothing is written outside it.

## Data & privacy

- No business or company data is bundled in the source. On first run the database is created empty; the user fills in categories and company info through the UI.
- The app never sends data to a server — all processing is local.

## License

MIT — see [LICENSE](LICENSE).
