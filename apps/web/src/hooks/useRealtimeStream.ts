'use client';

import { useEffect, useState } from 'react';
import { SsePayload, CoinState } from '@pretra/shared';

export interface LiveTicker {
  symbol: string;
  price: number;
  change1h?: number | null;
  change24h?: number | null;
  changes?: Record<string, number | null>;
  state?: CoinState;
  distanceToPeakPct?: number;
  hoursWithoutNewHigh?: number;
  explanation?: string;
  isPartial?: boolean;
}

export function useRealtimeStream(onEvent?: (payload: SsePayload) => void) {
  const [tickers, setTickers] = useState<Record<string, LiveTicker>>({});
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessageAt, setLastMessageAt] = useState<number>(Date.now());

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;

    function connect() {
      eventSource = new EventSource('/api/stream');

      eventSource.onopen = () => {
        setIsConnected(true);
      };

      eventSource.onmessage = (event) => {
        try {
          const payload: SsePayload = JSON.parse(event.data);
          setLastMessageAt(Date.now());

          if (payload.type === 'TICKER_UPDATE') {
            const data = payload.data as any;
            setTickers(prev => ({
              ...prev,
              [data.symbol]: {
                ...(prev[data.symbol] || {}),
                ...data
              }
            }));
          }

          if (onEvent) {
            onEvent(payload);
          }
        } catch {
          // Ignorar frames no JSON
        }
      };

      eventSource.onerror = () => {
        setIsConnected(false);
        if (eventSource) eventSource.close();
        reconnectTimeout = setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (eventSource) eventSource.close();
    };
  }, []);

  return { tickers, isConnected, lastMessageAt };
}
