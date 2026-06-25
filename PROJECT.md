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
- [ ] ConnectionManager Redis → WebSocket fan-out working
- [x] Frontend: Vite + React + Zustand bootstrap
- [x] TradingChart renders live candles via WebSocket

### Sprint 2 — Analytics Engine (Weeks 3–4) — Delta completed 2025-06-25
- [x] Delta / CVD calculation + WebSocket endpoint (`/ws/delta/{symbol}/{interval}`)
- [x] Delta panel rendering below chart (histogram: green/red bars)
- [x] CVD line synced with delta histogram (shared time-scale, bidirectional scroll)
- [ ] Volume Profile with POC + Value Area
- [ ] Footprint chart data generation
- [ ] Order book depth streaming → Heatmap data
- [ ] Whale trade detection (notional threshold)
- [ ] All analytics endpoints tested with real data

### Sprint 3 — Overlay Rendering (Weeks 5–6)
- [ ] HeatmapCanvas: 2D colour-mapped liquidity over price/time
- [ ] FootprintCanvas: per-bar buy/sell volume at each price level
- [ ] VolumeProfile side panel with POC (yellow) + VA (blue)
- [ ] WhaleMarkers: live ticker of large prints
- [ ] SMC zones drawn on chart (OB rectangles, FVG fills)

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
| Delta analytics | **Done** | 1-min bar grouping |
| Footprint analytics | **Done** | Imbalance detection |
| Heatmap analytics | **Done** | NumPy matrix, needs perf test |
| Volume Profile | **Done** | POC + VA calculation |
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
| HeatmapCanvas | Stub | Placeholder; needs backend data |
| FootprintCanvas | Stub | Basic bar render; needs polish |
| VolumeProfile | Stub | Basic side-panel; needs scaling |
| WhaleMarkers | **Done** | Live from WS whale channel |
| SymbolList | **Done** | Search + market tabs |
| MarketInfo | **Done** | OHLV + crosshair price |
| docker-compose.yml | **Done** | 4-service stack |
| Dockerfiles | **Done** | backend + frontend |
| .env.example | **Done** | |
| .gitignore | **Done** | |
