import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import {
  CreateReviewDto,
  UpdateReviewDto,
  ApproveReviewDto,
  AdminResponseDto,
  ListReviewsQueryDto,
} from './dto/review.dto';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User, UserRole } from '../users/entities/user.entity';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

@ApiTags('Reviews')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'Crear reseña',
    description:
      'Permite crear una reseña para un turno completado. Usuario autenticado o anónimo.',
  })
  @ApiResponse({ status: 201, description: 'Reseña creada exitosamente' })
  @ApiResponse({ status: 400, description: 'Turno no completado o ya tiene reseña' })
  @ApiResponse({ status: 404, description: 'Turno no encontrado' })
  async create(
    @Body() createReviewDto: CreateReviewDto,
    @CurrentUser() user?: User,
  ) {
    return await this.reviewsService.create(createReviewDto, user);
  }

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'Listar reseñas',
    description:
      'Público: solo reseñas aprobadas. Admin: todas con filtros opcionales.',
  })
  @ApiResponse({ status: 200, description: 'Lista de reseñas' })
  async findAll(
    @Query() queryDto: ListReviewsQueryDto,
    @CurrentUser() user?: User,
  ) {
    return await this.reviewsService.findAll(queryDto, user);
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Obtener estadísticas de reseñas',
    description: 'Promedio de rating, distribución, totales, etc.',
  })
  @ApiResponse({ status: 200, description: 'Estadísticas de reseñas' })
  async getStats() {
    return await this.reviewsService.getStats();
  }

  @Get('user/:userId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Obtener reseñas de un usuario (admin)',
    description: 'Ver todas las reseñas creadas por un usuario específico.',
  })
  @ApiResponse({ status: 200, description: 'Reseñas del usuario' })
  async findByUser(@Param('userId', ParseUUIDPipe) userId: string) {
    return await this.reviewsService.findByUser(userId);
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'Obtener reseña por ID',
    description: 'Público: solo si está aprobada. Admin: siempre.',
  })
  @ApiResponse({ status: 200, description: 'Reseña encontrada' })
  @ApiResponse({ status: 404, description: 'Reseña no encontrada' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user?: User,
  ) {
    return await this.reviewsService.findOne(id, user);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Actualizar reseña',
    description: 'Solo el autor o admin. Requiere nueva aprobación si es usuario.',
  })
  @ApiResponse({ status: 200, description: 'Reseña actualizada' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'Reseña no encontrada' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateReviewDto: UpdateReviewDto,
    @CurrentUser() user: User,
  ) {
    return await this.reviewsService.update(id, updateReviewDto, user);
  }

  @Patch(':id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Aprobar o rechazar reseña (admin)',
    description: 'Cambiar estado de aprobación de una reseña.',
  })
  @ApiResponse({ status: 200, description: 'Reseña aprobada/rechazada' })
  @ApiResponse({ status: 404, description: 'Reseña no encontrada' })
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() approveDto: ApproveReviewDto,
    @CurrentUser() admin: User,
  ) {
    return await this.reviewsService.approve(id, approveDto, admin);
  }

  @Patch(':id/respond')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Responder a reseña (admin)',
    description: 'Agregar respuesta del negocio a una reseña.',
  })
  @ApiResponse({ status: 200, description: 'Respuesta agregada' })
  @ApiResponse({ status: 404, description: 'Reseña no encontrada' })
  async respond(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() responseDto: AdminResponseDto,
    @CurrentUser() admin: User,
  ) {
    return await this.reviewsService.respond(id, responseDto, admin);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Eliminar reseña (admin)',
    description: 'Eliminar permanentemente una reseña.',
  })
  @ApiResponse({ status: 200, description: 'Reseña eliminada' })
  @ApiResponse({ status: 404, description: 'Reseña no encontrada' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: User,
  ) {
    await this.reviewsService.remove(id, admin);
    return { message: 'Reseña eliminada exitosamente' };
  }
}
