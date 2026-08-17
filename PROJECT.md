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
| 2     | Market Context & Structure | **✅ Done**   | All 6 planned features shipped: Institutional Levels, Session VWAP, Session boxes, Market Structure (swings/trend/lines), SMC expansion (OB/FVG/BOS/CHOCH/Liquidity Sweep), Market Context Dashboard; several nice-to-have sub-items deliberately deferred (see Stage 2 notes) |
| 3     | Order Flow & Execution     | **~90%**   | **Closed** — Footprint (incl. reliable backfill + readability), Delta/CVD, Heatmap, Whale, DOM, Tape, Imbalance, Stacked Imbalance, Absorption, and the Execution Dashboard are all done and verified, including the last cosmetic loose end; remaining items are secondary polish (see Stage 3 notes) |
| 4     | Trade Confirmation         | **~38%**   | Position Calculator _(Session 29)_, Trade Checklist _(Session 30)_, and Cluster Scanner _(Session 31)_ done and verified; everything else not started (Replay is 0%, not 50% as previously claimed) |
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

## Stage 2 — Market Context & Structure ✅ Done

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
|                              | Break of Structure (BOS)                           | ✅ Done _(Session 19)_ — close-based continuation             |
|                              | Change of Character (CHOCH)                        | ✅ Done _(Session 19)_ — close-based reversal warning         |
|                              | Market Structure Shift (MSS)                       | 🟡 Flagged — MSS and CHOCH (Session 19) are the same signal in most SMC frameworks; not built as a separate feature pending a call on whether it needs to be distinct |
|                              | Liquidity Sweep                                    | ✅ Done _(Session 19)_ — wick-based, mutually exclusive with BOS/CHOCH |
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
| **Market Context Dashboard** | Summary of all of the above                        | ✅ Done _(Session 20)_ — 6-row panel, 2-of-3 majority Bias      |

**Development priority — complete.** All three phases of the original plan shipped: Phase 1 (POC/VAH/VAL + Daily Open/PDH/PDL + Session VWAP), Phase 2 (Market Structure swings/trend/lines — Session 18; BOS/CHOCH/Liquidity Sweep — Session 19), Phase 3 (Session boxes — Session 17; Market Context Dashboard — Session 20, tying the other five features together into one panel). Stage 2's objective — help the trader read market context at a glance — is met. Remaining sub-items below are real but non-blocking, same as Stage 1's deferred list.

### Stage 2 — deferred / future (not blocking completion)

| Item | Status | Notes |
| --- | --- | --- |
| Volume Profile HVN / LVN | 🔴 | High/low-volume node highlighting on top of the existing POC/VAH/VAL. |
| Volume Profile Developing POC (live) | 🔴 | Live-updating POC as the current session builds, vs. the static per-request profile today. |
| Volume Profile Composite (multi-day) | 🔵 Future | Explicitly out of scope for now. |
| Market Structure Shift (MSS) | 🟡 Flagged | MSS and CHOCH (Session 19) describe the same event — the first structure break against the prevailing trend — in most SMC frameworks. Not built as a separate feature; flagged rather than closed so it isn't silently dropped if a distinct definition turns out to be wanted later. |
| Equal Highs / Equal Lows | 🔴 | Not built. |
| Premium / Discount zones | 🔵 Future | Explicitly out of scope for now. |
| SMC mitigation (fade zones once price re-enters) | 🔴 | Carried over from Session 4, still open. |
| Anchored VWAP _(owns a Stage 1 toolbar button)_ | 🔴 | Button exists, unwired — needs its own analytics engine. |
| Fixed Range VP _(owns a Stage 1 toolbar button)_ | 🔴 | Same as above. |
| VWAP bands | 🔵 Future | Explicitly out of scope for now. |
| Prev Week / Month High / Low | 🔵 Future | Institutional Levels currently covers daily only. |
| Session High / Low | 🔴 | Not built; Session boxes (Asia/London/NY) themselves are done. |

---

## Stage 3 — Order Flow & Execution (~90% — closed)

**Objective:** understand what is happening _right now_ — the live battle between buyers and sellers. Answers _"Is this the right time to enter?"_

