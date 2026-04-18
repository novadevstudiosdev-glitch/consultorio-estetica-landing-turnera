import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Service } from '../services/entities/service.entity';

@Injectable()
export class SeoService {
  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Service)
    private readonly servicesRepository: Repository<Service>,
  ) {}

  private get frontendUrl(): string {
    return this.configService.get<string>('FRONTEND_URL', 'http://localhost:3001');
  }

  private get backendUrl(): string {
    const url = this.configService.get<string>('BACKEND_URL', '');
    return url ? `https://${url}` : 'http://localhost:3000';
  }

  async generateSitemap(): Promise<string> {
    const now = new Date().toISOString().split('T')[0];
    const base = this.frontendUrl;

    const staticPages = [
      { loc: `${base}/`, priority: '1.0', changefreq: 'weekly', lastmod: now },
      { loc: `${base}/gift-cards`, priority: '0.7', changefreq: 'monthly', lastmod: now },
      { loc: `${base}/privacy-policy`, priority: '0.3', changefreq: 'yearly', lastmod: now },
    ];

    const urls = staticPages
      .map(
        (p) => `  <url>
    <loc>${p.loc}</loc>
    <lastmod>${p.lastmod}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`,
      )
      .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
          http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
${urls}
</urlset>`;
  }

  generateRobots(): string {
    const sitemapUrl = `${this.frontendUrl}/sitemap.xml`;
    return `User-agent: *
Allow: /

# No indexar rutas de API
Disallow: /api/

Sitemap: ${sitemapUrl}
`;
  }

  async generateStructuredData(): Promise<object> {
    const services = await this.servicesRepository.find({
      where: { isActive: true },
      order: { displayOrder: 'ASC' },
    });

    const base = this.frontendUrl;

    const offersGraph = services.map((s, i) => ({
      '@type': 'Offer',
      position: i + 1,
      name: s.name,
      description: s.description ?? s.name,
      price: Number(s.price).toFixed(2),
      priceCurrency: 'ARS',
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: Number(s.price).toFixed(2),
        priceCurrency: 'ARS',
        description: `Seña: $${Number(s.depositAmount).toFixed(2)}`,
      },
      seller: {
        '@id': `${base}/#clinic`,
      },
    }));

    const localBusiness = {
      '@type': ['LocalBusiness', 'MedicalBusiness'],
      '@id': `${base}/#clinic`,
      name: 'Consultorio de Estética Regenerativa - Dra. Jaquelina Grassetti',
      alternateName: 'Dra. Jaquelina Grassetti',
      description:
        'Consultorio de medicina estética regenerativa en Rosario, Santa Fe. Tratamientos faciales, corporales y de rejuvenecimiento con la Dra. Jaquelina Grassetti.',
      url: base,
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Rosario',
        addressRegion: 'Santa Fe',
        addressCountry: 'AR',
      },
      priceRange: '$$',
      currenciesAccepted: 'ARS',
      paymentAccepted: 'Cash, Transferencia bancaria, Mercado Pago',
      medicalSpecialty: 'Aesthetic Medicine',
      hasOfferCatalog: {
        '@type': 'OfferCatalog',
        name: 'Servicios de Estética Regenerativa',
        itemListElement: offersGraph,
      },
    };

    const breadcrumb = {
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Inicio',
          item: base,
        },
      ],
    };

    return {
      '@context': 'https://schema.org',
      '@graph': [localBusiness, breadcrumb],
    };
  }
}
