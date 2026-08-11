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
| 1     | Foundation & Workspace     | **✅ Done**   | Workspace, chart, live data, all drawing tools (incl. Long/Short Position, Undo), overlay/loading polish complete; a few minor items deferred (see Stage 1 notes) |
| 2     | Market Context & Structure | **~45%**   | Volume Profile core + SMC (OB/FVG) + Institutional Levels + Session VWAP + Session boxes + Market Structure (swings/trend/lines) done; BOS/CHOCH/MSS, Anchored VWAP, session H/L, dashboard not started |
| 3     | Order Flow & Execution     | **~50%**   | Footprint, Delta/CVD, Heatmap, Whale done; imbalance partial; stacked/absorption/DOM/tape not started |
| 4     | Trade Confirmation         | **~3%**    | Nothing meaningfully built yet (Replay is 0%, not 50% as previously claimed)                          |
| 5     | AI Intelligence & Polish   | **~8%**    | Theme + Docker Compose only; all AI modules not started                                               |

> **Correction note:** the earlier stage drafts overstated a few items. This document corrects them against the actual code: Volume Profile **POC/VAH/VAL are already built** (not 🔴), the **Delta panel already is a green/red histogram with CVD** (not 🔴), footprint **already highlights imbalances** (Session 4), and **Replay has no code at all** → 0%.

---

## Stage 1 — Foundation & Workspace ✅ Done

**Objective:** a stable, high-performance, professional trading workspace that every later stage depends on. Not about strategies or indicators — about the infrastructure and UX that make advanced tools possible.

### Done ✅

- **Binance market data:** live trades, live candles, historical candles, order book, multi-symbol (all USDT pairs via search), multi-timeframe (1m–1M)
- **Backend infrastructure:** FastAPI, Redis, PostgreSQL, async processing, WebSocket fan-out
- **Chart engine:** candlesticks, zoom, pan, crosshair, resize, timeframe change, historical navigation (scroll-back pagination — Session 8), Asia/Colombo timezone (Session 9)
- **Drawing engine:** Cursor, Crosshair, Trend Line, Horizontal Line, Horizontal Ray, Vertical Line, Rectangle, Rotated Rectangle, Circle, Brush, Arrow (+ marks), Fibonacci (with settings modal), Parallel Channel, Regression Channel, **Long Position, Short Position** (entry/stop/target box, live RR + % readout, profit/loss color pickers), Clear All, **Undo (Ctrl+Z)** — all movable/resizable with floating style toolbar (Session 3; Long/Short Position built July 6–16 across commits `de4f7f6`/`91bf57d`/`2f92b41` but never logged here — reconciled Session 12; Undo built Session 12/13)
- **Workspace:** collapsible sidebar rail, top toolbar, dark/light theme (Session 7), watchlist (persisted, live search), market info panel, snapshot/screenshot, full screen, settings modal
- **UI polish (Session 14):** all five canvas overlays (SMC, Footprint, Heatmap, Volume Profile, Whale markers) now clear their draw state immediately on symbol/timeframe switch instead of leaving the old symbol's boxes/markers floating over a blank chart; added a loading spinner over the chart area for both symbol and timeframe switches (timeframe switch previously had no loading feedback at all); Escape now deselects a placed drawing, fixing a stuck floating style-toolbar fragment that could linger in the drawing rail after switching symbol/timeframe with a drawing still selected

> **Session 11 note:** the Stage 2/3 order-flow overlays (Volume Profile, SMC, Delta/CVD, Footprint, Heatmap, Whale) went through a hardening + verification pass — non-BTC coin support fixed, whale threshold fixed, all six confirmed working live. This is cross-cutting work on other stages, not Stage 1 itself.
>
> **Session 12 correction:** Long Position and Short Position (listed here as "next up" in the original Session 11 note) turned out to already be fully built and committed weeks earlier (July 6–16) — just never logged. **Part C** now = UI cleanup only.
>
> **Session 13 note:** Undo (Ctrl+Z) — flagged as missing in Session 12 — is now built: per-action history snapshots (add/update/delete/clearAll) with 400ms coalescing for slider/input drags, scoped so it doesn't hijack typing in search/text inputs.
>
> **Session 14 note — Stage 1 closed.** A UI polish pass fixed the two most demo-visible bugs found by a live audit (stale overlay renders + missing loading feedback on switch; the stuck style-toolbar fragment after Escape). Remaining polish items (general spacing/toolbar cleanup, responsive layout, performance passes) are real but non-blocking — recorded below as deferred rather than held against Stage 1's close, since none of them affect correctness of the core workspace.

