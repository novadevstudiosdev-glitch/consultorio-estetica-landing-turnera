import { Request, Response, NextFunction } from 'express';

const rules: Array<{ pattern: RegExp; value: string }> = [
  { pattern: /^\/api\/services(\/)?(\?.*)?$/, value: 'public, max-age=300, stale-while-revalidate=600' },
  { pattern: /^\/api\/brands(\/)?(\?.*)?$/, value: 'public, max-age=3600, stale-while-revalidate=7200' },
  { pattern: /^\/api\/business-hours(\/)?(\?.*)?$/, value: 'public, max-age=3600, stale-while-revalidate=7200' },
  { pattern: /^\/api\/reviews(\/)?(\?.*)?$/, value: 'public, max-age=300, stale-while-revalidate=600' },
  { pattern: /^\/api\/appointments\/available-slots/, value: 'public, max-age=30, stale-while-revalidate=60' },
];

/**
 * Middleware Express plano para Cache-Control.
 * Se aplica en main.ts via app.use() antes del routing de NestJS.
 */
export function cacheControlMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.method !== 'GET') {
    return next();
  }

  for (const rule of rules) {
    if (rule.pattern.test(req.url)) {
      res.setHeader('Cache-Control', rule.value);
      res.setHeader('Vary', 'Accept-Encoding');
      return next();
    }
  }

  res.setHeader('Cache-Control', 'private, no-store');
  next();
}
