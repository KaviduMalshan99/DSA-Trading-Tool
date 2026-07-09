# DSA Trading Tool — Project Documentation

## Project Overview

DSA Trading Tool is a real-time trading analytics platform that streams live market data from multiple asset classes (crypto, forex, equities) and renders advanced institutional-grade overlays on top of an interactive candlestick chart.

The platform targets discretionary traders who rely on order flow analysis: delta/CVD, footprint charts, liquidity heatmaps, volume profile, and Smart Money Concepts (SMC) zones like Order Blocks and Fair Value Gaps.

---

## Tech Stack

### Backend
| Layer | Technology |
|---|---|
| API framework | Python FastAPI (async) |
| WebSocket server | FastAPI WebSocket + Redis pub/sub fan-out |
| Background worker | asyncio task runner |
| Database | PostgreSQL 16 via SQLAlchemy 2 async |
| Cache / message bus | Redis 7 |
| Market data — crypto | Binance WebSocket streams |
| Market data — forex | Alpha Vantage REST (polled) |
| Market data — stocks | Polygon.io REST |
| Analytics | Pure Python + NumPy |
| Containerisation | Docker + Docker Compose |

### Frontend
| Layer | Technology |
|---|---|
| UI framework | React 18 + TypeScript |
| Chart engine | Lightweight Charts v4 (TradingView) |
| Canvas overlays | HTML5 Canvas 2D API |
| State management | Zustand |
| Styling | Tailwind CSS v3 |
| Build tool | Vite 5 |
| WebSocket client | Native browser WebSocket |

---

## Folder Structure

```
DSA-Trading-Tool/
├── backend/
│   ├── app/
│   │   ├── core/
│   │   │   ├── config.py          # Pydantic-settings env config
│   │   │   ├── database.py        # Async SQLAlchemy engine + session
│   │   │   └── redis.py           # Redis client, pub/sub helpers, cache helpers
│   │   ├── market/
│   │   │   ├── providers/
│   │   │   │   ├── base.py        # Abstract BaseProvider + dataclasses
│   │   │   │   ├── binance.py     # Binance WebSocket provider (crypto)
│   │   │   │   ├── forex.py       # Alpha Vantage provider (forex)
│   │   │   │   └── stocks.py      # Polygon.io provider (stocks)
│   │   │   └── collectors/
│   │   │       ├── candle_collector.py   # Streams candles → Redis
│   │   │       ├── trade_collector.py    # Streams trades, detects whale prints
│   │   │       └── depth_collector.py    # Streams order book depth → Redis
│   │   ├── analytics/
│   │   │   ├── delta.py           # Buy/sell delta per bar + cumulative delta
│   │   │   ├── footprint.py       # Per-price-level buy/sell volume + imbalances
│   │   │   ├── heatmap.py         # Order book depth → 2-D liquidity matrix
│   │   │   ├── volume_profile.py  # VP nodes with POC + Value Area
│   │   │   └── smc.py             # Order Blocks + Fair Value Gap detection
│   │   ├── websocket/
│   │   │   ├── manager.py         # ConnectionManager: Redis → WebSocket fan-out
│   │   │   └── routes.py          # /ws/{channel} FastAPI WebSocket endpoint
│   │   ├── api/
│   │   │   ├── candles.py         # GET /api/v1/candles/{symbol}
│   │   │   ├── symbols.py         # GET /api/v1/symbols/
│   │   │   └── indicators.py      # GET /api/v1/indicators/{delta,vp,footprint,smc}
│   │   └── main.py                # FastAPI app, CORS, router wiring, lifespan
│   ├── worker/
│   │   └── main.py                # Standalone asyncio worker (collectors entrypoint)
│   ├── requirements.txt
│   └── Dockerfile
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Chart/
│   │   │   │   ├── TradingChart.tsx    # Lightweight Charts candlestick host
│   │   │   │   ├── ChartToolbar.tsx   # Interval buttons + overlay toggles
│   │   │   │   └── ChartContainer.tsx # Composes chart + all overlays
│   │   │   ├── Overlay/
│   │   │   │   ├── HeatmapCanvas.tsx  # Canvas: liquidity heatmap
│   │   │   │   ├── FootprintCanvas.tsx# Canvas: footprint bars
│   │   │   │   ├── VolumeProfile.tsx  # Side-panel: VP nodes (POC, VA)
│   │   │   │   └── WhaleMarkers.tsx   # Live whale trade ticker overlay
│   │   │   ├── Sidebar/
│   │   │   │   ├── SymbolList.tsx     # Searchable symbol browser
│   │   │   │   └── MarketInfo.tsx     # Current price, 24h change, OHLV
│   │   │   └── UI/
│   │   │       ├── Toolbar.tsx        # Top app header
│   │   │       └── StatusBar.tsx      # Bottom status bar
│   │   ├── hooks/
│   │   │   ├── useMarketSocket.ts     # Subscribes to candle WS channel
│   │   │   ├── useCandles.ts          # Fetches historical candles on mount
│   │   │   └── useChartSync.ts        # Exports range/crosshair callbacks
│   │   ├── store/
│   │   │   ├── marketStore.ts         # activeSymbol, interval, candles
│   │   │   ├── chartStore.ts          # visibleOverlays, crosshair, range
│   │   │   └── socketStore.ts         # WebSocket channel connection states
│   │   ├── services/
│   │   │   ├── api.ts                 # Typed REST wrappers (fetch)
│   │   │   └── socket.ts              # Auto-reconnecting WebSocket client
│   │   ├── types/
│   │   │   ├── market.ts              # Candle, Trade, Depth, Symbol types
│   │   │   └── analytics.ts           # Delta, Footprint, VP, SMC types
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   └── Dockerfile
│
├── docker-compose.yml
├── .env.example
├── .gitignore
├── PROJECT.md
└── README.md
```