> **Ownership note (carried forward):** Anchored VWAP and Fixed Range Volume Profile toolbar buttons were evaluated for Stage 1 but are **owned by Stage 2** (they need analytics engines that live there) — Stage 1 was never blocked on them.

### Stage 1 — deferred / known items (not blocking close)

| Item | Status | Notes |
| --- | --- | --- |
| Responsive layout for smaller screens | 🟡 Unverified | Codebase has zero responsive breakpoints (`sm:`/`md:`/`lg:` or `@media`) anywhere in `frontend/src`; browser-resize testing was broken in-session, so this was never visually verified below ~1920px. Deferred by decision, not fixed. |
| Watchlist toggle icon size | 🟡 Minor | `SidebarRail.tsx` — 26px icon vs. the 20px standard used everywhere else in the toolbar (`ChartToolbar.tsx`, `DrawingToolbar.tsx`). |
| Price Range / Date Range drawing tools undocumented | 🟡 Doc gap | Fully built (same files/toolbar group as Long/Short Position) but never added to this document's Done list — flagged Session 12, still not added. |
| Dead code: `trade_collector` whale check | 🟡 Backend | Publishes to a Redis channel nothing subscribes to. |
| `app` logger `.info` lines silent under uvicorn | 🟡 Backend | Default uvicorn log config drops them; only warnings/errors currently surface. |

---

## Stage 2 — Market Context & Structure (~45%, in progress)

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
| **Market Structure**         | Trend detection (bull/bear/side)                   | ✅ Done _(Session 18)_ — HH+HL / LH+LL, else ranging           |
|                              | Swing High detection                               | ✅ Done _(Session 18)_ — fractal, `swing_strength=3` tunable   |
|                              | Swing Low detection                                | ✅ Done _(Session 18)_ — fractal, `swing_strength=3` tunable   |
|                              | Structure lines                                    | ✅ Done _(Session 18)_ — zigzag through consecutive swings     |
| **VWAP**                     | Session VWAP                                       | ✅ Done _(Session 16)_ — intraday timeframes only              |
|                              | Anchored VWAP _(owns S1 button)_                   | 🔴                                                            |
|                              | Fixed Range VP _(owns S1 button)_                  | 🔴                                                            |
|                              | VWAP bands                                         | 🔵                                                            |
| **Institutional Levels**     | Daily Open                                         | ✅ Done _(Session 15)_                                        |
|                              | Prev Day High (PDH)                                | ✅ Done _(Session 15)_                                        |
|                              | Prev Day Low (PDL)                                 | ✅ Done _(Session 15)_                                        |
|                              | Prev Week / Month High / Low                       | 🔵 Future                                                     |
| **Session Analysis**         | Asia session box _(00:00–09:00 UTC)_               | ✅ Done _(Session 17)_ — intraday timeframes only              |
|                              | London session box _(07:00–16:00 UTC)_             | ✅ Done _(Session 17)_ — intraday timeframes only              |
|                              | New York session box _(12:00–21:00 UTC)_           | ✅ Done _(Session 17)_ — intraday timeframes only              |
|                              | Session High / Low                                 | 🔴                                                            |
| **Market Context Dashboard** | Summary of all of the above                        | 🔴                                                            |

**Development priority:** Phase 1 complete → POC/VAH/VAL + Daily Open/PDH/PDL + Session VWAP all done. Phase 2 (in progress) → Market Structure swings/trend/lines done (Session 18); BOS/CHOCH/MSS/Liquidity Sweep next, and they build directly on the Session 18 swing points. Phase 3 → Session boxes (done early, Session 17), Anchored VWAP, Context Dashboard.

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

### Session 12 — August 2, 2026

