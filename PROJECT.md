# DSA Trading Tool — Project Documentation

## Project Overview

DSA Trading Tool is a real-time trading analytics platform that streams live market data from Binance and renders advanced institutional-grade overlays on top of an interactive candlestick chart.

The platform targets discretionary traders who rely on order flow analysis: delta/CVD, footprint charts, liquidity heatmaps, volume profile, and Smart Money Concepts (SMC) zones like Order Blocks and Fair Value Gaps.

**Product vision:** _Build the easiest institutional trading platform powered by AI._ This is **not** a TradingView or ATAS clone. The goal is a focused, curated set of the **best** tools for understanding the market and executing trades — not every tool those platforms offer. Scope is **crypto only** (Binance); forex and stocks are explicitly out of scope for v1.

---

## Tech Stack

### Backend

| Layer                | Technology                                                      |
| -------------------- | --------------------------------------------------------------- |
| API framework        | Python FastAPI (async)                                          |
| WebSocket server     | FastAPI WebSocket + Redis pub/sub fan-out                       |
| Background worker    | asyncio task runner                                             |
| Database             | PostgreSQL 16 via SQLAlchemy 2 async                            |
| Cache / message bus  | Redis 7                                                         |
| Market data — crypto | Binance WebSocket streams                                       |
| Market data — forex  | Alpha Vantage REST (polled) — _scaffolded, out of scope for v1_ |
| Market data — stocks | Polygon.io REST — _scaffolded, out of scope for v1_             |
| Analytics            | Pure Python + NumPy                                             |
| Containerisation     | Docker + Docker Compose                                         |

### Frontend

| Layer            | Technology                          |
| ---------------- | ----------------------------------- |
| UI framework     | React 18 + TypeScript               |
| Chart engine     | Lightweight Charts v4 (TradingView) |
| Canvas overlays  | HTML5 Canvas 2D API                 |
| State management | Zustand                             |
| Styling          | Tailwind CSS v3                     |
| Build tool       | Vite 5                              |
| WebSocket client | Native browser WebSocket            |

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
│   │   │   ├── __init__.py        # Re-exports CandleRecord (fixed Session 10)
│   │   │   └── candle.py          # SQLAlchemy Candle model
│   │   ├── market/
│   │   │   ├── providers/
│   │   │   │   ├── base.py        # Abstract BaseProvider + dataclasses
│   │   │   │   ├── binance.py     # Binance WebSocket provider (crypto)
│   │   │   │   ├── forex.py       # Alpha Vantage provider (forex) — out of scope v1
│   │   │   │   └── stocks.py      # Polygon.io provider (stocks) — out of scope v1
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
│   │   │   └── socket.ts             # Auto-reconnecting WebSocket client
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
│  (crypto only)│                            │                 │
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

## Roadmap — Five Stages

The project is organised into **five stages**. The goal is not to hit stage numbers on a calendar — it is that **when all five stages are done, the product is genuinely complete and correct**. Each stage builds on a stable version of the one before it, mirroring how professional order-flow traders actually work.

```
Stage 1  Foundation & Workspace      →  a stable, professional trading workspace
Stage 2  Market Context & Structure  →  "Where should I pay attention?"
Stage 3  Order Flow & Execution      →  "Is now the right time to enter?"
Stage 4  Trade Confirmation          →  "Is this trade worth taking?"
Stage 5  AI Intelligence & Polish    →  explain, teach, summarise, ship
```

> **Roadmap history:** Development through July 2026 was tracked as _Sprints 1–5_ (see Session Log below, Sessions 1–9). That sprint numbering is retired in favour of these stages. Everything the old Sprints 1–2 and most of Sprint 3 delivered now lives inside **Stage 1**. The Session Log is preserved unchanged as the project's real build history.

### Overall completion (measured against code, not estimated)

