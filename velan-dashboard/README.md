# Velan Metrology – Production Dashboard

## Quick Start
1. Run: `./START.sh`
2. Open: `frontend/index.html` in your browser

## How it works
- Edit `backend/data/project_2.xlsx` as usual
- Save the file → dashboard auto-updates within ~5 seconds
- WebSocket connection shows "live" when connected

## API Endpoints (all read-only)
- GET  /api/kpi          – 6 KPI summary numbers
- GET  /api/stages        – Items per stage pipeline
- GET  /api/bottlenecks   – Avg dwell per stage, bottleneck flags
- GET  /api/orders        – Per-PO completion %, risk level
- GET  /api/vendors       – WITH VENDOR items sorted by dwell
- GET  /api/blocked       – Blocked/rework items
- GET  /api/items         – All items (filter: ?op=&po=&location=&search=)
- POST /api/refresh       – Force re-read of Excel (Refresh button)

## Dashboard Sections
1. KPI Row        – Total, In Progress, Vendor, Bottlenecks, Blocked, Delivery
2. Stage Pipeline – Click any stage bar to filter the table below
3. Bottleneck Chart – Avg dwell per stage, CRITICAL/WATCH/OK badges
4. Order Status  – Per-PO progress with traffic light risk indicator
5. Vendor Tracker – All external items, overdue (>48h) highlighted red
6. Components Table – Full filterable/searchable table of all 93 items

## Files
backend/
  server.js   – Express + WebSocket + file watcher
  parser.js   – Excel → JSON normalizer
  logic.js    – All calculations (bottleneck, dwell, risk)
  data/       – Put your Excel file here

frontend/
  index.html  – Complete dashboard (single file, no build needed)
