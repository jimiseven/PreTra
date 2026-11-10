import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

// Habilitar serialización JSON nativa para BigInt (utilizado por timestamps en base de datos)
(BigInt.prototype as any).toJSON = function () {
  return Number(this);
};

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Configuración de validación global
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true
  }));

  // CORS habilitado para desarrollo local, LAN y Tailscale
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS'
  });

  // Swagger OpenAPI Docs
  const config = new DocumentBuilder()
    .setTitle('PreTra - Futures Momentum & Early Plateau Monitor')
    .setDescription('API REST y canal SSE para monitoreo de desaceleración y mesetas tempranas en futuros Binance USDⓈ-M')
    .setVersion('1.0.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.API_PORT || process.env.PORT || 3001;
  await app.listen(port, '0.0.0.0');

  logger.log(`=======================================================`);
  logger.log(` PreTra API escuchando en http://0.0.0.0:${port}`);
  logger.log(` Swagger Docs disponible en http://localhost:${port}/api/docs`);
  logger.log(` Stream SSE disponible en http://localhost:${port}/api/stream`);
  logger.log(`=======================================================`);
}

bootstrap();