| Stage | Name                       | Completion | One-line status                                                                                       |
| ----- | -------------------------- | ---------- | ----------------------------------------------------------------------------------------------------- |
| 1     | Foundation & Workspace     | **~90%**   | Workspace, chart, live data, drawing tools all working; 2 position tools + UI polish + perf remain    |
| 2     | Market Context & Structure | **~20%**   | Volume Profile core + SMC (OB/FVG) done; structure, VWAP, levels, sessions, dashboard not started     |
| 3     | Order Flow & Execution     | **~50%**   | Footprint, Delta/CVD, Heatmap, Whale done; imbalance partial; stacked/absorption/DOM/tape not started |
| 4     | Trade Confirmation         | **~3%**    | Nothing meaningfully built yet (Replay is 0%, not 50% as previously claimed)                          |
| 5     | AI Intelligence & Polish   | **~8%**    | Theme + Docker Compose only; all AI modules not started                                               |

> **Correction note:** the earlier stage drafts overstated a few items. This document corrects them against the actual code: Volume Profile **POC/VAH/VAL are already built** (not 🔴), the **Delta panel already is a green/red histogram with CVD** (not 🔴), footprint **already highlights imbalances** (Session 4), and **Replay has no code at all** → 0%.

---

## Stage 1 — Foundation & Workspace (~90%)

**Objective:** a stable, high-performance, professional trading workspace that every later stage depends on. Not about strategies or indicators — about the infrastructure and UX that make advanced tools possible.

### Done ✅

- **Binance market data:** live trades, live candles, historical candles, order book, multi-symbol (all USDT pairs via search), multi-timeframe (1m–1M)
- **Backend infrastructure:** FastAPI, Redis, PostgreSQL, async processing, WebSocket fan-out
- **Chart engine:** candlesticks, zoom, pan, crosshair, resize, timeframe change, historical navigation (scroll-back pagination — Session 8), Asia/Colombo timezone (Session 9)
- **Drawing engine:** Cursor, Crosshair, Trend Line, Horizontal Line, Horizontal Ray, Vertical Line, Rectangle, Rotated Rectangle, Circle, Brush, Arrow (+ marks), Fibonacci (with settings modal), Parallel Channel, Regression Channel, Undo, Clear All — all movable/resizable with floating style toolbar (Session 3)
- **Workspace:** collapsible sidebar rail, top toolbar, dark/light theme (Session 7), watchlist (persisted, live search), market info panel, snapshot/screenshot, full screen, settings modal

> **Session 11 note:** the Stage 2/3 order-flow overlays (Volume Profile, SMC, Delta/CVD, Footprint, Heatmap, Whale) went through a hardening + verification pass — non-BTC coin support fixed, whale threshold fixed, all six confirmed working live. This is cross-cutting work on other stages, not Stage 1 itself — Stage 1's own remaining scope below is unchanged. **Part C** (next up) = Long Position tool, Short Position tool, then UI cleanup.

### Remaining to close Stage 1 🔴

| Item                  | Type         | Owner       | Notes                                                                                                     |
| --------------------- | ------------ | ----------- | --------------------------------------------------------------------------------------------------------- |
| Long Position tool    | Drawing      | **Part C**  | Entry/stop/target box with live RR readout — pure annotation, belongs here                                |
| Short Position tool   | Drawing      | **Part C**  | Mirror of Long Position                                                                                   |
| Anchored VWAP button  | Toolbar hook | **Stage 2** | Button lives on the drawing rail; the VWAP engine is built in Stage 2. Placeholder wiring only in Stage 1 |
| Fixed Range VP button | Toolbar hook | **Stage 2** | Same — button in Stage 1, engine in Stage 2                                                               |
| UI cleanup            | Polish       | **Part C**  | Spacing, toolbar organisation, cleaner icon system, panel resizing                                        |
| Responsive layout     | Polish       | Stage 1     |                                                                                                           |
| Loading states        | Polish       | Stage 1     |                                                                                                           |
| Performance           | Perf         | Stage 1     | Canvas throttle, React memo, FPS, memory, WebSocket reconnection/health                                   |