---

## Data Flow

```
┌───────────────┐   WebSocket / REST poll   ┌─────────────────┐
│  Binance WS   │ ─────────────────────────▶│  BinanceProvider│
│  Alpha Vantage│                            │  ForexProvider  │
│  Polygon.io   │                            │  StocksProvider │
└───────────────┘                            └────────┬────────┘
                                                      │ Candle / Trade / Depth
                                             ┌────────▼────────┐
                                             │   Collectors    │
                                             │ CandleCollector │
                                             │ TradeCollector  │
                                             │ DepthCollector  │
                                             └────────┬────────┘
                                                      │ JSON → Redis pub/sub
                                             ┌────────▼────────┐
                                             │     Redis       │◀─── Analytics
                                             │  pub/sub + cache│     REST queries
                                             └────────┬────────┘
                                                      │
                      ┌───────────────────────────────┼───────────────────────┐
                      │                               │                       │
               ┌──────▼──────┐                ┌───────▼──────┐        ┌──────▼──────┐
               │  WS Manager │                │  REST API    │        │  Analytics  │
               │  (fan-out)  │                │  /candles    │        │  /delta     │
               │  /ws/channel│                │  /symbols    │        │  /footprint │
               └──────┬──────┘                │  /indicators │        │  /smc       │
                      │                       └──────┬───────┘        └─────────────┘
               Browser WebSocket                     │ fetch
                      │                              │
               ┌──────▼──────────────────────────────▼───┐
               │           React Frontend                 │
               │  useMarketSocket → marketStore → Chart   │
               │  useCandles → REST → initial candle load │
               │  Overlays: Heatmap, Footprint, VP, SMC   │
               └──────────────────────────────────────────┘
```

---

## Sprint Plan Summary

### Sprint 1 — Infrastructure & Live Data (Weeks 1–2) ✅ Completed 2025-06-25
- [x] Project scaffolding (folder structure, Dockerfiles, configs)
- [x] PostgreSQL + Redis Docker setup running
- [x] Binance WebSocket provider + candle collector working
- [x] FastAPI server with `/health`, `/candles`, `/symbols` routes
- [x] ConnectionManager Redis → WebSocket fan-out working
- [x] Frontend: Vite + React + Zustand bootstrap
- [x] TradingChart renders live candles via WebSocket

