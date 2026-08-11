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
│   │   ├── models/
│   │   │   └── candle.py          # SQLAlchemy Candle model
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
│   │   │   ├── manager.py             # ConnectionManager: Redis → WebSocket fan-out
│   │   │   ├── routes.py              # /ws/{channel:path} catch-all (registered last)
│   │   │   ├── candle_stream.py       # /ws/candles/{symbol}/{interval} — live klines + loadMore pagination, see Session 8
│   │   │   ├── delta_stream.py        # /ws/delta/{symbol}/{interval} — delta/CVD bars
│   │   │   ├── footprint_stream.py    # /ws/footprint/{symbol}/{interval}
│   │   │   ├── volume_profile_stream.py # /ws/vprofile/{symbol}/{interval}
│   │   │   ├── whale_stream.py        # /ws/whales/{symbol}
│   │   │   └── heatmap_stream.py      # /ws/heatmap/{symbol}
│   │   ├── api/
│   │   │   ├── candles.py         # GET /api/v1/candles/{symbol}
│   │   │   ├── symbols.py         # GET /api/v1/symbols/
│   │   │   └── indicators.py      # GET /api/v1/indicators/{delta,vp,footprint,smc}
│   │   └── main.py                # FastAPI app, CORS, router wiring (specific WS routes before the /ws/{channel} catch-all), lifespan
│   ├── worker/
│   │   └── main.py                # Standalone asyncio worker (collectors entrypoint)
│   ├── requirements.txt
│   └── Dockerfile
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Chart/
│   │   │   │   ├── TradingChart.tsx    # Lightweight Charts candlestick host, scroll-back pagination
│   │   │   │   ├── ChartToolbar.tsx    # Interval buttons + overlay toggles
│   │   │   │   └── ChartContainer.tsx  # Composes chart + all overlays
│   │   │   ├── Drawing/
│   │   │   │   ├── DrawingCanvas.tsx        # Cursor/trend-line/shape/Fibonacci draw + edit engine
│   │   │   │   ├── DrawingToolbar.tsx       # Left icon rail — grouped tool buttons
│   │   │   │   ├── DrawingStyleToolbar.tsx  # Floating style toolbar for a selected drawing
│   │   │   │   ├── FavoritesToolbar.tsx     # Pinned/favorited tool shortcuts
│   │   │   │   ├── FibSettingsModal.tsx     # Fibonacci Style/Coordinates/Visibility dialog
│   │   │   │   └── drawingStyleShared.tsx   # Shared color/width/line-style controls
│   │   │   ├── Overlay/
│   │   │   │   ├── HeatmapCanvas.tsx   # Canvas: liquidity heatmap
│   │   │   │   ├── FootprintCanvas.tsx # Canvas: footprint bars
│   │   │   │   ├── VolumeProfile.tsx   # Side-panel: VP nodes (POC, VA)
│   │   │   │   ├── SMCOverlay.tsx      # Canvas: Order Block + FVG rectangles
│   │   │   │   ├── DeltaPanel.tsx      # Delta histogram + CVD line panel, one-way synced to main chart
│   │   │   │   ├── WhaleMarkers.tsx    # Canvas: whale trade bubbles on the chart
│   │   │   │   └── WhaleTicker.tsx     # Live whale trade sidebar ticker
│   │   │   ├── Sidebar/
│   │   │   │   ├── SymbolList.tsx     # Searchable symbol browser + watchlist add
│   │   │   │   ├── MarketInfo.tsx     # Current price, 24h change, OHLV
│   │   │   │   └── SidebarRail.tsx    # Collapsible icon rail toggling the watchlist panel
│   │   │   └── UI/
│   │   │       ├── Toolbar.tsx             # Top app header — snapshot menu, full screen, settings
│   │   │       ├── StatusBar.tsx           # Bottom status bar
│   │   │       ├── TimeframeDropdown.tsx   # Interval selector (1m–1M)
│   │   │       └── ChartSettingsModal.tsx  # Appearance (theme) + candle color settings
│   │   ├── hooks/
│   │   │   ├── useMarketSocket.ts     # Subscribes to candle WS channel
│   │   │   ├── useCandles.ts          # Fetches historical candles on mount
│   │   │   └── useChartSync.ts        # Exports range/crosshair callbacks
│   │   ├── store/
│   │   │   ├── marketStore.ts         # activeSymbol, interval (default `1h`), candles, prependCandles
│   │   │   ├── chartStore.ts          # visibleOverlays, crosshair, range
│   │   │   ├── socketStore.ts         # WebSocket channel connection states
│   │   │   ├── themeStore.ts          # dark/light theme, localStorage-persisted
│   │   │   ├── candleStyleStore.ts    # Candle body/border/wick colors, localStorage-persisted
│   │   │   ├── drawingStore.ts        # All placed drawings + active tool state
│   │   │   ├── watchlistStore.ts      # Persisted watchlist symbol list
│   │   │   └── whaleStore.ts          # Recent whale trades buffer
│   │   ├── services/
│   │   │   ├── api.ts                 # Typed REST wrappers (fetch)
│   │   │   └── socket.ts              # Auto-reconnecting WebSocket client
│   │   ├── utils/
│   │   │   ├── interval.ts            # CandleInterval → seconds
│   │   │   ├── chartTime.ts           # epoch-ms → Asia/Colombo chart time, shared by every series/overlay, see Session 9
│   │   │   └── chartSnapshot.ts       # Composites chart + overlay canvases into one exportable image
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
- [x] Footprint chart — data working, UI polish done (imbalance highlight box + row separators, see Session 4)

