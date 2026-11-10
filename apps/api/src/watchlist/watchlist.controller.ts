import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiBody } from '@nestjs/swagger';
import { WatchlistService } from './watchlist.service';
import { AddSymbolDto } from '@pretra/shared';

@ApiTags('Watchlist')
@Controller('api/watchlist')
export class WatchlistController {
  constructor(private readonly watchlistService: WatchlistService) {}

  @Get()
  @ApiOperation({ summary: 'Obtiene monedas en seguimiento (activas o archivadas)' })
  @ApiQuery({ name: 'status', required: false, enum: ['ACTIVE', 'ARCHIVED'] })
  async getWatchlist(@Query('status') status?: string) {
    return this.watchlistService.getWatchlist(status);
  }

  @Get('quota')
  @ApiOperation({ summary: 'Obtiene el contador de altas de hoy y el límite diario' })
  async getQuota() {
    return this.watchlistService.getDailyAdditionsCount();
  }

  @Post()
  @ApiOperation({ summary: 'Añade manualmente un símbolo a seguimiento con validación y backfill' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', example: 'BTCUSDT' },
        notes: { type: 'string', example: 'Subida fuerte detectada en 4h' }
      },
      required: ['symbol']
    }
  })
  async addSymbol(@Body() body: AddSymbolDto) {
    return this.watchlistService.addSymbol(body.symbol, body.notes);
  }

  @Patch(':id/archive')
  @ApiOperation({ summary: 'Archiva una moneda (detiene streaming conservando historial)' })
  async archiveSymbol(@Param('id') id: string) {
    return this.watchlistService.archiveSymbol(id);
  }

  @Patch(':id/reactivate')
  @ApiOperation({ summary: 'Reactiva una moneda archivada' })
  async reactivateSymbol(@Param('id') id: string) {
    return this.watchlistService.reactivateSymbol(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Elimina permanentemente una moneda y sus datos' })
  async deleteSymbol(@Param('id') id: string) {
    return this.watchlistService.deleteSymbol(id);
  }
}