### Sprint 2 — Analytics Engine (Weeks 3–4) ✅ Completed 2026-06-29
- [x] Delta / CVD calculation + WebSocket endpoint (`/ws/delta/{symbol}/{interval}`)
- [x] Delta panel rendering below chart (histogram: green/red bars)
- [x] CVD line synced with delta histogram (shared time-scale, bidirectional scroll)
- [x] Volume Profile with POC + Value Area (`/ws/vprofile/{symbol}/{interval}`)
- [x] Symbol switching — all 15 crypto USDT pairs wired end-to-end
- [x] Market info panel with real 24h stats from Binance ticker API
- [x] Search filter in symbol sidebar
- [x] Timeframe dropdown — all intervals 1m to 1M wired end-to-end
- [x] Whale detector — bubbles on chart + live sidebar ticker
- [x] Heatmap liquidity visualization — colour gradient order book depth overlay
- [x] Footprint chart ⚠️ data working, UI polish needed

### Sprint 3 — Overlay Rendering (Weeks 5–6)
- [ ] Footprint chart final polish (remove background fills, layout improvements)
- [ ] SMC zones drawn on chart (OB rectangles, FVG fills)
- [x] Drawing tools (cursor group, trend line group, shapes group, Fibonacci) — see Session 3
- [ ] UI general cleanup and improvements
- [ ] Prepare for client demo

### Sprint 4 — Multi-Asset & Polish (Weeks 7–8)
- [ ] Forex provider wired end-to-end
- [ ] Stocks provider wired end-to-end
- [ ] Symbol search + market switcher (crypto / forex / stocks)
- [ ] Interval switching (1m → 1d) with data reload
- [ ] Performance optimisation (canvas throttle, React memo)
- [ ] Responsive layout + dark theme polish

### Sprint 5 — Production Hardening (Week 9–10)
- [ ] Alembic migrations
- [ ] NGINX config + frontend Docker build
- [ ] Docker Compose production profile
- [ ] Rate limiting on REST API
- [ ] Error boundaries + reconnection UX
- [ ] Basic E2E tests

---

## How to Run Locally

### Prerequisites
- Docker Desktop
- Node.js 20+ (for local frontend dev)
- Python 3.12+ (for local backend dev)

### 1. Clone & configure
```bash
git clone <repo-url>
cd DSA-Trading-Tool
cp .env.example .env
# Fill in your API keys in .env
```

### 2. Start with Docker Compose (recommended)
```bash
docker compose up --build
```
Services:
- Frontend: http://localhost:80
- Backend API: http://localhost:8000
- API docs: http://localhost:8000/docs

### 3. Local development (hot reload)

**Backend:**
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate      # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload
```

**Worker (separate terminal):**
```bash
cd backend
python -m worker.main
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

**Infrastructure only (Postgres + Redis):**
```bash
docker compose up postgres redis
```

---

## Current Progress Tracker