### Sprint 3 — Overlay Rendering (Weeks 5–6)
- [x] Footprint chart final polish (removed full-row background fill, tighter imbalance highlight, row separators) — see Session 4
- [x] SMC zones drawn on chart (OB rectangles, FVG fills) — see Session 4
- [x] Drawing tools (cursor group, trend line group, shapes group, Fibonacci) — see Session 3
- [x] Scroll-back candle pagination (`loadMore` over the candle WS) — see Session 8
- [x] Chart timezone correction (Asia/Colombo offset applied to all series) — see Session 9
- [ ] UI general cleanup and improvements
- [ ] Prepare for client demo

### Sprint 4 — Multi-Asset & Polish (Weeks 7–8)
- [ ] Forex provider wired end-to-end
- [ ] Stocks provider wired end-to-end
- [ ] Symbol search + market switcher (crypto / forex / stocks)
- [ ] Interval switching (1m → 1d) with data reload
- [ ] Performance optimisation (canvas throttle, React memo)
- [x] Dark/light theme toggle — see Session 7
- [ ] Responsive layout polish

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
| Footprint analytics | ✅ Done | Data live, UI polish complete |
| Heatmap analytics | ✅ Done | 10s bucketing, colour LUT, 2000 snapshot history |
| Volume Profile | ✅ Done | Canvas overlay, POC/VAH/VAL lines + bars |
| SMC: Order Blocks | **Done** | Basic impulse detection, now drawn on chart |
| SMC: Fair Value Gaps | **Done** | 3-candle pattern, now drawn on chart |
| WebSocket manager | **Done** | Auto-cleanup on disconnect |
| REST API routes | **Done** | Candles, symbols, indicators |
| FastAPI main app | **Done** | CORS, lifespan wired |
| Background worker | **Done** | Signal-aware shutdown |
| Frontend types | **Done** | market.ts + analytics.ts |
| Zustand stores | **Done** | market, chart, socket, candleStyle, watchlist, theme stores |
| Socket service | **Done** | Auto-reconnect, per-channel |
| API service | **Done** | Typed REST wrappers |
| Hooks | **Done** | useCandles, useMarketSocket, useChartSync |
| TradingChart | **Done** | Lightweight Charts, resize-aware |
| ChartToolbar | **Done** | Interval + overlay toggles |
| HeatmapCanvas | ✅ Done | Colour gradient, 10s buckets, 2000-snap history |
| FootprintCanvas | ✅ Done | Data live, UI polish complete |
| SMCOverlay | ✅ Done | Canvas overlay, OB + FVG rectangles |
| VolumeProfile | ✅ Done | Canvas overlay, POC/VAH/VAL dashed lines |
| WhaleMarkers | ✅ Done | Bubbles on chart, live sidebar ticker |
| SymbolList | ✅ Done | Live backend symbol search (was a hardcoded-list filter), + button adds to a persisted watchlist |
| MarketInfo | ✅ Done | Real 24h stats from Binance ticker REST API |
| SidebarRail | ✅ Done | Collapsible watchlist rail — icon toggles the symbol/market-info panel |
| Toolbar (header) | ✅ Done | Snapshot menu (download/copy/copy-link/open-in-tab), full screen toggle, candle color + theme settings modal |
| Dark/light theme | ✅ Done | CSS-variable token system + `themeStore`, toggle in Settings → Appearance, see Session 7 |
| Timeframe switching | ✅ Done | All intervals 1m to 1M; default interval is now `1h` (was `1m`), see Session 9 |
| Scroll-back pagination | ✅ Done | `loadMore` WS message fetches older Binance klines on approach to the left edge, debounced, position-preserving — see Session 8 |
| Chart timezone handling | ✅ Done | All series (candles, delta/CVD, footprint, heatmap, whale markers, SMC, drawings) shifted to Asia/Colombo (UTC+5:30) via shared `chartTime.ts` helpers — see Session 9 |
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