> **Ownership decision:** Anchored VWAP and Fixed Range Volume Profile appeared in both Stage 1 (as drawing tools) and Stage 2 (as analysis modules). They are **owned by Stage 2** (they need analytics engines). Stage 1 only provides the toolbar buttons that call into them once built — so they're built once, not twice.

---

## Stage 2 — Market Context & Structure (~20%)

**Objective:** help the trader understand the market _before_ considering a trade. Answers _"Where should I pay attention?"_ — trend, institutional levels, high-probability zones, session context.

> **Scope guard:** Stage 2 is **context only**. Execution tools — footprint, delta, DOM, tape, absorption, imbalance — belong to Stage 3, not here. Keeping context and execution separate keeps the codebase clean and mirrors the real institutional workflow.

| Module                       | Feature                                            | Status                                                        |
| ---------------------------- | -------------------------------------------------- | ------------------------------------------------------------- |
| **Volume Profile**           | Volume by price                                    | ✅ Done                                                       |
|                              | POC / VAH / VAL                                    | ✅ **Done** (dashed lines on chart — _was wrongly marked 🔴_) |
|                              | HVN / LVN                                          | 🔴                                                            |
|                              | Developing POC (live)                              | 🔴                                                            |
|                              | Composite (multi-day)                              | 🔵 Future                                                     |
| **SMC**                      | Order Blocks                                       | ✅ Done                                                       |
|                              | Fair Value Gaps                                    | ✅ Done                                                       |
|                              | Break of Structure (BOS)                           | 🔴 Critical                                                   |
|                              | Change of Character (CHOCH)                        | 🔴 Critical                                                   |
|                              | Market Structure Shift (MSS)                       | 🔴                                                            |
|                              | Liquidity Sweep                                    | 🔴                                                            |
|                              | Equal Highs / Equal Lows                           | 🔴                                                            |
|                              | Premium / Discount zones                           | 🔵 Future                                                     |
|                              | _SMC mitigation_ (fade zones once price re-enters) | 🔴 _(carried over from Session 4)_                            |
| **Market Structure**         | Trend detection (bull/bear/side)                   | 🔴 Critical                                                   |
|                              | Swing High / Low detection                         | 🔴                                                            |
|                              | Structure lines                                    | 🔴                                                            |
| **VWAP**                     | Session VWAP                                       | 🔴 Critical                                                   |
|                              | Anchored VWAP _(owns S1 button)_                   | 🔴                                                            |
|                              | Fixed Range VP _(owns S1 button)_                  | 🔴                                                            |
|                              | VWAP bands                                         | 🔵                                                            |
| **Institutional Levels**     | Daily Open                                         | 🔴 Critical                                                   |
|                              | Prev Day High / Low (PDH/PDL)                      | 🔴                                                            |
|                              | Prev Week / Month High / Low                       | 🔵                                                            |
| **Session Analysis**         | Asia / London / New York boxes                     | 🔴                                                            |
|                              | Session High / Low                                 | 🔴                                                            |
| **Market Context Dashboard** | Summary of all of the above                        | 🔴                                                            |

**Development priority:** Phase 1 → POC/VAH/VAL (done) + Session VWAP + Daily Open. Phase 2 → BOS/CHOCH/MSS/Liquidity Sweep. Phase 3 → Session boxes, Anchored VWAP, Context Dashboard.

---

## Stage 3 — Order Flow & Execution (~50%)

**Objective:** understand what is happening _right now_ — the live battle between buyers and sellers. Answers _"Is this the right time to enter?"_

