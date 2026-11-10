import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { BinancePublicService } from '../binance/binance-public.service';

@ApiTags('Symbols')
@Controller('api/symbols')
export class SymbolsController {
  constructor(private readonly binanceService: BinancePublicService) {}

  @Get('search')
  @ApiOperation({ summary: 'Busca y autocompleta símbolos de Binance Futures USDⓈ-M válidos' })
  @ApiQuery({ name: 'q', required: false, description: 'Prefijo o texto a buscar (ej. BTC)' })
  async searchSymbols(@Query('q') q: string = '') {
    const query = (q || '').trim().toUpperCase();
    const all = await this.binanceService.getExchangeSymbols();
    if (!query) {
      return all.slice(0, 30);
    }
    return all.filter(s => s.symbol.includes(query)).slice(0, 20);
  }
}