**Doc reconciliation, no code changes.** Asked to build Long/Short Position — investigation found both **already fully implemented**: `PositionDrawing` type in `drawingStore.ts`, full render/drag/hit-test handling in `DrawingCanvas.tsx`, toolbar icons + "Prediction & measurement" group entry in `DrawingToolbar.tsx`, profit/loss color swatches in `DrawingStyleToolbar.tsx`. Built across commits `de4f7f6` (Jul 6), `91bf57d` (Jul 8), `2f92b41` (Jul 16) — weeks before Session 11 — but never logged in this file, so Stage 1's Remaining table still listed them as 🔴. Verified live in code (not just grepped): placement, independent drag on target/stop lines, whole-tool drag on entry (matches TradingView UX — confirmed as intended, not a bug), RR + % labels, style toolbar colors all present and correct.

**Re-audited the rest of Stage 1's "not-built" list against actual code** while already in there:

| Item | Doc claimed | Code actually has | Verdict |
| --- | --- | --- | --- |
| Long Position tool | 🔴 not built (Remaining, Part C) | ✅ fully built (see above) | **Drift — corrected** |
| Short Position tool | 🔴 not built (Remaining, Part C) | ✅ fully built (see above) | **Drift — corrected** |
| Anchored VWAP button | 🔴 not built, Stage 2-owned | 🔴 confirmed — zero matches for `VWAP`/`vwap` anywhere in `frontend/src` | Doc correct |
| Fixed Range VP button | 🔴 not built, Stage 2-owned | 🔴 confirmed — zero matches for `Fixed Range`/`fixedRangeVp` anywhere in `frontend/src` | Doc correct |
| Undo (Ctrl+Z) | ✅ done (Drawing engine bullet) | ❌ confirmed — zero matches for `undo`/`Undo` anywhere in `frontend/src`; only Escape (cancel) and Delete/Backspace (delete selected) keybinds exist | **Drift — corrected** (moved to Remaining) |
| Clear All | ✅ done | ✅ "Remove All Drawings" button wired to `clearAll()` | Doc correct |

**Bonus finding (out of scope, not actioned):** Price Range and Date Range drawing tools are *also* fully built (same files, same "Prediction & measurement" toolbar group) but appear nowhere in this document — not in Done, not in Remaining. Flagged for a future session; not added here to keep this pass scoped to what was asked.

**Fixed:** Stage 1 Done list, Remaining table, Session 11's stale "next up" note, and the Stage 1 / overall completion percentages (~90%→~93%) all updated to match actual code.

### Session 12/13 — August 2, 2026

**Undo (Ctrl+Z) implemented**, closing the gap flagged earlier this session. `drawingStore.ts` gained a `history: Drawing[][]` stack — a snapshot of `drawings` is pushed before every mutating action (`addDrawing`, `updateDrawing`, `deleteDrawing`, `clearAll`), capped at 50 entries. `undo()` pops the last snapshot back into `drawings`. Continuous-input actions (opacity slider drags, Fib settings number inputs) call `updateDrawing` on every tick, not just on commit, so a single gesture would otherwise blow through the whole history cap — fixed with a 400ms coalescing window keyed by drawing id, so rapid same-id updates collapse into one history entry.

Ctrl+Z is wired in `DrawingCanvas.tsx`'s keydown handler: if a shape/brush stroke is still mid-placement, Ctrl+Z cancels it (same as Escape) rather than reaching into history, since the in-progress shape isn't committed to `drawings` yet. Otherwise, and only when drawings aren't locked, it calls `undo()`. Verified the handler doesn't hijack typing in the symbol search box or other text inputs.

**Stage 1 status:** Undo moved from Remaining 🔴 to Done ✅. Only UI cleanup, responsive layout, and performance polish remain to close Stage 1.

### Session 14 — August 2, 2026

**UI polish pass, closing Stage 1.** Started from a live audit of the running app (resizing, spacing, toolbar/icons, loading states) and fixed the two most demo-visible bugs it found:

