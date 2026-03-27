import { Controller, Get, Header, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { SeoService } from './seo.service';

@ApiTags('SEO')
@Controller()
export class SeoController {
  constructor(private readonly seoService: SeoService) {}

  @Get('sitemap.xml')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400')
  @ApiOperation({ summary: 'Sitemap XML dinámico del sitio' })
  @ApiResponse({ status: 200, description: 'Sitemap XML generado dinámicamente' })
  async sitemap(@Res() res: Response): Promise<void> {
    const xml = await this.seoService.generateSitemap();
    res.send(xml);
  }

  @Get('robots.txt')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=86400')
  @ApiOperation({ summary: 'Archivo robots.txt para crawlers' })
  @ApiResponse({ status: 200, description: 'Robots.txt generado' })
  robots(@Res() res: Response): void {
    const content = this.seoService.generateRobots();
    res.send(content);
  }

  @Get('seo/structured-data')
  @Header('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400')
  @ApiOperation({
    summary: 'Datos estructurados JSON-LD para el frontend',
    description:
      'Retorna el schema.org (LocalBusiness + MedicalBusiness) con los servicios activos. ' +
      'El frontend debe embeber este objeto en un <script type="application/ld+json">.',
  })
  @ApiResponse({ status: 200, description: 'JSON-LD estructurado' })
  async structuredData(): Promise<object> {
    return this.seoService.generateStructuredData();
  }
}