| Module                    | Feature                                         | Status                                                           |
| ------------------------- | ----------------------------------------------- | ---------------------------------------------------------------- |
| **Footprint**             | Bid × Ask footprint                             | ✅ Done                                                          |
|                           | Buy/Sell volume, Candle Delta                   | ✅ Done                                                          |
|                           | Imbalance highlight (5× ratio box)              | ✅ Done _(Session 4 — was wrongly marked 🔴)_                    |
|                           | Volume / Delta footprint modes                  | 🟡 Partial                                                       |
|                           | Large Volume Highlight                          | 🔴                                                               |
|                           | Zero Prints, Unfinished Auction                 | 🔴                                                               |
| **Delta**                 | Delta, Bar Delta                                | ✅ Done                                                          |
|                           | Cumulative Delta (CVD)                          | ✅ Done                                                          |
|                           | Delta Histogram                                 | ✅ **Done** (green/red bars — _was wrongly marked 🔴_)           |
|                           | Session Delta, Delta Divergence                 | 🔴                                                               |
| **Imbalance (dedicated)** | Buy/Sell imbalance, custom ratio (default 300%) | 🟡 Partial (footprint highlights; no standalone module)          |
| **Stacked Imbalance**     | Consecutive imbalances + highlight              | 🔴                                                               |
| **Absorption**            | Hidden institutional buying/selling             | 🔴                                                               |
| **Liquidity Heatmap**     | Order book heatmap                              | ✅ Done                                                          |
|                           | Liquidity zones, large-order highlight          | 🔴                                                               |
| **Whale Detection**       | Detection + sidebar ticker                      | ✅ Done                                                          |
|                           | History, alerts, statistics                     | 🔴                                                               |
| **Time & Sales (Tape)**   | Live tape, filters, aggressive buyers/sellers   | 🔴 _(backend `trade_collector` already streams the source data)_ |
| **DOM (Depth of Market)** | Live order book, bid/ask size, liquidity        | 🔴 _(backend `depth_collector` already streams the source data)_ |

**Design direction (recommended):** rather than scattered indicators, build a single **Order Flow Workspace** — main chart on top; Footprint / DOM / Tape as a synchronised row; Delta / CVD / Heatmap / Whale / Execution along the bottom. This mirrors how ATAS users actually watch multiple order-flow signals at once.

---

## Stage 4 — Trade Confirmation & Decision Support (~3%)

**Objective:** confirm whether a setup is worth taking by combining multiple independent signals. Answers _"Is this trade worth taking?"_

| Module                                                             | Status                                                             |
| ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Open Interest analysis (OI, OI change, funding)                    | 🔴 _(needs Binance **futures** API — currently only spot streams)_ |
| Liquidation analysis / heatmap                                     | 🔴                                                                 |
| Cluster Scanner (auto-detect large delta/volume/absorption/whales) | 🔴                                                                 |
| Professional Trade Checklist                                       | 🔴                                                                 |
| Position Calculator (size, $ risk, RR)                             | 🔴                                                                 |
| Replay & Practice                                                  | 🔴 **0%** _(no code — previously mis-stated as 50%)_               |
| Trade Journal                                                      | 🔵 Future                                                          |
| Alerts (price/volume/delta/whale/absorption/imbalance)             | 🔴                                                                 |

**Differentiator (recommended):** a **Trade Decision Engine** that rolls Stages 2–3 into a single _Trade Score_ (e.g. Context 25 / Order Flow 35 / Liquidity 20 / Risk 20) with a confidence % and a LONG/SHORT/WAIT recommendation. It **summarises** analysis — it never auto-trades.

---

## Stage 5 — AI Intelligence, Learning & Product Excellence (~8%)

**Objective:** turn the platform from a charting app into an intelligent assistant. Uses everything from Stages 1–4 — adds no new market data.

