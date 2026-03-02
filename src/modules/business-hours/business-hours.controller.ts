import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { BusinessHoursService } from './business-hours.service';
import {
  CreateBusinessHoursDto,
  UpdateBusinessHoursDto,
} from './dto/business-hours.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { UserRole } from '../users/entities/user.entity';

@ApiTags('Business Hours')
@Controller('business-hours')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BusinessHoursController {
  constructor(private readonly businessHoursService: BusinessHoursService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Crear horario de atención (solo admin)' })
  @ApiResponse({ status: 201, description: 'Horario creado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos o ya existe' })
  async create(@Body() createDto: CreateBusinessHoursDto) {
    return await this.businessHoursService.create(createDto);
  }

  @Get()
  @Public()
  @ApiOperation({ summary: 'Listar horarios de atención (público)' })
  @ApiResponse({ status: 200, description: 'Lista de horarios' })
  async findAll() {
    return await this.businessHoursService.findAll();
  }

  @Get('seed')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Crear horarios por defecto para toda la semana (solo admin)',
    description:
      'Crea horarios de 9:00-18:00 para Lunes a Viernes si no existen',
  })
  @ApiResponse({ status: 200, description: 'Horarios creados' })
  async seedDefaultHours() {
    return await this.businessHoursService.seedDefaultHours();
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Obtener horario por ID (público)' })
  @ApiResponse({ status: 200, description: 'Horario encontrado' })
  @ApiResponse({ status: 404, description: 'Horario no encontrado' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return await this.businessHoursService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Actualizar horario (solo admin)' })
  @ApiResponse({ status: 200, description: 'Horario actualizado' })
  @ApiResponse({ status: 404, description: 'Horario no encontrado' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDto: UpdateBusinessHoursDto,
  ) {
    return await this.businessHoursService.update(id, updateDto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Desactivar horario (solo admin - soft delete)' })
  @ApiResponse({ status: 200, description: 'Horario desactivado' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.businessHoursService.remove(id);
    return {
      message: 'Horario desactivado exitosamente',
      id,
    };
  }

  @Patch(':id/activate')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Activar horario (solo admin)' })
  @ApiResponse({ status: 200, description: 'Horario activado' })
  async activate(@Param('id', ParseUUIDPipe) id: string) {
    return await this.businessHoursService.activate(id);
  }
}
