# DSA Trading Tool

A real-time trading analytics platform for institutional-grade order flow analysis across crypto, forex, and equities.

## Features

- **Live candlestick chart** powered by Lightweight Charts (TradingView)
- **Order book heatmap** — colour-mapped bid/ask liquidity over time
- **Footprint charts** — per-bar buy vs. sell volume at every price level
- **Volume Profile** — POC and Value Area rendered as a side histogram
- **Whale trade markers** — real-time alerts for large-notional prints
- **Smart Money Concepts** — Order Blocks and Fair Value Gaps drawn automatically
- **Multi-asset support** — Crypto (Binance), Forex (Alpha Vantage), Stocks (Polygon.io)
- **All intervals** from 1-minute to daily

## Quick Start

```bash
cp .env.example .env
# Add your API keys to .env

docker compose up --build
```

| Service | URL |
|---|---|
| Frontend | http://localhost |
| Backend API | http://localhost:8000 |
| Interactive API docs | http://localhost:8000/docs |

## Tech Stack

| | |
|---|---|
| Backend | Python 3.12 · FastAPI · asyncio |
| Data bus | Redis pub/sub |
| Database | PostgreSQL 16 |
| Frontend | React 18 · TypeScript · Vite |
| Charts | Lightweight Charts v4 |
| State | Zustand |
| Styling | Tailwind CSS |
| Infra | Docker Compose |

## Project Structure

```
backend/   → FastAPI + analytics engine + market data collectors
frontend/  → React SPA with canvas overlays
```

See [PROJECT.md](./PROJECT.md) for full architecture documentation, data flow diagrams, sprint plan, and progress tracker.

## Development

```bash
# Backend (with hot reload)
cd backend && pip install -r requirements.txt
uvicorn app.main:app --reload

# Frontend (with HMR)
cd frontend && npm install && npm run dev
```

## Environment Variables

Copy `.env.example` to `.env` and fill in:

- `BINANCE_API_KEY` / `BINANCE_API_SECRET`
- `FOREX_API_KEY` (Alpha Vantage)
- `STOCKS_API_KEY` (Polygon.io)
