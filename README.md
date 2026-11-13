# DSA Trading Tool

A real-time crypto charting workspace: live Binance candles, drawing tools, client-side indicators, price alerts, replay, and account sync, sold as a subscription.

## Features

- **Live candlestick chart** powered by Lightweight Charts, 1-minute to monthly intervals, with scroll-back history
- **Drawing tools** — lines, shapes, Fibonacci, channels, Long/Short Position, templates, undo; also on indicator panels
- **Indicators** — EMA, Bollinger Bands, RSI, StochRSI, MACD (computed in the browser)
- **Price alerts**, **replay mode** and a **position calculator**
- **Accounts** — email/password or Google sign-in; settings, watchlist and drawings sync across devices
- **Subscriptions** — free trial, then paid access (OnePay, in progress)
- **Crypto** via Binance (forex/stocks are out of scope for v1)

## Quick Start

```bash
cp .env.example .env
cp backend/.env.example backend/.env   # set JWT_SECRET at minimum

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
| Database | PostgreSQL 16 |
| Cache / rate limiting | Redis 7 |
| Frontend | React 18 · TypeScript · Vite |
| Charts | Lightweight Charts v4 |
| State | Zustand |
| Styling | Tailwind CSS |
| Infra | Docker Compose |

## Project Structure

```
backend/   → FastAPI: auth, symbol search, account sync, live candle WebSocket
frontend/  → React SPA: chart, drawing engine, indicators, alerts, replay
```

Backend routes: `/health`, `/api/v1/auth/*`, `/api/v1/symbols/search`, `/api/v1/sync*`, `WS /ws/candles/{symbol}/{interval}`.

See [PROJECT.md](./PROJECT.md) for architecture, data flow and local-dev notes, and [docs/subscriptions-plan.md](./docs/subscriptions-plan.md) for the subscription/payments plan.

## Development

```bash
# Backend (with hot reload)
cd backend && pip install -r requirements.txt
uvicorn app.main:app --reload

# Frontend (with HMR)
cd frontend && npm install && npm run dev
```

## Environment Variables

See `.env.example` (Docker Compose / frontend) and `backend/.env.example` (auth, cookies, CORS, Google OAuth, subscription and OnePay settings).