1. **Stale overlay renders + missing loading feedback on symbol/timeframe switch.** All five canvas overlays (`SMCOverlay.tsx`, `FootprintCanvas.tsx`, `HeatmapCanvas.tsx`, `VolumeProfile.tsx`, `WhaleMarkers.tsx`) cleared their data ref synchronously on switch but never redrew at that moment, so the previous symbol's Order Block/FVG boxes, footprint bars, etc. stayed visible over a blank chart until new data arrived. `SMCOverlay` and `VolumeProfile` had a second, compounding bug: their draw functions bailed out before `clearRect` when data was null, so even a triggered redraw wouldn't have cleared the canvas. Fixed the clear-before-bail ordering in both and added the missing redraw call after clearing each overlay's ref. Added `ChartLoadingOverlay.tsx` — a centered spinner shown whenever `candles.length === 0`, which is reset synchronously on both symbol and interval switch, covering the timeframe-switch case that previously had no loading indicator at all.
2. **Orphaned style-toolbar fragment stuck after Escape.** `DrawingCanvas.tsx`'s Escape handler only cancelled an in-progress multi-click shape/brush stroke — it never deselected an already-placed, already-selected drawing. The floating style toolbar (`DrawingStyleToolbar.tsx`) correctly hides when nothing is selected, but with the stale selection surviving Escape, a subsequent symbol/timeframe switch resolved the toolbar's position against the drawing's now-invalid coordinates, clamping it to the top-left corner of the drawing rail instead of hiding. Escape now also calls `selectDrawing(null)`. Click-elsewhere and Delete were already correct (verified, unchanged).

Both fixes verified live (BTC↔ETH, 1h→15m→1m, all five overlays active; draw→select→Escape and draw→select→Escape→switch-timeframe repros). Typecheck clean.

**Stage 1 closed.** Remaining polish items (general spacing/toolbar cleanup, responsive layout, performance passes) are real but non-blocking, and recorded as deferred rather than held against the close — see the "Stage 1 — deferred / known items" table above.

### Session 15 — August 3, 2026

**Stage 2 feature 1: Institutional Levels (Daily Open, PDH, PDL).** First Stage 2 feature built and verified live.

**Backend:** new `app/analytics/levels.py` — `compute_levels()` derives today's daily open and the prior day's high/low straight from Binance's own last two 1d candles (no timezone math needed, since Binance's daily boundary is authoritative). Wired up via a new `GET /indicators/levels/{symbol}` endpoint in `indicators.py`, reusing the existing `price_step.py` helper for decimal precision.