| Module                                                          | Status                        |
| --------------------------------------------------------------- | ----------------------------- |
| AI Market Analyst (summary, trend, strength, confidence)        | 🔴                            |
| AI Trade Assistant (entry/stop/target/RR suggestions)           | 🔴                            |
| AI Learning Assistant (explain footprint/delta/VP/OB)           | 🔴                            |
| AI Chat (natural-language market questions)                     | 🔴                            |
| Trading Journal AI (review, mistake detection)                  | 🔴                            |
| Educational Mode (lessons for DSA Academy students)             | 🔴                            |
| Personal Workspace (saved layouts, hotkeys, templates)          | 🔴                            |
| Product polish (icons, typography, animations)                  | 🟡 ~25% (theme done)          |
| Deployment (CI/CD, NGINX prod, monitoring, auth, rate limiting) | 🟡 ~15% (Docker Compose only) |

**One dashboard, not three:** the Execution Dashboard (Stage 3), Decision Dashboard (Stage 4), and AI Market Analyst (Stage 5) are the **same component growing over time** — build it once and extend it each stage, rather than three separate panels.

---

## Stage ↔ Code Map

Where each area currently lives in the repo:

| Area                                 | Backend                                                           | Frontend                                                       |
| ------------------------------------ | ----------------------------------------------------------------- | -------------------------------------------------------------- |
| Candles / chart                      | `candle_stream.py`, `api/candles.py`                              | `TradingChart.tsx`, `useCandles.ts`, `marketStore.ts`          |
| Delta / CVD                          | `analytics/delta.py`, `delta_stream.py`                           | `DeltaPanel.tsx`                                               |
| Footprint                            | `analytics/footprint.py`, `footprint_stream.py`                   | `FootprintCanvas.tsx`                                          |
| Volume Profile                       | `analytics/volume_profile.py`, `volume_profile_stream.py`         | `VolumeProfile.tsx`                                            |
| Heatmap                              | `analytics/heatmap.py`, `heatmap_stream.py`, `depth_collector.py` | `HeatmapCanvas.tsx`                                            |
| Whale                                | `trade_collector.py`, `whale_stream.py`                           | `WhaleMarkers.tsx`, `WhaleTicker.tsx`, `whaleStore.ts`         |
| SMC                                  | `analytics/smc.py`, `api/indicators.py`                           | `SMCOverlay.tsx`                                               |
| Drawing tools                        | —                                                                 | `DrawingCanvas.tsx`, `DrawingToolbar.tsx`, `drawingStore.ts`   |
| Theme / workspace                    | —                                                                 | `themeStore.ts`, `index.css`, `Toolbar.tsx`, `SidebarRail.tsx` |
| DOM _(Stage 3, not built)_           | `depth_collector.py` streams source                               | _needs new panel_                                              |
| Tape _(Stage 3, not built)_          | `trade_collector.py` streams source                               | _needs new panel_                                              |
| Open Interest _(Stage 4, not built)_ | _needs Binance futures provider_                                  | _needs new panel_                                              |

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

Services: Frontend `http://localhost:80` · Backend API `http://localhost:8000` · API docs `http://localhost:8000/docs`

### 3. Local development (hot reload)

**Known issue — PostgreSQL port conflict (Windows).** Local Windows PostgreSQL steals port 5432 from Docker. Fix every session, in order:

1. `net stop postgresql-x64-16`
2. Start Docker Desktop
3. `docker compose up postgres redis -d`
4. `cd backend && uvicorn app.main:app --reload --port 8000`
5. `cd frontend && npm run dev`

**Worker (separate terminal, only if you need the Redis collector pipeline):**

```bash
cd backend && python -m worker.main
```

Note: the real-time overlays (candles, footprint, VP, SMC) fetch from Binance REST/WS directly and **do not** require the worker.

### 4. Local dev without Docker (Windows)

