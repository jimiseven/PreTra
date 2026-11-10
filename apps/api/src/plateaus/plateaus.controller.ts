import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { DetectorService } from '../detector/detector.service';

@ApiTags('Plateaus')
@Controller('api/plateaus')
export class PlateausController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly detectorService: DetectorService
  ) {}

  @Get()
  @ApiOperation({ summary: 'Obtiene el historial de episodios de meseta detectados y sus desenlaces' })
  @ApiQuery({ name: 'symbol', required: false })
  @ApiQuery({ name: 'status', required: false })
  async getPlateauEpisodes(
    @Query('symbol') symbol?: string,
    @Query('status') status?: string
  ) {
    if (this.prisma.isConnected) {
      try {
        const episodes = await this.prisma.plateauEpisode.findMany({
          where: {
            symbol: symbol ? symbol.toUpperCase() : undefined,
            status: status || undefined
          },
          orderBy: { detectedAt: 'desc' },
          take: 100
        });
        if (episodes.length > 0) return episodes;
      } catch {}
    }

    const memoryEpisodes = this.detectorService.getMemoryEpisodes();
    return memoryEpisodes.filter(ep => {
      if (symbol && ep.symbol !== symbol.toUpperCase()) return false;
      if (status && ep.status !== status) return false;
      return true;
    });
  }
}