**Frontend:** new `LevelsOverlay.tsx` — draws Daily Open (dashed grey), PDH (orange), PDL (cyan) lines, toggled from `ChartToolbar` (`levels` added to `OverlayType`). Iterated on label placement after an initial pass drew labels hard against the right-edge price axis, colliding with the axis's own price numbers: labels now right-align inside the plotting area using the chart's actual right price-scale width (`chart.priceScale('right').width()`, not a guessed fixed offset, so it stays correct at any zoom/decimal width), rendered as colored pill backgrounds with auto-computed black/white contrast text (readable regardless of theme since the pill supplies its own contrast, independent of the app's light/dark toggle — which only affects UI chrome, not the chart canvas). A sort-and-nudge pass keeps labels vertically separated by a minimum gap when two levels sit close together, verified down to the extreme case (price scale compressed until PDH/Daily Open lines nearly touch) with no overlap.

**Debugging lesson — zombie uvicorn processes serving stale code:** while verifying the new `/levels` route, `/docs` didn't list it even though the server "started with zero errors." `python -c "import app.api.indicators"` proved the module and route were fine — the router had it registered. The real problem: multiple orphaned `uvicorn --reload` processes had piled up from earlier sessions (reloader parents had already died, but their spawned worker subprocesses lived on as zombies still holding port 8000), and the zombie actually bound to the port was running code from before the new route existed — no file edit could ever reach it. **Fix pattern for next time a new route silently 404s / is missing from `/docs` despite a clean server start:** check what's actually listening on the port (`netstat -ano` / `Get-NetTCPConnection`), kill *all* stray python/uvicorn processes (not just the most recent terminal's), confirm the port is fully free, then start a single fresh instance.

**Verified live in browser:** BTC and a cheap coin, both themes, lines at correct prices, labels clear of the axis with no collisions, pill contrast readable, anti-collision nudge confirmed under compression.

**Stage 2 status:** Institutional Levels → Daily Open, PDH, PDL done; Prev Week/Month High/Low remains future scope. Stage 2 now in progress (~20% → ~25%).

### Session 16 — August 11, 2026

**Stage 2 feature 2: Session VWAP.** Second Stage 2 feature built and verified live, completing Phase 1 of the Stage 2 priority list.

**Backend:** new `app/analytics/vwap.py` — `compute_session_vwap()` accumulates `Σ(typical_price × volume) / Σ(volume)` with `typical_price = (h+l+c)/3`, emitting a running value per candle rather than a single number, so the frontend can draw a line that tracks across the day. The session resets at **00:00 UTC** (`utc_day_start_ms()`) — the same boundary Binance's own 1d candles use, so it lines up with `levels.py`'s Daily Open/PDH/PDL. Deliberately *not* the chart's display timezone: the chart renders Asia/Colombo wall-clock time (see `chartTime.ts`), but a viewer-dependent reset would show different people a different VWAP for the same symbol. Candles before the session start are ignored (so passing extra history is harmless), and zero-volume candles emit no point, avoiding a divide-by-zero on a dead session open. Decimals come from the existing `price_decimals_for(tick_size)`, same as levels. Exposed as `GET /indicators/vwap/{symbol}/{interval}` on the same router as `/levels` and `/smc` — interval is in the path because VWAP is computed per-candle, so the viewing timeframe genuinely changes the series.

**Binance 1000-row paging fix:** `_fetch_klines` was extended to return volume (`v`) and accept `start_time`, and a new `_fetch_klines_since()` pages until a short page comes back. This was necessary, not incidental: Binance caps a klines response at 1000 rows, but a full UTC day at `1m` is 1440 candles — a single request would have silently truncated the session from mid-afternoon onward, producing a VWAP that looked plausible but quietly stopped including the most recent hours. The volume field is additive, so `/smc` and `/levels` ignore it.

**Frontend:** new `VWAPOverlay.tsx` — drawn as a real lightweight-charts **line series** rather than a canvas overlay. This is the deliberate departure from `LevelsOverlay`'s canvas approach: levels are horizontal lines at fixed prices, which canvas draws directly, but VWAP is a time-series line, so handing it to the library gives time-axis alignment, clipping, and price-scale autoscaling for free and keeps it glued to the candles through any zoom/pan. Timestamps still go through `toChartTime()` like every other series. Series teardown is guarded on `sharedChartRef.current === chart`: if `TradingChart` unmounts first it has already called `chart.remove()`, which disposes every series, and calling `removeSeries` on that would throw. Refresh is keyed on the last candle's `t` — which `appendCandle` only changes when a *new bar opens*, not on every intra-bar tick — plus a 30s poll so the still-forming candle stays fresh. Label is a small legend under `TradingChart`'s existing symbol/price row, using the backend's tick-size decimals so sub-cent coins don't read "0.00". Toolbar toggle `VWAP` added to `OverlayType`, off by default.

**Design decision — intraday only, hidden on 1d+:** on `1d` and above a UTC-day session contains exactly one candle, so the "line" degenerates to a single invisible point. Rather than fake it, the overlay renders nothing and hides its label on those timeframes (the endpoint 404s with "No traded volume in this session yet" / no candles, which the overlay swallows silently). Session VWAP is an intraday tool by nature; if a daily-anchored variant is wanted later, that's Anchored VWAP's job, which is still 🔴 and owns its own S1 toolbar button.

**Verified:** hand-checked math (typical prices 100 @ vol 1 then 200 @ vol 3 → 100.0, then 175.0), zero-volume skip, pre-session exclusion, empty input. Live against Binance: BTC 1m (265 candles → 64052.86) vs BTC 1h (5 candles → 64056.62) agreeing within ~$4 is the cross-check that the accumulation is correct at different timeframes; PEPE 5m returned 8 decimals, cheap-coin safe. Frontend typecheck clean. Verified in browser on BTC 1h — line tracks today's session, label clean, value correct.

**Note:** the backend restart went cleanly this time — port 8000 was checked before starting (nothing listening, no stray python processes), applying Session 15's zombie-process lesson up front rather than after a confusing 404.

**Stage 2 status:** VWAP → Session VWAP done; Anchored VWAP, Fixed Range VP and VWAP bands unchanged. Phase 1 of the Stage 2 priority list is now complete (POC/VAH/VAL + Daily Open/PDH/PDL + Session VWAP); Phase 2 (BOS/CHOCH/MSS/Liquidity Sweep) is next. Stage 2 ~25% → ~30%.

### Session 17 — August 11, 2026

**Stage 2 feature 3: Session Boxes (Asia / London / New York).** Shaded vertical bands marking each major session's active hours, one set per UTC day across the visible range. Pulled forward from Phase 3 of the Stage 2 priority list.

**Fully client-side — no backend route.** Session hours are fixed clock times (Asia 00:00–09:00, London 07:00–16:00, NY 12:00–21:00 UTC), so there is nothing for the server to compute: everything is derived from the candles already in `marketStore`. The UTC basis is deliberate, matching `levels.py` and `vwap.py` so all three features share one day boundary. The windows overlap on purpose — London/NY is the high-activity window — and the translucent fills stack, so that overlap reads visibly darker than either session alone.

**Positioned by interpolated bar index, NOT by `toChartTime`.** This is the one place where following the established overlay pattern would have been wrong, and it's worth recording why. Every other overlay converts a timestamp with `toChartTime`/`toChartTimeSeconds` and calls `timeScale().timeToCoordinate()`. That works for them because they only ever plot times that *are* candle timestamps. Session boundaries aren't: 07:00 is mid-candle on a 2h/3h/4h chart, where bars open at 00/02/04/… or 00/04/08/…, and `timeToCoordinate()` returns `null` for any time not present in the series data. Following the pattern would have made the bands silently vanish on exactly those timeframes — a null return, not a visible error. Instead `timeToLogical()` interpolates a fractional bar index from the candles' own **raw UTC** `t` values and goes through `logicalToCoordinate()`, which handles sub-candle times, extrapolates past both data edges, and — because lightweight-charts lays bars out by index rather than elapsed time — stays correct across gaps in the data, where a linear time→x mapping would drift.

**Corollary — the Colombo shift must NOT be applied on this path.** `CHART_TZ_OFFSET_SECONDS` exists for values handed to the library as a `time`. These timestamps are only ever compared against the candles' own raw `t` to derive an index, and the index is what maps to a pixel, so applying the shift would have slid every band 5.5h off the candles it describes. (The first draft did apply it; caught and removed before the browser test.) Verified the index math against hand-computed values on 1h/4h/15m — notably 07:00 → index 1.75 on 4h, i.e. three-quarters through the 04:00–08:00 bar — plus multi-day offsets, extrapolation past both edges, and a deliberately gapped series.

**Display rules:** bands are inset from the price and time axes so the axes aren't tinted; hidden on 1d+ where a whole session is sub-candle (same principle as session VWAP); and hidden below **~45px per day**, where three overlapping bands collapse into an illegible stripe — a guard that doubles as the bound on how many days can be drawn at once, so a zoomed-out chart never tries to paint hundreds of boxes. Fill alpha is 0.06 so three overlapping bands still don't drown the candles, and each session labels itself on its own row so labels stay legible through the overlap. Toolbar toggle `Sessions`, off by default; renders first among the z-10 overlays so zones, levels and drawings layer above it.

**Verified live in browser:** BTC intraday — Asia/London/NY bands align correctly against the Colombo-shifted axis (NY correctly crosses displayed midnight), overlap shading correct. Frontend typecheck clean.

**Stage 2 status:** Session Analysis → Asia, London, New York boxes done; Session High/Low remains 🔴. Stage 2 ~30% → ~35%.

### Session 18 — August 11, 2026

**Stage 2 feature 4: Market Structure (swings + trend labels + structure lines).** The largest Stage 2 feature so far, and the first built in explicitly verified layers.

**Layered build approach — and why it mattered.** Rather than building the whole feature and verifying at the end, this was built as three layers with a browser check between each: (1) swing detection alone, (2) HH/HL/LH/LL labels + `current_trend`, (3) the connecting zigzag. The reason is dependency: labels are defined *relative to* swings, the trend is derived *from* labels, and BOS/CHOCH in Phase 2 will be defined against these same swing points. A wrong pivot silently corrupts everything above it, and would have been far harder to isolate if all three layers landed together. Layer 1 was confirmed on BTC 1h (placement accurate, density good) before layer 2 was written. This is a pattern worth repeating for BOS/CHOCH.

**Layer 1 — swing detection.** New `app/analytics/structure.py`: fractal/pivot method, where a candle is a swing high if its high beats every candle within `swing_strength` bars on each side (mirror for lows). Exposed at `GET /indicators/structure/{symbol}/{interval}` on the same router as `/levels` and `/vwap`, with **`swing_strength` default 3** (range 1–20) and `limit` (default 200) as query params — deliberately tunable without a code change, since the useful sensitivity depends on timeframe and coin. BTC 1h gives 55 swings at strength 2, 36 at 3, 29 at 5; 3 was verified as the right density. Comparison is strict on the left and inclusive on the right rather than the textbook strict-both-sides, because strict-both-sides silently drops pivots whenever adjacent candles share an exact high or low — rare on BTC, routine on sub-cent coins where prices repeat at tick size. A flat double-top therefore yields exactly one swing, at the first candle of the plateau. **Inherent property to remember:** the most recent `swing_strength` candles can never be classified — a pivot isn't confirmed until enough candles print to its right, so detection always lags the live edge by that many bars. That's the method, not a defect.

**Layer 2 — trend labels.** Each swing is classified against the previous swing of the *same* type (high vs last high, low vs last low). `current_trend` reads the most recent labelled high and low **together**: HH+HL → up, LH+LL → down, anything mixed → range. It requires both sides labelled, so it reports `range` rather than guessing from one side alone. The first swing of each type keeps `label=None` (nothing to compare against) and the frontend draws no tag for it. Exact ties resolve to LH/LL — a double top isn't a higher high, and the four-label vocabulary has no separate "equal" state.

**Layer 3 — structure lines, and the deliberate decision NOT to filter pivots.** The zigzag connects swings in strict chronological order. This does **not** enforce high→low→high alternation, because fractal detection genuinely emits consecutive same-type swings — measured at 5 of 36 adjacent pairs on BTC 1h and 10 of 36 on 15m. Filtering those out (keeping only the most extreme of each run) would produce a tidier zigzag, and was explicitly rejected: **the discarded points are real pivots, and BOS/CHOCH is defined against exactly those swing points.** A prettier line now would mean a structurally wrong break/shift signal later. The occasional flatter high→high or low→low segment is the honest shape of the data, and is expected on the chart rather than a bug.

**Frontend.** New `StructureOverlay.tsx`. Unlike `SessionBoxes`, swings sit on real candle timestamps, so the standard `toChartTimeSeconds` + `timeToCoordinate` path resolves exactly and every marker lands on its own candle — the bar-index workaround from Session 17 isn't needed here. Triangles point apex-at-the-candle; colours reuse the levels palette (orange = high, cyan = low) for a consistent "orange is a high, cyan is a low" reading across the app. Two zoom thresholds rather than one: the HH/LH tag is the point of the feature and shows at bar spacing ≥9, while the price is secondary detail shown only at ≥18, so the two never compete for the same gap. The zigzag is clipped to the plot area rather than filtered by visibility, so a segment leaving the viewport exits at the correct angle instead of bending toward the edge. Trend badge sits bottom-left — the only corner clear of the symbol/VWAP legends at the top and the Session 17 session labels below them. Toggle `Structure`, off by default. **No 1d restriction**, unlike VWAP and session boxes: pivots are a bar-count method with no inherent timeframe meaning, so hiding them on daily would be arbitrary.

**Verified:** every reported swing is provably the extreme of its own window (0 mismatches across BTC 1h/15m and PEPE 1h); all three trend outcomes exercised on hand-built zigzags plus the tie and unlabelled-first cases; live reads BTC 1h `range`, BTC 15m `up`, PEPE 1h `down`. Browser-verified on BTC — labels spot-checked against prices, trend matches price action. Typechecks clean both sides.

**Stage 2 status:** Market Structure → trend detection, swing high, swing low, structure lines all done. BOS/CHOCH/MSS and Liquidity Sweep remain 🔴 and build directly on these swing points. Stage 2 ~35% → ~45%.
