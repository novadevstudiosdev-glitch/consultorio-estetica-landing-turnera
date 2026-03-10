import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path/win32';
import { ClassSerializerInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Solo servir archivos estáticos en desarrollo
  // if (process.env.NODE_ENV === 'development') {
  // app.useStaticAssets(join(__dirname, '..', 'public'));
  // app.useStaticAssets(join(__dirname, '..', 'frontend'));
  // console.log('📁 Static files enabled: /public');
  // console.log('📁 Static files enabled: /frontend');
  //}

  // Global prefix for all routes, excluding health, checks and root
  app.setGlobalPrefix(process.env.API_PREFIX || 'api', {
    exclude: ['/', '/health', '/status'],
  });

  // CORS
  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(','),
    credentials: true,
  });

  // Validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  // Swagger
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
  if (process.env.SWAGGER_ENABLED === 'true') {
    console.log(`📚 Swagger UI: ${publicUrl}/api/docs`);
  }
}
bootstrap();
