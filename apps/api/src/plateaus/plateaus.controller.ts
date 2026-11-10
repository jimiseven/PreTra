import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Plateaus')
@Controller('api/plateaus')
export class PlateausController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Obtiene el historial de episodios de meseta detectados y sus desenlaces' })
  @ApiQuery({ name: 'symbol', required: false })
  @ApiQuery({ name: 'status', required: false })
  async getPlateauEpisodes(
    @Query('symbol') symbol?: string,
    @Query('status') status?: string
  ) {
    try {
      const episodes = await this.prisma.plateauEpisode.findMany({
        where: {
          symbol: symbol ? symbol.toUpperCase() : undefined,
          status: status || undefined
        },
        orderBy: { detectedAt: 'desc' },
        take: 100
      });
      return episodes;
    } catch {
      return [];
    }
  }
}
