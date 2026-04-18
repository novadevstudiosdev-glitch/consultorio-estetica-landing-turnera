import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guard que permite autenticación OPCIONAL
 * Si hay token, lo valida y agrega el usuario al request
 * Si NO hay token, permite la petición sin usuario
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    // Siempre retornar true para permitir la petición
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any) {
    // Si hay error o no hay usuario, simplemente retornar undefined
    // NO lanzar excepción (a diferencia del JwtAuthGuard normal)
    if (err || !user) {
      return undefined;
    }
    return user;
  }
}