For when Docker Desktop itself is too heavy to run (e.g. it's slowing the machine down). Uses native Postgres + Memurai (a Redis-compatible Windows service) instead of containers. `.env` is unchanged — Postgres/Redis are just configured to match what it already expects (`localhost:5432` / `dsa_trading` / user `postgres`, `localhost:6379`).

**One-time setup:**

1. **Postgres** — install PostgreSQL for Windows if you don't have it (this project uses `postgresql-x64-18`). If Docker Desktop has ever been run on this machine, quit it fully first — its backend/WSL relay can hold port 5432 and block the native service from starting:
   ```powershell
   Get-NetTCPConnection -LocalPort 5432   # check what (if anything) already owns the port
   Start-Service postgresql-x64-18
   ```
2. Create the database (only needed once — the role `postgres` already exists by default):
   ```powershell
   $env:PGPASSWORD = "postgres"
   & "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -p 5432 -d postgres -c "CREATE DATABASE dsa_trading OWNER postgres;"
   ```
3. **Redis** — install [Memurai](https://www.memurai.com/) Developer Edition (free, native Windows service, Redis-compatible, listens on `localhost:6379` by default — no config needed). It registers itself as a Windows service named `Memurai` and starts automatically.

**Every-session startup (2 terminals):**

```powershell
# Terminal 1 — make sure the services are up, then run the backend
Start-Service postgresql-x64-18      # if not already Running
Start-Service Memurai                 # if not already Running
cd backend
.venv\Scripts\activate
uvicorn app.main:app --reload --port 8000
```

```powershell
# Terminal 2 — frontend
cd frontend
npm run dev
```

Verify both connections with `curl http://localhost:8000/health` → `{"status":"ok","database":"connected","redis":"connected"}`. (The app's own "Database connected" / "Redis connected" startup log lines are silently swallowed by Python's default logging level — `/health` is the reliable check, not the console output.)

To go back to Docker later: stop the native services (`Stop-Service postgresql-x64-18`, `Stop-Service Memurai`) so they don't fight Docker for the same ports, then resume with `docker compose up --build` as usual — no app code or `docker-compose.yml` changes were made to support this.

---

## Session Log

_(Sessions 1–9 preserved verbatim as the real build history. The "Next Session Tasks" inside them reflect thinking at the time; the authoritative to-do list now lives in the Stage sections above.)_

### Session 1 — June 25, 2025

**Built:** full scaffold (64 files); Docker Postgres+Redis; live BTCUSDT candles via Binance WS; delta histogram + CVD panel with bidirectional sync; footprint canvas; 15-pair symbol switching; Volume Profile (POC/VA); market info with real 24h stats.
**Decisions:** VP from klines REST (not aggTrade); footprint imbalance = 5× ratio AND both sides ≥ 0.5 BTC; stable `scheduleDraw` ref pattern; specific WS routes before catch-all.

### Session 2 — June 29, 2026

**Built:** timeframe dropdown (1m–1M); whale detector ($500K notional, bubbles + ticker); heatmap (10s buckets, 2000-snapshot history); footprint data ($10 buckets for BTC, clipping, dynamic font); fixed Postgres port conflict (documented above).
**Decisions:** HeatmapCanvas must mount _after_ TradingChart (effects run in DOM order); footprint bucketing `round(price,-1)`; candle bodies transparent under footprint; per-candle canvas clip.

### Session 3 — July 7, 2026

**Built:** full TradingView-style drawing toolset — Cursor group, Trend Line group, Fibonacci (exact levels + settings modal), Shapes group; every drawing movable/resizable with floating style toolbar; hover-reveal group dropdowns; TradingView green/red candles.
**Decisions:** one generalised multi-click state machine (`CLICKS_REQUIRED` + `drawingRef`); shared drag-edit via `kind` discriminant; `data-drawing-overlay` + `instanceof Element` to protect toolbar clicks.

### Session 4 — July 9, 2026

**Built:** footprint final polish (tight imbalance highlight box, row separators, scaled padding, removed debug logs); **SMC overlay on chart** (`SMCOverlay.tsx`) — Order Blocks (green/red, opacity by strength) + FVG (dashed purple, 3-candle span).
**Key fix:** SMC endpoint was reading a Redis key only the worker populates (not running) → every request failed. Fixed by fetching klines directly from Binance REST in `indicators.py`, matching the working overlays. Also restarted exited Postgres/Redis containers.

### Session 5 — July 9, 2026

**Built:** enlarged drawing toolbar icons (32→36px buttons, 20px glyphs) via Tailwind `[&_svg]` child-selector so flyout lists keep original size.

### Session 6 — July 10, 2026

**Built:** header snapshot menu (download/copy/copy-link/open-in-tab) compositing lightweight-charts `takeScreenshot()` with all overlay canvases; full screen toggle; `ChartSettingsModal` for candle Body/Border/Wick colors backed by `candleStyleStore`; collapsible watchlist rail (`SidebarRail.tsx`); fixed watchlist search (was filtering a hardcoded 15-symbol array — wired to `/symbols/search` with 300ms debounce); persisted `watchlistStore` with +/✓ add button; left-toolbar icon-size consistency (all 20px), removed divider lines.
**Key fix:** swatch popover clipping was `overflow-y-auto` on the modal wrapper, not z-index.

### Session 7 — July 13, 2026

**Built:** dark/light theme — `themeStore` (localStorage, applied as `data-theme` on `<html>` before first render); `index.css` CSS-variable token system; toggle in Settings → Appearance; migrated all chrome colors to tokens; `TradingChart`/`DeltaPanel` re-skin grid/axis/crosshair via `applyOptions()` without recreating the chart.
**Scope:** deliberately left semantic colors (candles, buy/sell, POC/VAH/VAL, measurement chips) constant across themes.

### Session 8 — July 13, 2026

**Built:** scroll-back pagination — `candle_stream.py` runs `relay_live()` + `handle_requests()` (`loadMore`→`historical_prepend`) concurrently; initial load 200→1000; `TradingChart` fires debounced `loadMore` near bar 0, guarded by refs; `prependCandles()` merges + de-dupes; visible range preserved across prepend; explicit last-100-bars range on load/switch.
**Delta sync (first pass):** removed post-load "align to main chart" call — diagnosis incomplete (see Session 9).

### Session 9 — July 16, 2026

**Built:** `chartTime.ts` — all epoch-ms timestamps shifted +5.5h (Asia/Colombo) before hitting lightweight-charts (`toChartTime`, `toChartTimeSeconds`, `shiftEpochSeconds`), applied across every series/overlay + all DrawingCanvas time math; default interval `1m`→`1h`.
**Delta sync — real fix:** bidirectional sync's same-tick guard didn't catch async range-change echoes (ResizeObserver relayout) → charts fought over range. Made sync **strictly one-directional** (delta follows main; main never written from delta); panel now pulls main range after its own historical load.

### Session 10 — August 2, 2026

**Audit + roadmap merge.**

- Verified codebase against PROJECT.md (all three areas): folder structure, progress-tracker items, and the Session 8/9 fixes all confirmed present and accurate.
- **Fix:** removed a stray committed temp file `backend/app/models/__init__.py.tmp.17904.8526f3603ef3` (an interrupted atomic-save that got committed instead of the real file) and created the proper `backend/app/models/__init__.py` (`from .candle import CandleRecord`).
- **Roadmap:** retired the old Sprint numbering and merged the five detailed Stage documents into this file as the single roadmap. Corrected all stage percentages against actual code (notably: Volume Profile POC/VAH/VAL and the delta histogram are already built; footprint already highlights imbalances; **Replay is 0%, not 50%**). Locked scope to **crypto only** (forex/stocks out for v1). Assigned Anchored VWAP + Fixed Range VP to Stage 2 to avoid double-building.

### Session 11 — August 2, 2026

**Stage 1 hardening pass:** audited all six order-flow/context overlays for non-BTC coin support — earlier sessions were built and tested almost exclusively against BTCUSDT.

**Fixed — single-bucket collapse on non-BTC coins:** footprint, heatmap, and volume profile all hardcoded a BTC-scale price step (nearest $10, or a flat $0.10/$1 fallback), which collapsed every trade on sub-$1 coins (XRP, DOGE, PEPE, SHIB, ...) into one bucket. Added a shared `analytics/price_step.py` helper (`price_step_for` + `fetch_current_price`) that derives the bucket step from the symbol's own current price, used by volume profile and heatmap (both bucket across the whole visible price axis).

**Important exception — do not consolidate:** footprint deliberately does **not** use `price_step_for`. It buckets trades *within a single candle*, not across the chart axis, so it needs a much finer step tied to intra-candle volatility. It uses its own `footprint_step_for(typical_range, tick_size)` (also in `price_step.py`), sized off the symbol's 80th-percentile recent 1-minute range and floored at the exchange tick size. **A future cleanup pass must not merge footprint onto the shared whole-axis helper** — it re-breaks immediately (BTC collapses back to one bucket; illiquid coins spam thousands of empty ones).

**Fixed — whale threshold never fired:** `whale_stream.py` used a flat $500K notional threshold; live sampling during this session found BTC trades rarely exceed ~$150K–$165K short-term, so the feature looked permanently broken. Replaced with a per-symbol threshold — 97th percentile of that symbol's own last 1000 aggTrades (Binance REST, sampled once when the shared listener starts), $1,000 floor, $100,000 fallback if the sample fetch fails. Example values seen during testing: BTC ~$5K–$20K depending on the moment sampled, PEPE ~$5K — both far more representative than a flat $500K. Also fixed the reconnect loop's bare `except Exception: sleep(3)`, which swallowed every error with no logging (a stuck connection was indistinguishable from a quiet market) — added `logger.warning` on lost connection and `logger.info` on threshold computation / clean cancellation.

**Known/accepted limitation:** both the whale threshold and the footprint step are computed **once**, when the listener/task starts for that symbol (i.e. on first client connect). Neither re-samples if the market regime shifts significantly mid-session. Acceptable for now — documented here so it isn't rediscovered as a surprise later.

**Verified:** all six overlays (Volume Profile, SMC, Delta/CVD, Footprint, Heatmap, Whale) render correctly on BTCUSDT, XRPUSDT, and PEPEUSDT via a live click-test — symbol switch, overlay toggles, scroll, and a full page reload, with the browser console checked and clean (no errors/exceptions) throughout. Heatmap/VP price axis scales correctly per symbol (real gradations on XRP, not collapsed); footprint renders distinct levels on PEPE instead of one flat bar; whale ticker + threshold logging both confirmed live.

**Found, not fixed today (separate from the bucket-sizing work above):** the price ticker / MarketInfo panel displays "0.00" for PEPEUSDT — its ~$0.000009 price rounds to zero under a fixed low-decimal display format elsewhere in the UI. Unrelated to today's analytics bucket-sizing fix (that only touches VP/heatmap/footprint internals, not the chart's native price display). Left for a future session.

**Cleanup-later item:** `trade_collector.py` has its own separate whale-notional check that publishes to a Redis channel (`whales:{symbol}`) nothing subscribes to — dead code. The real whale pipeline is entirely inside `whale_stream.py`, which connects to Binance directly and never touches Redis or the worker.

**Reconfirmed:** `logger.info(...)` lines in this app don't print under uvicorn's default log config (root logger defaults to WARNING — see the note under "How to Run Locally" above); only `logger.warning`+ are visible without extra setup. Came up again while debugging whale silence — a missing INFO log does not mean the code path didn't run.

**Next up:** begin closing **Stage 1, Part C** — Long Position tool, Short Position tool, then UI cleanup. (Today's hardening pass was cross-cutting infrastructure work on the Stage 2/3 overlays, not Stage 1 itself; Stage 1's own remaining scope is unchanged.)