**Footprint chart final polish:**
- Removed the full-row translucent yellow wash on imbalanced price levels — replaced with a tight highlight box behind only the dominant side's number (green/red tint + bold), so the highlight reads as a signal instead of a blocky band
- Added thin row-separator lines between price levels for a cleaner ladder layout
- Padding now scales with the dynamic font size instead of a fixed 4px
- Removed leftover debug `console.log` calls from the footprint WebSocket handler

**SMC zones drawn on chart:**
- New `SMCOverlay.tsx` canvas overlay (same pattern as FootprintCanvas/VolumeProfile — shared chart/series refs, `scheduleDraw` + `drawFnRef`), wired into `ChartContainer` and gated on the existing `smc` toolbar toggle
- Order Blocks: one-candle-wide rectangle at the OB candle, green tint for bullish / red for bearish, opacity scaled by detection `strength`
- Fair Value Gaps: rectangle spanning the 3-candle detection window (c1 open → c3 close) computed from the single `ts` field the API returns, dashed border, neutral purple tint (API doesn't expose gap direction)
- Data is polled via REST every 5s (`api.getSMCZones`) since no `/ws/smc` stream exists yet — same limitation the REST-based endpoints already had

**Key fix — SMC endpoint was dead in the current dev setup:**
- `GET /indicators/smc/{symbol}` read candles from a Redis key (`candles:{symbol}:{interval}`) that's only populated by the standalone `worker/main.py` collector process, which isn't part of the documented dev startup (`docker compose up postgres redis` + `uvicorn` + `npm run dev`) and wasn't running — every request 404'd/500'd
- Fixed by fetching klines directly from Binance's REST API inside `indicators.py` (mirrors `candle_stream.py`'s working pattern), matching how every other *working* real-time overlay (footprint, candles, volume profile) sources data — no dependency on the Redis worker pipeline
- Also found the `postgres`/`redis` Docker containers had exited ~9h earlier; restarted them (`docker start dsa-trading-tool-postgres-1 dsa-trading-tool-redis-1`)

**Next Session Tasks:**
- SMC: mark zones as mitigated once price re-enters (backend `mitigated` field is currently always `False`) and stop drawing/fade them out
- Consider a `/ws/smc/{symbol}/{interval}` push stream to replace the 5s REST poll
- UI general cleanup and improvements
- Prepare for client demo

---

### Session 5 — July 9, 2026

**What we built:**
- Enlarged the drawing toolbar icons: left-sidebar `DrawingToolbar` buttons (32px → 36px, icons 16–18px → 20px) and the floating `FavoritesToolbar` tool buttons, sized up via a Tailwind `[&_svg]` child-selector so the dropdown/flyout option lists keep their original size

---

### Session 6 — July 10, 2026

**Header toolbar — snapshot, full screen, settings:**
- New camera icon in the top header opens a dropdown: Download image, Copy image, Copy link, Open in new tab (Tweet image intentionally skipped)
- Snapshot capture composites lightweight-charts' own `takeScreenshot()` with every overlay `<canvas>` on top of it (footprint, heatmap, SMC, drawings), so the exported image matches what's actually on screen, not just bare candles
- Full screen icon toggles the whole app via the Fullscreen API, icon swaps enter/exit state, listens for Esc
- Settings (gear) icon opens a `ChartSettingsModal` scoped to what was actually asked for — candle Body/Borders/Wick colors (separate up/down swatches + visibility checkboxes), not the full TradingView settings surface. Backed by a new `candleStyleStore` (localStorage-persisted); `TradingChart` now reads colors from it instead of hardcoded constants
- Fixed a bug in that modal where the color-swatch popovers didn't render correctly — root cause was `overflow-y-auto` on the modal's content wrapper clipping the popover (not a z-index issue as first suspected); removed the scroll wrapper since the content is only 3 short rows
- Follow-up sizing pass: bumped the 3 header icons 28px→36px buttons / 15px→20px glyphs, then tightened header padding (`py-2`→`py-1`) and icon gap (`gap-3`→`gap-1.5`) back down after the bigger icons made the bar feel over-padded

