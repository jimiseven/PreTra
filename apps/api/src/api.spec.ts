import { describe, it, expect } from 'vitest';
import { BinancePublicService } from './binance/binance-public.service';
import { SseService } from './sse/sse.service';

describe('Integración API y Servicios Base', () => {
  it('BinancePublicService debe instanciarse correctamente sin requerir API keys', () => {
    const service = new BinancePublicService();
    expect(service).toBeDefined();
    expect(service.getWsStatus()).toBe('disconnected');
  });

  it('SseService debe permitir suscripciones y difusión de eventos', async () => {
    const sseService = new SseService();
    let receivedData: any = null;

    const subscription = sseService.getStream().subscribe({
      next: (val) => {
        receivedData = JSON.parse(val.data);
      }
    });

    sseService.broadcast('HEARTBEAT', { test: true });

    expect(receivedData).toBeDefined();
    expect(receivedData.type).toBe('HEARTBEAT');
    expect(receivedData.data.test).toBe(true);

    subscription.unsubscribe();
  });
});
