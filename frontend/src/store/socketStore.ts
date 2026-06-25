import { create } from 'zustand';

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface SocketState {
  channelStatus: Record<string, ConnectionStatus>;
  setChannelStatus: (channel: string, status: ConnectionStatus) => void;
  isConnected: (channel: string) => boolean;
}

export const useSocketStore = create<SocketState>((set, get) => ({
  channelStatus: {},

  setChannelStatus: (channel, status) =>
    set((state) => ({
      channelStatus: { ...state.channelStatus, [channel]: status },
    })),

  isConnected: (channel) => get().channelStatus[channel] === 'connected',
}));