**Right sidebar — collapsible watchlist:**
- Replaced the always-visible MarketInfo/SymbolList/WhaleTicker panel with a collapsed-by-default layout: a slim icon rail (`SidebarRail.tsx`) sits at the edge, and its watchlist icon toggles the exact same panel open/closed
- Fixed watchlist search, which was actually broken: it only filtered a hardcoded 15-symbol array client-side, so searching anything outside that list (e.g. "SHIB", "PEPE") returned nothing — even though the backend's `/symbols/search` endpoint already worked fine and covered every Binance pair. Wired the search box to that endpoint (300ms debounce, filtered to USDT pairs for consistency with the rest of the app)
- Added a persisted `watchlistStore` (localStorage) holding the coin list; search results show a **+** button to add a coin to it (swaps to a checkmark once added)

**Left drawing toolbar — icon consistency:**
- The tools below the Prediction & Measurement group (Measure, Zoom In, Pin, Eye/Eye-off, Lock/Unlock, favorites Star, Trash) were rendering at their old intrinsic 13–18px SVG sizes instead of the 20px the rest of the toolbar already used — bumped all of them to 20px without touching any button/padding size
- Removed the extra divider lines between the Cursor / Trend Line / Shape / Annotation buttons so they sit at the same tight `gap-1` spacing as the bottom utility tools, instead of the wider divider-separated gaps they had before

**Next Session Tasks:**
- SMC: mark zones as mitigated once price re-enters (still outstanding from Session 4)
- Consider a `/ws/smc/{symbol}/{interval}` push stream to replace the 5s REST poll
- Watchlist: no remove/delete affordance yet — only adding via search is wired up
- UI general cleanup and improvements
- Prepare for client demo

---

### Session 7 — July 13, 2026

**Dark/light theme toggle:**
- New `themeStore.ts` (localStorage-persisted, same pattern as `candleStyleStore`) holding `theme: 'dark' | 'light'`, applied as a `data-theme` attribute on `<html>` — set eagerly at module load (before first React render) to avoid a flash of the wrong theme on refresh
- `index.css` now defines the app's color palette as CSS custom properties under `:root[data-theme='dark']` / `:root[data-theme='light']` (`--bg-app`, `--bg-panel`, `--bg-panel-alt`, `--bg-hover`, `--border-color` variants, `--text-primary/secondary/tertiary/muted`, `--accent`, scrollbar colors, plus chart-specific `--chart-grid/text/border/crosshair` tokens)
- Toggle lives in the existing Settings modal (`ChartSettingsModal.tsx`) under a new "Appearance" section, above "Candles"
- Migrated every hardcoded chrome color (header, chart toolbar, drawing toolbar + style toolbar, Fibonacci settings modal, sidebar rail, watchlist/market info panel, delta panel, status bar, whale ticker + tooltip) to the CSS variable tokens
- `TradingChart.tsx` and `DeltaPanel.tsx` (native Lightweight Charts canvases) re-skin their grid/axis/crosshair colors via `chart.applyOptions()` on theme change, since the charting library can't read CSS custom properties directly — chart is *not* recreated on toggle, so zoom/pan state and loaded data survive the switch

**Scope decision — chrome vs. content colors:**
- Deliberately left unthemed: candle up/down colors (`candleStyleStore`), drawing-tool color swatches/palettes, buy/sell/bullish/bearish colors (footprint, whale markers, delta histogram, volume profile POC/VAH/VAL), and DrawingCanvas's floating measurement/range-label chips — these carry semantic meaning or are already user-customizable, same principle as leaving candle colors alone. Matches how TradingView/ThinkorSwim keep those constant across light/dark UI themes.

**Next Session Tasks:**
- SMC: mark zones as mitigated once price re-enters (still outstanding from Session 4)
- Consider a `/ws/smc/{symbol}/{interval}` push stream to replace the 5s REST poll
- Watchlist: no remove/delete affordance yet — only adding via search is wired up
- UI general cleanup and improvements
- Prepare for client demo

---

### Session 8 — July 13, 2026

