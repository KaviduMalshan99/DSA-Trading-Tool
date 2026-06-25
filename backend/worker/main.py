"""
Background worker: subscribes to symbols and drives collectors.
Run with: python -m worker.main
"""
import asyncio
import signal
from app.market.providers.binance import BinanceProvider
from app.market.collectors.candle_collector import CandleCollector
from app.market.collectors.trade_collector import TradeCollector
from app.market.collectors.depth_collector import DepthCollector

SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"]
INTERVALS = ["1m", "5m", "1h"]


async def main():
    provider = BinanceProvider()

    candle_col = CandleCollector(provider)
    trade_col = TradeCollector(provider)
    depth_col = DepthCollector(provider)

    for symbol in SYMBOLS:
        for interval in INTERVALS:
            await candle_col.start(symbol, interval)
        await trade_col.start(symbol)
        await depth_col.start(symbol)

    print(f"Worker running. Collecting {SYMBOLS} ...")

    loop = asyncio.get_event_loop()
    stop_event = asyncio.Event()

    def _shutdown():
        stop_event.set()

    loop.add_signal_handler(signal.SIGINT, _shutdown)
    loop.add_signal_handler(signal.SIGTERM, _shutdown)

    await stop_event.wait()

    await candle_col.stop_all()
    await trade_col.stop_all()
    await depth_col.stop_all()
    print("Worker stopped.")


if __name__ == "__main__":
    asyncio.run(main())