| Component | Status | Notes |
|---|---|---|
| Folder structure | **Done** | All files scaffolded |
| Backend: config/db/redis | **Done** | Awaiting real DB connection test |
| Binance provider | **Done** | Needs live key test |
| Forex provider | **Done** | Polling based |
| Stocks provider | **Done** | Polling based |
| Candle collector | **Done** | Redis pub/sub wired |
| Trade collector | **Done** | Whale threshold configurable |
| Depth collector | **Done** | 5s cache TTL |
| Delta analytics | ✅ Done | Live `/ws/delta/` endpoint, CVD line synced |
| Footprint analytics | ⚠️ In Progress | Data live, UI polish in progress |
| Heatmap analytics | ✅ Done | 10s bucketing, colour LUT, 2000 snapshot history |
| Volume Profile | ✅ Done | Canvas overlay, POC/VAH/VAL lines + bars |
| SMC: Order Blocks | **Done** | Basic impulse detection |
| SMC: Fair Value Gaps | **Done** | 3-candle pattern |
| WebSocket manager | **Done** | Auto-cleanup on disconnect |
| REST API routes | **Done** | Candles, symbols, indicators |
| FastAPI main app | **Done** | CORS, lifespan wired |
| Background worker | **Done** | Signal-aware shutdown |
| Frontend types | **Done** | market.ts + analytics.ts |
| Zustand stores | **Done** | market, chart, socket stores |
| Socket service | **Done** | Auto-reconnect, per-channel |
| API service | **Done** | Typed REST wrappers |
| Hooks | **Done** | useCandles, useMarketSocket, useChartSync |
| TradingChart | **Done** | Lightweight Charts, resize-aware |
| ChartToolbar | **Done** | Interval + overlay toggles |
| HeatmapCanvas | ✅ Done | Colour gradient, 10s buckets, 2000-snap history |
| FootprintCanvas | ⚠️ In Progress | Data live, UI polish in progress |
| VolumeProfile | ✅ Done | Canvas overlay, POC/VAH/VAL dashed lines |
| WhaleMarkers | ✅ Done | Bubbles on chart, live sidebar ticker |
| SymbolList | ✅ Done | 15 USDT pairs, search filter, Coming Soon tabs |
| MarketInfo | ✅ Done | Real 24h stats from Binance ticker REST API |
| Timeframe switching | ✅ Done | All intervals 1m to 1M |
| Database PostgreSQL | ✅ Done | Docker Compose, port conflict documented |
| docker-compose.yml | **Done** | 4-service stack |
| Dockerfiles | **Done** | backend + frontend |
| .env.example | **Done** | |
| .gitignore | **Done** | |
| Drawing tools (chart overlay) | ✅ Done | Cursor, Trend Line, Shapes, Fibonacci groups — see Session 3 |

---

## Session Log

### Session 1 — June 25, 2025

**What we built:**
- Full project scaffold (64 files) — backend, frontend, Docker config
- Docker setup: PostgreSQL + Redis running via `docker compose up postgres redis`
- Live BTCUSDT candle chart with real Binance WebSocket data
- Delta histogram + CVD line panel below chart, bidirectional time-scale sync
- Footprint chart canvas overlay (per-price-level buy/sell volume with imbalance highlighting)
- Symbol switching for 15 USDT crypto pairs with instant chart clear on switch
- Volume Profile canvas overlay — POC (yellow), Value Area (blue), dashed reference lines
- Market info sidebar with real 24h stats (price change %, 24H high/low) from Binance ticker API

**Stack confirmed working:**
- Frontend: React + TypeScript + Vite on http://localhost:5173
- Backend: FastAPI + Python on http://localhost:8000
- Database: PostgreSQL in Docker
- Cache: Redis in Docker
- Data: Live Binance WebSocket streams (`@kline_1m`, `@aggTrade`)

**Key technical decisions made:**
- Volume profile built from klines REST (OHLCV approximation), not aggTrade stream — simpler and sufficient
- Footprint imbalance threshold: 5× ratio AND both sides ≥ 0.5 BTC (eliminates single-side false positives)
- Canvas overlay pattern: stable `scheduleDraw` ref + `drawFnRef.current` for stale-closure-free animation
- Route ordering: specific WS routes registered before catch-all `/ws/{channel:path}` in FastAPI

**Next Session Tasks:**
- Footprint chart UI polish (better text layout, cleaner colours)
- Whale trade detector (aggTrade notional threshold → `/ws/whales/{symbol}`)
- Heatmap overlay (order book depth → 2D colour grid)
- Timeframe switching fully wired (already in toolbar, needs interval propagation fix)

---

### Session 2 — June 29, 2026

**What we built:**
- Timeframe dropdown (1m to 1M — all intervals wired end-to-end)
- Whale detector (bubbles on chart + live sidebar ticker, $500K notional threshold)
- Heatmap liquidity visualization (colour gradient, 10-second bucketing, 2000-snapshot history)
- Footprint chart (data working — $10 price buckets for BTC, clipping, dynamic font; UI still being polished)
- Fixed PostgreSQL port conflict permanently (documented startup order below)

**Known Issues & Fixes:**
- Local Windows PostgreSQL steals port 5432 from Docker
- Fix every session:
  1. `net stop postgresql-x64-16`
  2. Start Docker Desktop
  3. `docker compose up postgres redis -d`
  4. `cd backend && uvicorn app.main:app --reload --port 8000`
  5. `cd frontend && npm run dev`