| Module                    | Feature                                         | Status                                                           |
| ------------------------- | ----------------------------------------------- | ---------------------------------------------------------------- |
| **Footprint**             | Bid × Ask footprint                             | ✅ Done                                                          |
|                           | Historical backfill (cold-start ~50 candles)    | ✅ Done, reliable _(Session 24 build; Session 25 fixed a silent one-shot-fetch bug that made it intermittent — see below)_ |
|                           | Buy/Sell volume, Candle Delta                   | ✅ Done                                                          |
|                           | Imbalance highlight (5× ratio box)              | ✅ Done _(Session 4 — was wrongly marked 🔴)_                    |
|                           | Number readability (row/font sizing)            | ✅ Done _(Session 28 — `_FOOTPRINT_TARGET_LEVELS` 10→4 for taller rows, verified against live Binance data to confirm cheap coins stay floored at tick_size; also fixed the STACK/ABS label overlap the taller rows exposed)_ |
|                           | Volume / Delta footprint modes                  | 🟡 Partial                                                       |
|                           | Large Volume Highlight                          | 🔴                                                               |
|                           | Zero Prints, Unfinished Auction                 | 🔴                                                               |
| **Delta**                 | Delta, Bar Delta                                | ✅ Done                                                          |
|                           | Cumulative Delta (CVD)                          | ✅ Done                                                          |
|                           | Delta Histogram                                 | ✅ **Done** (green/red bars — _was wrongly marked 🔴_)           |
|                           | Session Delta, Delta Divergence                 | 🔴                                                               |
| **Imbalance (dedicated)** | Buy/Sell imbalance, custom ratio (default 300%) | ✅ Verified working _(Session 25 — confirmed live: ratio input correctly changes flagged-level count, loose→many/strict→few; it was never actually broken, still no standalone module)_ |
| **Stacked Imbalance**     | Consecutive imbalances + highlight              | ✅ Verified working _(Session 26 — `findStackRuns()` built on the existing `isImbalance()`; confirmed live on BTC 1m, bracket correctly spanned an 8+ level sell-side stack)_ |
| **Absorption**            | Hidden institutional buying/selling             | ✅ Done _(Session 26 build; verified this session and Session 27 — ABS chips confirmed landing on the flagged $10-range candle, and now confirmed feeding the Execution Dashboard's Absorption row correctly too)_ |
| **Execution Dashboard**   | Order-flow "should I enter now?" summary panel  | ✅ Done _(Session 27 — mirrors ContextDashboard's read-not-recompute pattern; Delta/Absorption/Stack/Whale rows + derived Execution Bias; verified live, rows matched DeltaPanel/whale ticker exactly)_ |
| **Liquidity Heatmap**     | Order book heatmap                              | ✅ Done                                                          |
|                           | Liquidity zones, large-order highlight          | 🔴                                                               |
| **Whale Detection**       | Detection + sidebar ticker                      | ✅ Done                                                          |
|                           | History, alerts, statistics                     | 🔴                                                               |
| **Time & Sales (Tape)**   | Live tape                                       | ✅ Done _(Session 23)_ |
|                           | Aggressive Buyers/Sellers (buy/sell coloring)   | ✅ Done _(Session 23)_ |
|                           | Large Trade filter                              | 🟡 Partial _(Session 23 — highlights large prints inline; no filter to hide/isolate them)_ |
| **DOM (Depth of Market)** | Live order book                                 | ✅ Done _(Session 22)_ |
|                           | Bid Size                                        | ✅ Done _(Session 22)_ |
|                           | Ask Size                                        | ✅ Done _(Session 22)_ |
|                           | Liquidity (per-level size bars highlight walls) | ✅ Done _(Session 22 — per-row bar length, not clustered zone detection; see Heatmap's separate "Liquidity zones" row above for that)_ |

**Design direction (recommended):** rather than scattered indicators, build a single **Order Flow Workspace** — main chart on top; Footprint / DOM / Tape as a synchronised row; Delta / CVD / Heatmap / Whale / Execution along the bottom. This mirrors how ATAS users actually watch multiple order-flow signals at once.

> **Session 21 audit note — data-source attribution corrected.** A read-only Stage 3 audit found the architecture table below (and the notes above) previously misattributed live data to `depth_collector.py` / `trade_collector.py`. Those two collector modules are **dead code**: they're defined, publish to Redis channels (`depth:{symbol}`, `trades:{symbol}`, `whales:{symbol}`), but nothing subscribes to those channels and neither module is ever imported anywhere else in the codebase. The real pattern actually in use — identical across Footprint, Delta, Heatmap, and Whale — is that **each `*_stream.py` file opens its own direct Binance WebSocket connection** (`aggTrade` or `depth20@100ms`), shared per-symbol across all connected browser clients via module-level dicts. `heatmap_stream.py` has its own direct `depth20` connection; `whale_stream.py` has its own direct `aggTrade` connection; neither goes through the collectors. Building DOM/Tape means writing a new stream file following this same proven pattern (not wiring onto the collectors) — see [Stage 3 — deferred / tech debt](#stage-3--deferred--tech-debt) below.

### Stage 3 — deferred / tech debt

| Item | Status | Notes |
| --- | --- | --- |
| Duplicate per-symbol Binance connections | 🟡 Tech debt | Now 6 independent direct Binance WS connections per symbol: 4× aggTrade (`footprint_stream.py`, `delta_stream.py`, `whale_stream.py`, `tape_stream.py`) + 2× depth20 (`heatmap_stream.py`, `dom_stream.py`). Could consolidate into one shared per-symbol connection with fan-out to accumulators someday; not blocking. |
| `depth_collector.py` / `trade_collector.py` orphaned | 🟡 Tech debt | Dead code — defined, publish to Redis channels nothing subscribes to, never imported. Either delete, or repurpose as the actual shared-connection layer if/when the duplicate-connections item above gets tackled. |
| Duplicate imbalance definitions | 🟡 Tech debt | The live footprint path (`_is_imbalance` in `analytics/footprint.py`) uses a 5× ratio with a 0.5 min-volume floor; the legacy REST-only `build_footprint()` in the same file uses a 70% one-side-dominance rule instead. Pick one definition when building the dedicated Imbalance module (item 5 in the Stage 3 table above). |
| Execution Dashboard's Whale/Stack rows depend on their source overlays | 🟢 By design | `WhaleMarkers` and `FootprintCanvas` each own the WebSocket connection that feeds `whaleStore`/`footprintSignalStore` — the Execution Dashboard deliberately reads those stores rather than opening duplicate connections, so its Whale/Stack rows show `—` until Whales/Footprint are also toggled on. Not a bug; documented in `ExecutionDashboard.tsx`'s header comment. |

---

## Stage 4 — Trade Confirmation & Decision Support (~38%)

**Objective:** confirm whether a setup is worth taking by combining multiple independent signals. Answers _"Is this trade worth taking?"_

| Module                                                             | Status                                                             |
| ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Open Interest analysis (OI, OI change, funding)                    | 🔴 _(needs Binance **futures** API — currently only spot streams)_ |
| Liquidation analysis / heatmap                                     | 🔴                                                                 |
| Cluster Scanner (auto-detect large delta/volume/absorption/whales) | ✅ Done _(Session 31)_ — live feed, per-type de-dupe, active-symbol-only (v1 scope) |
| Professional Trade Checklist                                       | ✅ Done _(Session 30)_ — hybrid auto+manual, live verdict, cross-checked against Context/Execution |
| Position Calculator (size, $ risk, RR)                             | ✅ Done _(Session 29)_ — risk-based position sizing, RR, verified by hand |
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
| Heatmap                              | `analytics/heatmap.py`, `heatmap_stream.py` (own direct `depth20` Binance WS) | `HeatmapCanvas.tsx`                                            |
| Whale                                | `whale_stream.py` (own direct `aggTrade` Binance WS)               | `WhaleMarkers.tsx`, `WhaleTicker.tsx`, `whaleStore.ts`         |
| SMC                                  | `analytics/smc.py`, `api/indicators.py`                           | `SMCOverlay.tsx`                                               |
| Drawing tools                        | —                                                                 | `DrawingCanvas.tsx`, `DrawingToolbar.tsx`, `drawingStore.ts`   |
| Theme / workspace                    | —                                                                 | `themeStore.ts`, `index.css`, `Toolbar.tsx`, `SidebarRail.tsx` |
| DOM _(Stage 3, not built)_           | no dedicated stream; raw `depth20` bids/asks already arrive in-process inside `heatmap_stream.py` | _needs new panel_                                              |
| Tape _(Stage 3, not built)_          | no dedicated stream; unfiltered `aggTrade` already arrives in-process inside `footprint_stream.py`/`delta_stream.py` | _needs new panel_                                              |
| Open Interest _(Stage 4, not built)_ | _needs Binance futures provider_                                  | _needs new panel_                                              |
| _Orphaned — unused_                  | `market/collectors/depth_collector.py`, `market/collectors/trade_collector.py` — defined, publish to Redis, never imported/subscribed | — |

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

### Session 19 — August 13, 2026

**Stage 2 feature 5: SMC expansion (BOS, CHOCH, Liquidity Sweep).** Built in two verified steps on top of Session 18's confirmed-swing tracking, per that session's own note that the layered-verification pattern was "worth repeating for BOS/CHOCH."

**Step 1 — BOS + CHOCH (`structure.py`).** Both are **close-based** and share one state machine: replay candles in order, tracking the most-recently-*confirmed* swing high, the most-recently-confirmed swing low, and the trend those two imply (same HH/HL-vs-LH/LL rule as `current_trend`). BOS = a close beyond the most recent same-direction swing level (continuation); CHOCH = a close beyond the *opposite*-direction level (the first break against the prevailing trend). A swing isn't eligible to be broken until its own confirmation candle (`i + swing_strength`) has printed — using it earlier would let a later candle decide a break in the past, the same lag `detect_swings` already documents for pivots. Each level fires at most one break; once broken it's inert until a new swing of that type replaces it. Exposed additively on the same `GET /indicators/structure/{symbol}/{interval}` as `structure_breaks`.

**Step 2 — Liquidity Sweep, same file.** **Wick-based**, the deliberate opposite of BOS/CHOCH: a sweep is a wick past a swing level that *closes back* on the original side (failed break / stop hunt) rather than a close that gets through. Reuses the exact same confirmed-swing/trend loop from Step 1 — sweeps are checked only on candles where no break already fired, which is what guarantees a candle is classified as break **or** sweep, never both (the two conditions are mutually exclusive by definition anyway: a break requires the close beyond the level, a sweep requires it didn't get there). Unlike a break, a sweep doesn't consume the level — the same swing high/low can be swept repeatedly until it's genuinely broken. Sweeps also have **no trend gate**: the definition doesn't reference the prevailing trend at all, so unlike BOS/CHOCH they can fire even while `current_trend` reads `range`.

**Verification.** Both steps were checked with hand-built candle sequences before any browser check: an uptrend with a real continuation close, a wick-and-reject candle at the same level (confirmed as a sweep, not a break), and then the real reversal close one candle later (confirmed as CHOCH) — all landed at the expected time/price/type/direction, and re-running the Step 1 sequence after Step 2 landed showed BOS/CHOCH untouched byte-for-byte. Confirmed live on chart afterward: breaks land on continuations/reversals correctly, sweeps land on wick-poke-and-reject spots, and the break/sweep separation holds.

**Frontend.** `StructureOverlay.tsx` gained two more layers: `structure_breaks` draw as a short dashed horizontal tick at the broken level (blue = BOS, amber = CHOCH), and `liquidity_sweeps` as a small purple diamond at the swept wick level — a different *shape*, not just a different color, so break vs. sweep reads apart even without checking color. Both share the existing swing-label bar-spacing gate.

**Stage 2 status:** SMC → Order Blocks, FVG, BOS, CHOCH, Liquidity Sweep all done. Equal Highs/Equal Lows remains 🔴. Market Structure Shift (MSS) is flagged rather than marked done or 🔴: in most SMC frameworks MSS and CHOCH describe the same event (the first structure break against the prevailing trend), so it may already be effectively covered by this session's CHOCH — treating it as a separate build item without confirming that would risk duplicating the same signal under a second name. Stage 2 ~45% → ~53%.

### Session 20 — August 13, 2026

**Stage 2 feature 6 (final): Market Context Dashboard — Stage 2 complete.** The payoff panel: a compact, read-only summary that collects what the other five Stage 2 features already compute into one glance, rather than computing anything new itself (aside from one derived value, Bias).

**What it reads, and from where — no new backend route.** `ContextDashboard.tsx` fetches `/levels`, `/vwap`, and `/structure` directly (the same endpoints LevelsOverlay/VWAPOverlay/StructureOverlay already use), each at that source's own existing poll cadence — Levels every 5 minutes, VWAP every 30s (plus refetch on a new bar), Structure every 15s — so turning the dashboard on adds no more request load than turning on the overlay it's summarizing would. Session is a pure client-clock check reusing `SessionBoxes`' own exported `SESSIONS` hours rather than redefining them. Six rows: Trend (`current_trend`), VWAP position (current price vs. latest VWAP), Session (joins overlapping windows, e.g. "Asia + London"), Nearest level (closest of Daily Open/PDH/PDL with signed distance, formatted with that symbol's own `decimals` so PEPE reads `0.00000004`, not `0.00`), Last structure event (most recent of `structure_breaks`/`liquidity_sweeps` by time), and Bias.

**Bias — went through one revision.** First pass required all three signals (trend, VWAP, last event) to agree before firing Bullish/Bearish, falling back to Neutral otherwise — simple, but stricter than intended and read Neutral more often than useful. Corrected to an explicit 2-of-3 majority vote: each signal scores `bullish` / `bearish` / `neutral` independently (trend: up/down/range; VWAP: Above/Below; last event: its own direction, sweep included), a missing signal scores neutral so absent data can't tip the vote, and Bias is Bullish on 2+ bullish votes (and not 2+ bearish), Bearish on 2+ bearish votes, Neutral otherwise — covering a 1-1-1 split and an all-neutral 0-0-3 the same way.

**Placement.** Top-right corner — the only one of the four corners not already occupied (symbol/price legend and VWAP badge sit top-left, the Structure trend badge bottom-left). Visible by default via a new "Context" toolbar toggle (unlike every other Stage 2 overlay, which defaults off), plus its own collapse button so it can be tucked away without hiding it from the toolbar state.

**Verified live** on BTCUSDT and PEPEUSDT with Levels/VWAP/Structure/Context all on simultaneously: all six rows matched what the chart itself showed (nearest-level distance matched the visible level lines exactly on both symbols; last event matched the rightmost BOS/CHOCH/sweep marker), collapse/expand worked both directions, no console errors, and a symbol switch showed a graceful brief "—" on the rows still fetching rather than stale or crashed data. Frontend-only — no backend restart needed.

**Stage 2 status — complete.** All 6 planned features shipped: Institutional Levels (Session 15), Session VWAP (Session 16), Session boxes (Session 17), Market Structure (Session 18), SMC expansion — BOS/CHOCH/Liquidity Sweep (Session 19), Market Context Dashboard (Session 20). Remaining sub-items (HVN/LVN, developing POC, Anchored VWAP, Fixed Range VP, VWAP bands, session high/low, Equal Highs/Lows, MSS, Premium/Discount zones, SMC mitigation) are real but deliberately deferred — recorded in the new "Stage 2 — deferred / future" table rather than held against Stage 2's close, mirroring how Stage 1 closed with its own deferred list. Stage 2 ~53% → ✅ Done.

### Session 22 — August 14, 2026

**Stage 3 feature 1: DOM (Depth of Market) ladder.** A read-only audit the same session found that PROJECT.md's Stage 3 notes misattributed live heatmap/whale data to the orphaned `depth_collector.py`/`trade_collector.py` modules (dead code — defined, published to Redis channels nothing subscribes to, never imported). That audit was corrected first (see the Stage 3 audit note and "Stage 3 — deferred / tech debt" table above), and DOM was built on the *real* pattern it surfaced.

**Backend — `dom_stream.py`, new `/ws/dom/{symbol}` endpoint.** Deliberately does **not** touch `depth_collector.py`. Instead it copies `heatmap_stream.py`'s proven approach exactly: its own direct Binance `depth20@100ms` WebSocket connection per symbol, shared across all connected browser clients via module-level dicts, torn down when the last client disconnects. The one structural difference from `HeatmapAccumulator`: bids and asks are kept **raw and separate** — sorted (bids descending, asks ascending), top 20 levels each side, real price/qty floats — instead of being merged into one side-less dict and normalized to 0–1 for chart-overlay rendering. Broadcast is throttled to ~5.5 updates/sec (every 0.18s) rather than forwarding the raw 100ms Binance cadence, since a UI ladder doesn't need 10 updates/sec to read as live.

**Frontend — `DOMPanel.tsx`.** Vertical ladder: red asks on top, a bold mid-price divider, green bids on bottom, each row with a horizontal size bar scaled to the largest visible quantity on either side so resting walls are immediately visible. Same raw-`WebSocket`-plus-2s-reconnect pattern as the other analytics streams (Heatmap/Whale/Footprint/Delta) — not the generic `socketService`, which only handles the candle channel. Price decimals come from `decimalsForPrice()` (the same raw-magnitude utility `TradingChart.tsx` uses for its live price), applied to the live mid-price, so PEPE-scale symbols show full precision instead of `0.00`.

**Placement.** New icon button on the existing right-side icon rail (`SidebarRail.tsx`), next to the watchlist toggle — opens a dedicated 224px-wide side panel, independent of and stackable with the watchlist panel.

**Verified live** on BTCUSDT and PEPEUSDT: ladder renders, red asks / green bids correct, updates smooth (no flicker/jumping), size bars visibly longer on large resting orders, symbol switch reconnects cleanly with correct decimal precision on both.

**Stage 3 status.** DOM's three sub-items (Live order book, Bid Size, Ask Size) plus a basic per-row Liquidity read (size-bar wall highlighting — not the separate, still-unbuilt clustered "Liquidity zones" heatmap feature) move to ✅ Done. Tape, Stacked Imbalance, and Absorption remain 🔴 — Tape is the natural next build, since `footprint_stream.py`/`delta_stream.py` already receive every unfiltered `aggTrade` in-process, same shape of gap DOM just closed. Stage 3 ~50% → ~55%.

### Session 23 — August 14, 2026

**Stage 3 feature 2: Tape (Time & Sales).** Same shape of gap as DOM, closed the same way: `trade_collector.py` (dead code — see Stage 3 audit note) was ignored in favor of copying the proven `aggTrade` connection pattern already live in `delta_stream.py`/`footprint_stream.py`, but forwarding every trade raw instead of aggregating it into bars.

**Backend — `tape_stream.py`, new `/ws/tape/{symbol}` endpoint.** Own direct Binance `aggTrade` connection per symbol, shared across clients, torn down on last disconnect — the same per-symbol-shared-connection lifecycle as `heatmap_stream.py`/`dom_stream.py`. Every trade batched and flushed ~5.5×/sec (every 0.18s) instead of one WS message per trade, so a fast-moving symbol doesn't spam the browser with thousands of tiny messages. A 150-trade rolling backlog is kept per symbol and sent as `historical` on connect, so the panel isn't empty while waiting for the next live trade. **Side interpretation deliberately matches `delta_stream.py` exactly** (`m=True` → seller aggressor → sell, `m=False` → buyer aggressor → buy) so Tape's buy/sell coloring and Delta/CVD's bar direction can never disagree for the same trade — verified live side-by-side.

**Frontend — `TapePanel.tsx`.** Newest-first scrolling list (backend sends chronological oldest→newest batches; the frontend reverses and prepends each batch so index 0 is always the newest trade), capped at 150 rows so it can't grow unbounded. Green buy / red sell per row. Trades at ≥5× the currently-visible median notional get a subtle bold+tint highlight — a lightweight, always-on visual cue rather than a togglable filter (see Stage 3 table: "Large Trade filter" marked 🟡 Partial for that reason — it highlights, it doesn't let you hide/isolate). Price decimals from `decimalsForPrice()` off the latest trade price, same approach as DOM.

**Placement.** Third rail icon (dotted-list glyph) next to Watchlist and DOM on `SidebarRail.tsx` — opens its own 224px panel that can sit side by side with the DOM panel, matching how traders actually use the two together.

**Verified live** on BTCUSDT and PEPEUSDT: trades scroll in newest-first, colors match Delta's buy/sell split for the same prints, feed stays smooth under load, large-trade highlight is visible but not overwhelming, symbol switch reconnects cleanly with correct decimals on both.

**Stage 3 status.** Tape's Live Tape and Aggressive Buyers/Sellers sub-items move to ✅ Done; Large Trade filter to 🟡 Partial (highlight only, no filter). Remaining 🔴 items: Stacked Imbalance, Absorption, dedicated Imbalance module (still 🟡), plus the smaller Footprint/Delta/Heatmap/Whale sub-items already tracked as deferred. The duplicate-Binance-connections tech debt item is updated to reflect reality: 6 live per-symbol connections now, not a future "soon 6." Stage 3 ~55% → ~60%.

### Session 24 — August 14, 2026

**Footprint: historical backfill + imbalance ratio control (mixed outcome — recorded honestly below).**

**Historical backfill — ✅ Fixed.** Footprint used to show only the single candle currently forming on cold start (`get_historical()` returned `[]` until enough live trades accumulated). New `klines_to_footprint_bars()` (`app/analytics/footprint.py`) approximates ~50 completed bars from Binance klines and `FootprintAccumulator.seed_completed()` merges them in ahead of live accumulation, so a fresh connection now gets a full ladder history immediately, matching how Delta/CVD and Volume Profile already backfill. **Known limitation, accepted rather than hidden:** klines only carry the candle's *total* taker-buy/sell split (`kline[9]` / total volume), not a per-price aggressor breakdown, so every level within one approximated historical bar shares the same buy/sell ratio — imbalance on history is effectively per-candle, not per-level. The live-forming candle keeps true per-level resolution from real aggTrade data. An outlier candle is also guarded against exploding into thousands of levels (`_MAX_HISTORICAL_LEVELS = 200`, coarsening that bar's own step rather than truncating its range). Readability: `MIN_ROW_PX` 8→5 (was silently suppressing the whole overlay now that buckets are symbol-relative) and `_FOOTPRINT_TARGET_LEVELS` 15→10 (taller rows) were also applied — symbol-relative and floored at `tick_size`, so cheap-coin bucketing is unaffected — but **the readability improvement itself was not visually confirmed this session.**

**Imbalance ratio control — 🟡 Partial / needs verification, NOT done.** A toolbar input (`ChartToolbar.tsx`) writes an adjustable ratio (default 300%) to `chartStore`, and `FootprintCanvas.tsx` reads it live and recomputes `isImbalance()` per level at draw time, replacing the backend's fixed 5× flag for display. Code review traced the full chain — store update → selector re-render → fresh closure on every draw → dedicated redraw effect keyed on the ratio — and found no stale-closure or wiring bug; percent-to-ratio conversion (300 in the box = 3.0 = buy≥3×sell) is also correct on inspection. **But this was reviewed, not watched work in the browser.** The user chose to stop debugging and move on rather than chase a possible stale-build/visual-verification gap live. Treat this as **open, not shipped**, until someone confirms in a running browser that changing the number visibly changes which levels are highlighted.

**Why recorded this way:** per explicit instruction this session — don't let a plausible-looking code review stand in for the browser verification this project's own pattern (every other Stage 2/3 feature above) requires before marking something ✅ Done.

**Stage 3 status.** No status bump — this session's outcome is mixed on purpose: backfill genuinely fixed and recorded as ✅ Done, imbalance ratio control left at 🟡 Partial pending the verification above. Stage 3 stays ~60%.

### Session 25 — August 15, 2026

**Footprint: one root cause explained both open items from Session 24 — resolved with a single fix, verified live.**

**The actual bug: a silent, unretried backfill fetch, not the reconnect/reseed logic.** The reported symptom was footprint rendering inconsistently — sometimes a full ~50-candle ladder, sometimes almost nothing near the live edge. The suspected cause going in was that reconnects/symbol-switches might be landing on a live-only accumulator that skipped re-seeding. Live diagnosis (connecting directly to the running `/ws/footprint/BTCUSDT/1m` and inspecting the actual `historical` payload) showed that theory was wrong: the per-`(symbol, interval)` accumulator and its reseed gate work exactly as designed, and a reconnect to an *existing* key correctly returns whatever history that accumulator already holds. The real fault was in `_create_accumulator` (`footprint_stream.py`): its one-shot kline backfill fetch was wrapped in a bare `except Exception: pass` — no retry, no log. Because that accumulator is created exactly once per process lifetime per key, and `uvicorn --reload` restarts the whole process (wiping all in-memory accumulators) on every backend file save — routine during active development — a single transient Binance blip landing on that one attempt permanently left the accumulator with zero history for the rest of the process's life. From then on the ladder could only ever show however many live minutes had accumulated since. **Fix:** the backfill fetch now retries up to 3 times (0.75s apart) and logs a `warning` if all three fail, instead of failing once and silently forever.

**Imbalance ratio control — ✅ now verified working; it was never actually broken.** A temporary `console.log('[IMB]', ratio, flaggedCount)` was added to `FootprintCanvas.tsx`'s draw function and read back live in the browser: `ratio=1.1 flagged=9` (loose) and `ratio=8 flagged=0` (strict) — proving the full input→store→`isImbalance()`→highlight-count chain updates correctly and instantly as the toolbar value changes. The Session 24 code review was correct after all: **the entire "imbalance ratio does nothing" symptom was downstream of the footprint-history bug above** — with `get_historical()` returning `[]` (or only 2-3 live-accumulated bars), there were rarely enough flagged levels on screen for a ratio change to visibly move anything, which reads exactly like a broken control even though the detection logic was fine the whole time. The diagnostic log has been removed now that this is confirmed.

**Readability (footprint number size) — still open, unconfirmed.** `MIN_ROW_PX` 8→5 and `_FOOTPRINT_TARGET_LEVELS` 15→10 (Session 24) remain in place, but nobody has yet visually confirmed on a running chart that the numbers read as comfortably sized rather than cramped. Minor, not blocking — flagged here so it isn't forgotten now that the higher-priority footprint bugs are closed.

**Lesson worth keeping:** two features that looked unrelated (footprint reliability, imbalance responsiveness) were actually the same bug wearing two faces — a reminder that when a *detection* feature "does nothing," check whether it has any data to detect on before debugging the detection logic itself.

**Stage 3 status.** Footprint's historical backfill sub-item upgrades to ✅ Done, reliable (was ✅ Done but intermittent). Imbalance (dedicated) upgrades from 🟡 Partial to ✅ Verified working. Stage 3 ~60% → ~62%.

### Session 26 — August 15, 2026

**Stacked Imbalance built and verified live.** Built directly on the now-verified per-level `isImbalance()` in `FootprintCanvas.tsx` rather than a separate definition. `findStackRuns()` scans a bar's already-sorted (high→low) price levels for runs of >= `stack_size` consecutive same-side imbalanced levels (using the same `isImbalance()`/`imbalanceRatio` as the single-level highlight). A stacked run gets a bracket (full-run tint + 2px border) plus a vertical "STACK" tag along the aggressive edge, distinct from the single-level highlight — green for buy stacks, red for sell. `stack_size` (default 3) is adjustable via a new toolbar control next to Imbalance ratio, wired through `chartStore` the same way. Frontend-only, computed fresh at draw time from data already in the WebSocket payload — no backend change, no restart needed. **Confirmed live on BTC 1m:** a red bracket correctly spanned a run of 8+ consecutive sell-side imbalanced levels.

**Absorption feature recovered and committed.** `backend/app/analytics/absorption.py` (buy/sell absorption candle detection: large volume + small price range, tunable `volume_multiplier`/`range_fraction`/`lookback`) and `frontend/src/components/Overlay/AbsorptionOverlay.tsx`, plus their wiring through `indicators.py`, `ChartContainer.tsx`, `api.ts`, `analytics.ts`, and `chartStore.ts`, had been built in an earlier session but left uncommitted. Found still sitting as uncommitted/untracked changes at the start of this session — committed now as its own commit so the work isn't lost. **Not yet visually verified on a live chart**, so it's recorded as 🟡 Built, unverified rather than ✅ Done, per this project's standing rule that a plausible-looking implementation doesn't count as done until someone watches it work in the browser (see Session 24/25 notes above).

**Stage 3 status.** Stacked Imbalance upgrades from 🔴 to ✅ Verified working. Absorption upgrades from 🔴 (not started) to 🟡 Built, unverified (code exists and is now committed, but unconfirmed live). Stage 3 ~62% → ~66%.

### Session 27 — August 15, 2026

**Absorption — now fully verified.** Since the Session 26 log entry above (which left it at 🟡 Built, unverified), the ABS chips were confirmed live, landing correctly on a flagged $10-range candle. Upgrades to ✅ Done.

**Execution Dashboard built and verified — Stage 3's final planned feature.** A compact "should I enter now?" panel mirroring `ContextDashboard.tsx`'s pattern exactly: read what other features already compute, derive nothing except one Bias value at the bottom. Toggle "Execution", off by default, placed top-left (below the symbol legend and VWAP's label) so it never collides with `ContextDashboard` (top-right) — the two panels are deliberately complementary, not competing: Context answers "where should I pay attention" (Stage 2), Execution answers "is now the right time to enter" (Stage 3).

Four rows, each reusing a stream/endpoint that already existed rather than opening a new connection:
- **Delta** — new `deltaStore`, written by a few added lines inside `DeltaPanel.tsx`'s existing `/ws/delta` message handler (current bar delta + CVD rising/falling vs. the previous bar).
- **Absorption** — polls `GET /indicators/absorption` directly, same cadence as `AbsorptionOverlay` (a REST poll, not a stream, so a second call here isn't a duplicate connection the way a second WebSocket would be).
- **Stack/Imbalance** — new `footprintSignalStore`, written by a few added lines inside `FootprintCanvas.tsx`'s existing `/ws/footprint` message handler, reusing its own `isImbalance()`/`findStackRuns()` verbatim (a new `summarizeBarSignal()` helper picks the longest active stack, falling back to the single strongest per-level imbalance when no run qualifies).
- **Whale** — reads the existing `whaleStore` directly, already shared with `WhaleTicker`; no changes needed.

**Execution Bias rule (the one derived value):** each row casts `long`/`short`/`neutral` — missing or flat data scores neutral, same principle as Context's Bias, so absent signals can't tip the vote. `LONG` requires ≥2 long votes **and** strictly more long votes than short; `SHORT` is the mirror image; anything else (a 2-2 tie, or fewer than 2 votes either way) is `WAIT`.

**Verified live.** Delta row matched `DeltaPanel` exactly (-2.88 on both). Whale row matched the whale ticker (net Sell). Bias correctly computed SHORT from 2 bearish votes (delta negative + whale sell).

**Known, by-design limitation:** the Whale and Stack rows only have data while the Whales/Footprint overlays are also toggled on, since `WhaleMarkers`/`FootprintCanvas` own the connections that feed their stores — the dashboard reads existing state rather than opening duplicate connections. Shows `—` gracefully the rest of the time, documented in `ExecutionDashboard.tsx`'s header comment and in the deferred table above.

**Stage 3 status — core complete.** With Absorption verified and the Execution Dashboard done, every feature on the original Stage 3 plan (Footprint, Delta/CVD, Imbalance, Stacked Imbalance, Absorption, Heatmap, Whale, Tape, DOM, and now the Execution Dashboard) is built and verified live. Remaining 🔴/🟡 items (Large Volume Highlight, Zero Prints, Session Delta/Divergence, Liquidity zones, Whale history/alerts, Tape's Large Trade filter, footprint number readability) are secondary polish, not core capability gaps — tracked in the deferred table above rather than blocking Stage 3's close, the same convention used to close Stage 1 and Stage 2. Stage 3 ~66% → ~88%.

### Session 28 — August 15, 2026

**Footprint number readability — closed, the last cosmetic loose end from Stage 3.** `_FOOTPRINT_TARGET_LEVELS` (`price_step.py`) dropped 10 → 4. Checked live against Binance before picking the value: BTC's current typical_range (~$15) meant 10 through 5 all snapped to the exact same $2 step — the 1/2/5 clean-value snapping absorbed that whole range, so 7 or 8 (the originally suggested values) would have changed nothing. 4 is the first value whose raw step clears the snap boundary into $5 (~3 levels/candle vs. ~7-8), giving genuinely taller rows. Verified live that PEPE/XRP/DOGE are already floored at their own tick_size well before target=4 — cheap coins are provably unaffected, not just assumed safe.

**Taller rows exposed a label-overlap bug, fixed in the same session.** Bigger rows let `FootprintCanvas.tsx`'s font size grow off its old cramped `MIN_FONT_PX` floor — which then made the vertical "STACK" tag (drawn inside the row, next to the buy/sell number column) collide with the numbers themselves, and shrank the margin `AbsorptionOverlay`'s "ABS" chip needed below a candle's low. Fixes: the STACK tag moved from inside the row content to a horizontal chip sitting on the stack box's top border — a seam between two rows' vertically-centered number text, so it can't land on either regardless of candle width, and is hidden entirely (box-only) when a row is too short to hold it. The ABS chip's clearance gap went 6px → 12px. Detection logic and number rendering untouched in both files — label placement only.

**Verified live.** BTC 1m footprint numbers read comfortably at normal zoom; PEPE still shows proper fine-grained buckets (not collapsed); the STACK tag no longer overlaps the numbers; the ABS chip clears the taller bottom-row text; the single-imbalance highlight (which frames its own number directly, not a separate floating label) was unaffected.

**Stage 3 status — closed.** Every planned feature (Footprint incl. reliable backfill and now readability, Delta/CVD, Imbalance, Stacked Imbalance, Absorption, Heatmap, Whale, Tape, DOM, Execution Dashboard) is built and verified live, and the one open cosmetic item is resolved. Remaining 🔴/🟡 sub-items are deliberately deferred nice-to-haves (Large Volume Highlight, Zero Prints, Session Delta/Divergence, Liquidity zones, Whale history/alerts, Tape's Large Trade filter), the same convention used to close Stage 1 and Stage 2 with a deferred table rather than 100%. Stage 3 ~88% → ~90%.

### Session 29 — August 17, 2026

**Stage 4 opened. Read-only audit first.** Before building anything, audited every claimed-🔴 Stage 4 module (Trade Checklist, Position Calculator, Replay, Cluster Scanner, Open Interest, Liquidations, Alerts) against the actual codebase. Confirmed the doc's ~3% figure was accurate, not inflated — every module genuinely had zero supporting code, including Replay, whose 0% correction (from a previously mis-stated 50%) held up under a second look. One clarification: the RR readout inside `DrawingCanvas.tsx`'s Long/Short Position drawing tool (Stage 1) is cosmetically similar to a position calculator but computes RR from on-chart pixel geometry, not account balance/$ risk — confirmed unrelated to this module.

**Position Calculator built and verified by hand — Stage 4's first shipped feature.** Pure client-side math, no backend/API/store dependency beyond local state: `PositionCalculator.tsx` (new modal, opened via a calculator icon in `Toolbar.tsx` between the snapshot and fullscreen buttons) + `positionCalcStore.ts` (persists only Account Balance and Risk % across sessions, via the same localStorage-backed zustand pattern as `candleStyleStore.ts` — entry/stop/target/direction are always per-trade and reset each open). Inputs: account balance, risk %, entry, stop, optional target, Long/Short direction. Outputs, live as you type: Dollar Risk, Risk/Unit, Position Size, Position Value, Risk/Reward, Potential Profit, Potential Loss. Entry pre-fills from the active symbol's latest candle close on modal open. Stop/target on the wrong side of entry for the selected direction shows a gentle inline warning (red/amber) rather than blocking the calculation — math still runs off `|entry − stop|` either way. Reused the app's existing `decimalsForPrice`/`formatPrice` (from `utils/priceFormat.ts`) for cheap-coin-safe price formatting; added a local `formatQty` for position-size decimals since quantity scales the opposite way from price (large for cheap coins, fractional for BTC).

**Verified by hand** against a known example (balance $10,000, risk 1%, entry 100, stop 95, target 110): Dollar Risk $100, Position Size 20 units, Position Value $2,000, RR 1:2, Potential Profit $200 — all correct. `tsc --noEmit` clean.

**Stage 4 status.** Position Calculator upgrades from 🔴 to ✅ Done. Stage 4 ~3% → ~12% (1 of 8 planned modules complete; everything else — Trade Checklist, Replay, Cluster Scanner, Open Interest, Liquidations, Alerts, Trade Journal — remains 🔴/🔵, unchanged by this session).

### Session 30 — August 17, 2026

**Trade Checklist built and verified — Stage 4's second shipped feature.** A hybrid discipline panel following ContextDashboard/ExecutionDashboard's exact "read, don't recompute, don't open new connections" pattern: `TradeChecklist.tsx` (new, toggled via a "Checklist" button in `ChartToolbar.tsx`, off by default, mounted bottom-right of the chart area — clear of Context's top-right and Execution's top-left) + `tradeChecklistStore.ts` (persists only the 4 manual ticks, localStorage-backed zustand, same pattern as `candleStyleStore`/`positionCalcStore`).

**6 AUTO items**, each judged against a Long/Short direction toggle the panel owns itself (separate from Position Calculator's): Trend aligned (`structure.current_trend`), Price vs VWAP, Near a key level (within 0.3% of Daily Open/PDH/PDL — pass/unknown only, never fails, since proximity isn't inherently directional), Structure event (BOS/CHOCH from `structure_breaks` only, not liquidity sweeps, per spec), Delta supporting, and Order-flow signal (stack/imbalance + whale combined, reusing `footprintSignalStore`/`whaleStore` and ExecutionDashboard's exact whale-direction math — pass only if both non-neutral votes agree with the chosen direction, fail only if both oppose, unknown if empty or conflicting). Levels/VWAP/Structure are fetched via the panel's own REST poll at ContextDashboard's exact cadence (this app's established pattern for non-store analytics data, per ContextDashboard's own header comment); Delta/Stack/Whale are read directly from `deltaStore`/`footprintSignalStore`/`whaleStore` — no new WebSocket connections opened anywhere.

**4 MANUAL items** (Checked higher timeframe / Key news-events clear / Following my trading plan / Risk-position size set) are plain persisted checkboxes — the platform has no data source for any of them.

**Readiness rule (exact):** any manual item unticked → `NOT READY`. All manual ticked but auto items have ≥1 fail or fewer than 4-of-6 pass → `CHECK ITEMS`. All manual ticked, zero fails, ≥4-of-6 pass → `READY`. Verdict shown in both the collapsed header (glanceable without expanding) and an expanded footer row.

**Manual-reset behavior:** the store tracks which symbol its ticks belong to; a `syncSymbol()` call on every render is a no-op unless the active symbol changed, in which case all 4 manual ticks wipe immediately — a fresh symbol is treated as a fresh trade idea rather than carrying over a stale checklist.

**Verified live.** Auto items cross-checked correct against ContextDashboard/ExecutionDashboard side by side (trend, VWAP, structure event, delta, order-flow all agreed). Manual ticks work. Verdict logic confirmed both ways: `READY` with all auto items aligned and all manual boxes ticked, flipping live to `CHECK ITEMS` the moment delta/order-flow turned against the selected direction — no reload needed, store reads are reactive. `tsc --noEmit` clean.

**Stage 4 status.** Trade Checklist upgrades from 🔴 to ✅ Done. Stage 4 ~12% → ~25% (2 of 8 planned modules complete; Replay, Cluster Scanner, Open Interest, Liquidations, Alerts, Trade Journal remain 🔴/🔵, unchanged by this session).

### Session 31 — August 18, 2026

**Cluster Scanner built and verified — Stage 4's third shipped feature.** Deliberately builds **no new detection**: `ClusterScanner.tsx` (new, toggled via a "Scanner" button in `ChartToolbar.tsx`, off by default, mounted bottom-left of the chart area — the one corner still free after Context top-right/Execution top-left/Checklist bottom-right) + `clusterScannerStore.ts` (in-memory only, capped at 100 events, deliberately **not** persisted — a stale event log surviving a reload would misrepresent "what's happening right now"). Watches the exact same sources ExecutionDashboard already reads — `deltaStore`, `footprintSignalStore`, `whaleStore`, and a `GET /indicators/absorption` REST poll at the same 15s cadence — and opens no new streams/connections.

**De-dupe approach, the main risk called out up front — one per event type, since each source shapes the problem differently:**
- **Whale** — `whaleStore.trades` already contains only whale-flagged trades; tracks the newest `.time` already processed, only strictly-later trades count as new.
- **Absorption** — the REST poll returns a full snapshot of the lookback window every time (not just new events), so a `Set<"type-time">` of already-seen keys filters it down.
- **Stack** — `footprintSignalStore` reflects only the current bar's strongest signal, which would otherwise re-fire every render while that bar is still forming; dedupes on `barTime`, only fires once per bar.
- **Delta** — `deltaStore` carries no timestamp at all, so this one is edge-triggered rather than time-keyed (see below).

All four seed their dedupe state from whatever's already buffered at mount/symbol-switch **without** back-filling the feed, so toggling the panel on doesn't dump a burst of stale history.

**Delta-swing threshold — coin-relative, not a fixed number.** Delta's units scale wildly by coin (BTC deltas are single digits, PEPE deltas are in the millions), so a hardcoded absolute threshold would either spam constantly on cheap coins or never fire on BTC. Instead: a rolling window of the last 20 observed `|delta|` magnitudes (minimum 5 samples before it can fire at all), flagged "large" at **≥3× the rolling average**, firing only on the false→true transition so a sustained large-delta stretch logs once rather than every tick.

**Scope — active symbol only, noted as v1.** A true multi-symbol market-wide scanner would need live connections to many symbols' streams simultaneously (footprint/delta/whale are all per-symbol WebSocket connections today); that's a bigger future piece of work, not attempted here. Switching symbol or interval clears both the feed and every detector's dedupe state together, since a feed still showing the previous symbol's events under a "Scanner · SYMBOL" header would be actively misleading.

**One spec deviation, called out rather than silently made:** each row doesn't repeat the symbol per entry — shown once in the header instead, since the clear-on-switch behavior guarantees every visible row already belongs to that symbol, making a per-row repeat pure redundancy. The `symbol` field is still stored on every event underneath.

**Verified live.** Distinct whale/absorption/stack/large-delta events appeared as they happened, no duplicate spam, de-dupe held per type, and switching symbol cleanly wiped the feed.

**Stage 4 status.** Cluster Scanner upgrades from 🔴 to ✅ Done. Stage 4 ~25% → ~38% (3 of 8 planned modules complete; Replay, Open Interest, Liquidations, Alerts, Trade Journal remain 🔴/🔵, unchanged by this session).
