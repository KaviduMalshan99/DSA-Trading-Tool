type MessageHandler = (data: unknown) => void;

const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8000';

class SocketService {
  private sockets: Map<string, WebSocket> = new Map();
  private handlers: Map<string, Set<MessageHandler>> = new Map();
  private reconnectTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  subscribe(channel: string, handler: MessageHandler): () => void {
    if (!this.handlers.has(channel)) {
      this.handlers.set(channel, new Set());
    }
    this.handlers.get(channel)!.add(handler);

    if (!this.sockets.has(channel)) {
      this._connect(channel);
    }

    return () => this.unsubscribe(channel, handler);
  }

  unsubscribe(channel: string, handler: MessageHandler) {
    this.handlers.get(channel)?.delete(handler);
    if (this.handlers.get(channel)?.size === 0) {
      this._disconnect(channel);
    }
  }

  private _connect(channel: string) {
    const ws = new WebSocket(`${WS_URL}/ws/${channel}`);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string);
        this.handlers.get(channel)?.forEach((h) => h(data));
      } catch {
        // malformed message
      }
    };

    ws.onclose = () => {
      this.sockets.delete(channel);
      if ((this.handlers.get(channel)?.size ?? 0) > 0) {
        const timer = setTimeout(() => this._connect(channel), 2000);
        this.reconnectTimers.set(channel, timer);
      }
    };

    this.sockets.set(channel, ws);
  }

  private _disconnect(channel: string) {
    clearTimeout(this.reconnectTimers.get(channel));
    this.reconnectTimers.delete(channel);
    this.sockets.get(channel)?.close();
    this.sockets.delete(channel);
    this.handlers.delete(channel);
  }
}

export const socketService = new SocketService();
