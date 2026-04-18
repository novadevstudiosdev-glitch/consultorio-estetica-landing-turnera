import { NestFactory } from '@nestjs/core';
import { ValidationPipe, ClassSerializerInterceptor } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import * as compression from 'compression';
import helmet from 'helmet';
import { cacheControlMiddleware } from './common/middleware/cache-control.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ── Seguridad ──────────────────────────────────────────────────────────────
  // Helmet añade cabeceras HTTP de seguridad (X-Frame-Options, CSP, HSTS, etc.)
  app.use(
    helmet({
      crossOriginEmbedderPolicy: false, // Necesario para Swagger UI
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net'],
          styleSrc: ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net'],
          imgSrc: ["'self'", 'data:', 'validator.swagger.io'],
        },
      },
    }),
  );

  // ── Compresión ─────────────────────────────────────────────────────────────
  // Gzip para todas las respuestas (reduce payload ~70%)
  app.use(compression());

  // ── Cache-Control ──────────────────────────────────────────────────────────
  app.use(cacheControlMiddleware);

  // ── Prefijo global (excluye rutas SEO y de salud) ─────────────────────────
  app.setGlobalPrefix(process.env.API_PREFIX || 'api', {
    exclude: ['/', '/health', '/status', '/sitemap.xml', '/robots.txt', '/seo/structured-data'],
  });

  // ── CORS ───────────────────────────────────────────────────────────────────
  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(','),
    credentials: true,
  });

  // ── Validación ─────────────────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  // ── Swagger ────────────────────────────────────────────────────────────────
  if (process.env.SWAGGER_ENABLED === 'true') {
    const config = new DocumentBuilder()
      .setTitle('Turnera Estética API')
      .setDescription('Esthetician appointment system API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port, '0.0.0.0');

  const publicUrl =
    process.env.NODE_ENV === 'production'
      ? `https://${process.env.BACKEND_URL}`
      : `http://localhost:${port}`;

  console.log(`🚀 Application running on: ${publicUrl}`);
  console.log(`🗺️  Sitemap: ${publicUrl}/sitemap.xml`);
  console.log(`🤖 Robots:  ${publicUrl}/robots.txt`);
  console.log(`📊 Structured data: ${publicUrl}/seo/structured-data`);
  if (process.env.SWAGGER_ENABLED === 'true') {
    console.log(`📚 Swagger UI: ${publicUrl}/api/docs`);
  }
}
bootstrap();
