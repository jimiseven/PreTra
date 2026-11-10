import { Controller, Sse } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { SseService } from './sse.service';

@ApiTags('Realtime Stream')
@Controller('api/stream')
export class SseController {
  constructor(private readonly sseService: SseService) {}

  @Sse()
  @ApiOperation({ summary: 'Canal Server-Sent Events (SSE) para actualizaciones en vivo al frontend' })
  stream(): Observable<{ data: string }> {
    return this.sseService.getStream();
  }
}
