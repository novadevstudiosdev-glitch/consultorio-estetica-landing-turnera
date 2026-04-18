import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../modules/users/entities/user.entity';

/**
 * Decorator para especificar qué roles pueden acceder a un endpoint
 * Uso: @Roles(UserRole.ADMIN)
 */
export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