**Key technical decisions made:**
- Heatmap DOM order fix: HeatmapCanvas must render *after* TradingChart in JSX — React effects run in DOM order, so mounting before means chart refs are null at subscription time
- Footprint price bucketing: `round(price, -1)` = nearest $10 for BTC; `round(price, 1)` = nearest $0.10 for others
- Footprint candle body dimming: TradingChart sets `upColor/downColor` to `rgba(0,0,0,0)` when footprint overlay is active so candle bodies are fully transparent (wicks remain)
- Canvas clipping: `ctx.save/rect/clip/restore` per candle prevents footprint text from overflowing into neighbouring candles

**Current Platform Status:**
- Live BTCUSDT candles ✅
- Delta + CVD panel ✅
- Volume Profile POC/VAH/VAL ✅
- Symbol switching all pairs ✅
- Timeframe 1m to 1M ✅
- Whale detector $500K threshold ✅
- Heatmap order book depth ✅
- Footprint chart ⚠️ polish needed

**Next Session Tasks:**
- Footprint chart final polish (background fills, layout)
- SMC zones (Order Blocks + Fair Value Gaps)
- Drawing tools (trend lines, horizontal lines)
- UI general cleanup and improvements
- Prepare for client demo

---

### Session 3 — July 7, 2026

**What we built — a full TradingView-style drawing/annotation toolset on the chart:**
- **Cursor group:** Cross, Dot, Arrow, Demonstration (with crosshair + spotlight), Eraser (with "Remove All Drawings")
- **Trend Line group:** Trend Line, Horizontal Line, Horizontal Ray, Vertical Line (shows its timestamp), Parallel Channel (drag-editable, mid dotted line), Regression Trend (drawn as a line, auto-converts to a statistical deviation channel)
- **Fibonacci Retracement:** exact TradingView levels (0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.618), dotted diagonal trend line connector, movable/resizable after drawing, and a full Style/Coordinates/Visibility settings modal matching TradingView's real dialog
- **Shapes group:** Rectangle, Rotated Rectangle, Circle, Path (with arrowhead), Arrow Marker, Arrow, Arrow Mark Up, Arrow Mark Down, Brush — every shape is movable and resizable after selecting with the cursor
- Every drawing type supports click-to-select with a floating style toolbar (color palette + opacity, width, line style, delete), matching TradingView's UI
- Hover-reveal dropdown arrows on grouped toolbar buttons (Cursor/Trend Line/Shapes), same interaction pattern as TradingView
- Candle colors updated to TradingView's real green/red palette

**Refinements after initial pass (based on reference screenshots):**
- Arrow Mark Up/Down: single click to place a solid chunky block-arrow icon (not a 2-point line), with one "size" control only
- Arrow Marker: solid tapered-dart shape (thin shaft flaring to a proper arrowhead at the tip) instead of a thin line + separate arrowhead triangle, resizable by dragging either endpoint

**Key technical decisions made:**
- One generalized multi-click state machine (`CLICKS_REQUIRED` + `drawingRef`) handles every 1–3 click tool instead of per-tool duplication
- Drag-to-edit reuses a `kind` discriminant so structurally identical types (Trend Line/Arrow, Channel/Rotated Rectangle) share one drag implementation
- `data-drawing-overlay` attribute + `instanceof Element` (not `HTMLElement`, which misses SVG icon glyphs) prevents floating toolbar clicks from being swallowed by the chart's window-level handlers

**Next Session Tasks:**
- Footprint chart final polish (background fills, layout)
- SMC zones (Order Blocks + Fair Value Gaps)
- UI general cleanup and improvements
- Prepare for client demo

---

### Session 4 — July 9, 2026

**What we built:**
- Enlarged the drawing toolbar icons: left-sidebar `DrawingToolbar` buttons (32px → 36px, icons 16–18px → 20px) and the floating `FavoritesToolbar` tool buttons, sized up via a Tailwind `[&_svg]` child-selector so the dropdown/flyout option lists keep their original size
