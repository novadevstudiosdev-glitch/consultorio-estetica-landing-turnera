import { SetMetadata } from '@nestjs/common';

/**
 * Decorator para marcar endpoints como públicos (sin autenticación)
 * Uso: @Public()
 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
