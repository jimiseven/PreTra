import { Injectable, Logger } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { SsePayload, SseMessageType } from '@pretra/shared';

@Injectable()
export class SseService {
  private readonly logger = new Logger(SseService.name);
  private readonly eventSubject = new Subject<SsePayload>();

  broadcast<T>(type: SseMessageType, data: T) {
    const payload: SsePayload<T> = {
      type,
      timestamp: Date.now(),
      data
    };
    this.eventSubject.next(payload);
  }

  getStream(): Observable<{ data: string }> {
    return this.eventSubject.asObservable().pipe(
      map(payload => ({
        data: JSON.stringify(payload)
      }))
    );
  }
}