**Scroll-back candle pagination:**
- `candle_stream.py` now runs two concurrent tasks per WebSocket connection: `relay_live()` (existing Binance kline relay) and a new `handle_requests()` that listens for a client `{"type": "loadMore", "before": <ms>}` message and answers with `{"type": "historical_prepend", "candles": [...]}` fetched from Binance's REST klines endpoint using `endTime`; `asyncio.wait(..., FIRST_COMPLETED)` tears both down together on disconnect
- Initial historical load bumped from 200 → 1000 candles (Binance's per-request max)
- `TradingChart.tsx`: subscribes to `subscribeVisibleLogicalRangeChange`, debounced 200ms, and fires `loadMore` once the visible range's left edge nears bar index 0 — guarded by `loadingMoreRef`/`reachedStartRef` refs so it doesn't fire again until the previous page resolves or the true start of history is reached
- `marketStore.prependCandles()` merges older candles in front of the existing array, de-duplicating anything already loaded
- On `historical_prepend`, the chart captures its visible logical range before `setData()` (which would otherwise reset it), then re-applies that range shifted by however many bars were actually prepended, so the user's scroll position doesn't jump
- Initial/symbol-switch load now sets the visible range explicitly from the new dataset's own length (last 100 bars) instead of relying solely on `scrollToRealTime()`, which could land on a stale position if the previous symbol had left the chart zoomed to an unusual bar spacing

**Delta panel sync fix (first pass):**
- Removed the manual "align to main chart" call after the delta panel's own `historical` load — reasoned that the existing one-directional-looking `onMainRange` subscription already re-syncs it, and doing both raced each other, occasionally snapping the *main* chart back to a stale range
- (This diagnosis was incomplete — the sync was still bidirectional at this point; see Session 9, which found and removed the actual feedback loop)

**Next Session Tasks:**
- Delta panel: intermittent main-chart range jumps still possible under the bidirectional sync — investigate further
- SMC: mark zones as mitigated once price re-enters (still outstanding from Session 4)
- Watchlist: no remove/delete affordance yet
- UI general cleanup and improvements
- Prepare for client demo

---

### Session 9 — July 16, 2026

**Chart timezone correction:**
- New `frontend/src/utils/chartTime.ts`: lightweight-charts renders its numeric time axis in UTC with no per-viewer timezone setting, so every raw epoch-ms timestamp from the backend is now shifted by a fixed `CHART_TZ_OFFSET_SECONDS = 5.5h` (Asia/Colombo, UTC+5:30) before being handed to the library — `toChartTime()` (epoch-ms → shifted `Time`), `toChartTimeSeconds()` (epoch-ms → shifted plain seconds, for internal bucketing/snapping math), `shiftEpochSeconds()` (for sources that already report epoch seconds, e.g. heatmap snapshots)
- Applied consistently across every series/overlay so they all stay aligned on the same shifted axis: `TradingChart`, `DeltaPanel`, `FootprintCanvas`, `HeatmapCanvas`, `SMCOverlay`, `WhaleMarkers`, and all the time-bucketing/snapping math in `DrawingCanvas` (bar-interval estimation, time↔x conversion, regression channel, measure tool, magnet snap, nearest-candle lookup)
- Default active interval changed from `1m` to `1h` in `marketStore`

**Delta panel sync — actual root cause found and fixed:**
- The bidirectional sync between the main chart and the delta panel (each side writing the other's visible range on change, guarded by a same-tick `syncing` flag) wasn't actually safe: lightweight-charts can dispatch range-change events asynchronously (e.g. a ResizeObserver-driven relayout firing a beat after the triggering `setData`/`setVisibleLogicalRange` call returns), so the same-tick guard doesn't catch the echo — the two charts ended up fighting over the range and settling on neither's intended value (chart would open on an arbitrary ~228-bar window instead of "last 100 bars")
- Fixed by making the sync strictly one-directional: the delta panel always follows the main chart's range; the main chart is never written to from the delta panel. Trade-off: dragging the delta panel itself no longer pans the main chart (dragging the main chart still pans both)
- Since `setData()` on the delta panel's own series auto-fits its visible range to whatever just loaded, and that can no longer leak out to corrupt the main chart, the panel now explicitly pulls the main chart's current range right after its own historical load so it doesn't sit on the wrong window until the next main-chart pan

**Next Session Tasks:**
- SMC: mark zones as mitigated once price re-enters (still outstanding from Session 4)
- Watchlist: no remove/delete affordance yet
- UI general cleanup and improvements
- Prepare for client demo
