import { Controller, Get, Put, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody } from '@nestjs/swagger';
import { DetectorService } from '../detector/detector.service';
import { DetectionConfig } from '@pretra/shared';

@ApiTags('Settings')
@Controller('api/settings')
export class SettingsController {
  constructor(private readonly detectorService: DetectorService) {}

  @Get('detector')
  @ApiOperation({ summary: 'Obtiene los parámetros y umbrales configurables del detector' })
  getDetectorSettings(): DetectionConfig {
    return this.detectorService.getConfig();
  }

  @Put('detector')
  @ApiOperation({ summary: 'Actualiza los parámetros y umbrales del detector' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        minImpulsePct: { type: 'number', example: 70 },
        impulseWindowHours: { type: 'number', example: 48 },
        plateauMaxRangePct: { type: 'number', example: 5 },
        plateauMaxDistanceToPeakPct: { type: 'number', example: 3 },
        minHoursWithoutNewHigh: { type: 'number', example: 3 }
      }
    }
  })
  updateDetectorSettings(@Body() body: Partial<DetectionConfig>): DetectionConfig {
    return this.detectorService.updateConfig(body);
  }
}
