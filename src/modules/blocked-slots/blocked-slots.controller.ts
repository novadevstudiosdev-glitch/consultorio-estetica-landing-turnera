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
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { BlockedSlotsService } from './blocked-slots.service';
import {
  CreateBlockedSlotDto,
  UpdateBlockedSlotDto,
} from './dto/blocked-slot.dto';
import { BlockRangeDto } from './dto/block-range.dto';
import { BlockedSlotType } from './entities/blocked-slot.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { UserRole } from '../users/entities/user.entity';

@ApiTags('Blocked Slots')
@Controller('blocked-slots')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BlockedSlotsController {
  constructor(private readonly blockedSlotsService: BlockedSlotsService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bloquear slot/día (solo admin)' })
  @ApiResponse({ status: 201, description: 'Slot bloqueado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  async create(@Body() createDto: CreateBlockedSlotDto) {
    return await this.blockedSlotsService.create(createDto);
  }

  @Post('block-range')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Bloquear rango de fechas (solo admin)',
    description: 'Bloquea múltiples días consecutivos (ej: vacaciones)',
  })
  @ApiResponse({ status: 201, description: 'Rango bloqueado exitosamente' })
  @ApiBody({ type: BlockRangeDto })
  async blockRange(@Body() body: BlockRangeDto) {
    return await this.blockedSlotsService.blockDateRange(
      body.startDate,
      body.endDate,
      body.type as BlockedSlotType,
      body.reason,
    );
  }

  @Get()
  @Public()
  @ApiOperation({ summary: 'Listar slots bloqueados (público)' })
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
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Lista de slots bloqueados' })
  async findAll(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('isActive') isActive?: string,
  ) {
    const isActiveBool =
      isActive === 'true' ? true : isActive === 'false' ? false : undefined;
    return await this.blockedSlotsService.findAll(
      startDate,
      endDate,
      isActiveBool,
    );
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Obtener slot bloqueado por ID (público)' })
  @ApiResponse({ status: 200, description: 'Slot encontrado' })
  @ApiResponse({ status: 404, description: 'Slot no encontrado' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return await this.blockedSlotsService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Actualizar slot bloqueado (solo admin)' })
  @ApiResponse({ status: 200, description: 'Slot actualizado' })
  @ApiResponse({ status: 404, description: 'Slot no encontrado' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDto: UpdateBlockedSlotDto,
  ) {
    return await this.blockedSlotsService.update(id, updateDto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Desactivar slot bloqueado (solo admin - soft delete)',
  })
  @ApiResponse({ status: 200, description: 'Slot desactivado' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.blockedSlotsService.remove(id);
    return {
      message: 'Slot bloqueado desactivado exitosamente',
      id,
    };
  }

  @Patch(':id/activate')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Activar slot bloqueado (solo admin)' })
  @ApiResponse({ status: 200, description: 'Slot activado' })
  async activate(@Param('id', ParseUUIDPipe) id: string) {
    return await this.blockedSlotsService.activate(id);
  }
}
