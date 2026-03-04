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
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import {
  UpdateAppointmentDto,
  AdminCreateAppointmentDto,
  CancelAppointmentDto,
} from './dto/update-appointment.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User, UserRole } from '../users/entities/user.entity';
import { AppointmentStatus } from './entities/appointment.entity';
import { PaginationDto } from '@/common/dto/pagination.dto';
import { Public } from '@/common/decorators/public.decorator';
import { SlotsService } from './slots.service';

@ApiTags('Appointments')
@Controller('appointments')
export class AppointmentsController {
  constructor(
    private readonly appointmentsService: AppointmentsService,
    private readonly slotsService: SlotsService,
  ) {}

  @Post()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth() // Swagger muestra el candado para enviar token
  @ApiOperation({
    summary: 'Crear un turno (público - opcional con auth)',
    description:
      '🔓 Endpoint público que funciona CON o SIN autenticación.\n\n' +
      '✅ CON token (Authorization header): El turno se asocia al usuario logueado.\n\n' +
      '✅ SIN token: El turno se crea como invitado (userId = null).\n\n',
  })
  @ApiResponse({
    status: 201,
    description:
      'Turno creado exitosamente. Si enviaste token, userId tendrá valor. Si no, userId será null.',
  })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 409, description: 'Horario no disponible' })
  async create(
    @Body() createAppointmentDto: CreateAppointmentDto,
    @CurrentUser() user?: User,
  ) {
    return await this.appointmentsService.create(
      createAppointmentDto,
      user?.id,
    );
  }

  @Post('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Crear turno como admin (sin validaciones estrictas)',
  })
  @ApiResponse({ status: 201, description: 'Turno creado exitosamente' })
  async createAsAdmin(
    @Body() adminCreateDto: AdminCreateAppointmentDto,
    @CurrentUser() admin: User,
  ) {
    return await this.appointmentsService.createAsAdmin(
      adminCreateDto,
      admin.id,
    );
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar todos los turnos (solo admin)' })
  @ApiQuery({ name: 'status', required: false, enum: AppointmentStatus })
  @ApiQuery({
    name: 'startDate',
    required: false,
    type: String,
    description: 'YYYY-MM-DD',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    type: String,
    description: 'YYYY-MM-DD',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Lista de turnos' })
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: AppointmentStatus,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const pageNum = page ? Math.max(1, parseInt(page, 10)) : 1;
    const limitNum = limit ? Math.max(1, parseInt(limit, 10)) : 20;

    return await this.appointmentsService.findAll(
      undefined,
      status,
      startDate,
      endDate,
      pageNum,
      limitNum,
    );
  }

  @Get('my-appointments')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar mis turnos (usuario autenticado)' })
  @ApiResponse({ status: 200, description: 'Lista de turnos del usuario' })
  async getMyAppointments(
    @CurrentUser() user: User,
    @Query() pagination: PaginationDto,
  ) {
    return await this.appointmentsService.findAll(
      user.id,
      undefined,
      undefined,
      undefined,
      pagination.page,
      pagination.limit,
    );
  }

  @Get('today')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtener turnos de hoy (solo admin)' })
  @ApiResponse({ status: 200, description: 'Turnos de hoy' })
  async getTodayAppointments() {
    return await this.appointmentsService.getTodayAppointments();
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtener estadísticas de turnos (solo admin)' })
  @ApiQuery({
    name: 'startDate',
    required: false,
    type: String,
    description: 'Fecha inicio (formato: YYYY-MM-DD, ejemplo: 2025-01-01)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    type: String,
    description: 'Fecha fin (formato: YYYY-MM-DD, ejemplo: 2025-12-31)',
  })
  @ApiResponse({ status: 200, description: 'Estadísticas de turnos' })
  async getStats(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return await this.appointmentsService.getStats(startDate, endDate);
  }

  @Get('available-slots')
  @Public()
  @ApiOperation({
    summary: 'Obtener horarios disponibles para un servicio (público)',
    description:
      'Retorna todos los slots disponibles para un servicio en una fecha específica. Considera horarios de negocio, slots bloqueados y turnos existentes.',
  })
  @ApiQuery({
    name: 'serviceId',
    required: true,
    type: String,
    description: 'ID del servicio',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiQuery({
    name: 'date',
    required: true,
    type: String,
    description: 'Fecha para consultar disponibilidad (formato YYYY-MM-DD)',
    example: '2025-03-15',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de slots con disponibilidad',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          time: { type: 'string', example: '14:00' },
          available: { type: 'boolean', example: true },
          reason: { type: 'string', example: 'Horario ocupado' },
        },
      },
    },
  })
  async getAvailableSlots(
    @Query('serviceId') serviceId: string,
    @Query('date') date: string,
  ) {
    if (!serviceId || !date) {
      throw new BadRequestException('serviceId y date son requeridos');
    }

    return await this.slotsService.getAvailableSlots(serviceId, date);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtener un turno por ID' })
  @ApiResponse({ status: 200, description: 'Turno encontrado' })
  @ApiResponse({ status: 404, description: 'Turno no encontrado' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    const appointment = await this.appointmentsService.findOne(id);

    // Solo admin o el propietario pueden ver el turno
    if (user.role !== UserRole.ADMIN && appointment.userId !== user.id) {
      throw new Error('No tienes permisos para ver este turno');
    }

    return appointment;
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Actualizar turno (solo admin)' })
  @ApiResponse({ status: 200, description: 'Turno actualizado exitosamente' })
  @ApiResponse({ status: 404, description: 'Turno no encontrado' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateAppointmentDto: UpdateAppointmentDto,
  ) {
    return await this.appointmentsService.update(id, updateAppointmentDto);
  }

  @Post(':id/cancel')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancelar turno' })
  @ApiResponse({ status: 200, description: 'Turno cancelado exitosamente' })
  @ApiResponse({ status: 400, description: 'No se puede cancelar el turno' })
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cancelDto: CancelAppointmentDto,
    @CurrentUser() user: User,
  ) {
    const appointment = await this.appointmentsService.findOne(id);

    // Determinar quién cancela
    const isAdmin = user.role === UserRole.ADMIN;
    const isOwner = appointment.userId === user.id;

    if (!isAdmin && !isOwner) {
      throw new Error('No tienes permisos para cancelar este turno');
    }

    return await this.appointmentsService.cancel(
      id,
      cancelDto.cancellationReason,
      isAdmin ? 'admin' : 'patient',
    );
  }
}
