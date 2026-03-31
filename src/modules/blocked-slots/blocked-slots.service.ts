import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not } from 'typeorm';
import { BlockedSlot, BlockedSlotType } from './entities/blocked-slot.entity';
import {
  CreateBlockedSlotDto,
  UpdateBlockedSlotDto,
} from './dto/blocked-slot.dto';

@Injectable()
export class BlockedSlotsService {
  private readonly logger = new Logger(BlockedSlotsService.name);

  constructor(
    @InjectRepository(BlockedSlot)
    private blockedSlotsRepository: Repository<BlockedSlot>,
  ) {}

  /**
   * Crear slot bloqueado
   */
  async create(createDto: CreateBlockedSlotDto): Promise<BlockedSlot> {
    const normalized = this.normalizeTimes(
      createDto.startTime,
      createDto.endTime,
    );

    const existingActive = await this.findActiveByKey(
      createDto.blockedDate,
      normalized.startTime,
      normalized.endTime,
    );
    if (existingActive) {
      return existingActive;
    }

    const existingInactive = await this.findInactiveByKey(
      createDto.blockedDate,
      normalized.startTime,
      normalized.endTime,
    );
    if (existingInactive) {
      existingInactive.isActive = true;
      if (createDto.type) {
        existingInactive.type = createDto.type;
      }
      if (createDto.reason !== undefined) {
        existingInactive.reason = createDto.reason;
      }
      const reactivated = await this.blockedSlotsRepository.save(
        existingInactive,
      );
      this.logger.log(
        `Slot bloqueado reactivado: ${reactivated.blockedDate} ${reactivated.startTime || 'TODO EL DÍA'}-${reactivated.endTime || ''}`,
      );
      return reactivated;
    }

    const blockedSlot = this.blockedSlotsRepository.create({
      ...createDto,
      startTime: normalized.startTime,
      endTime: normalized.endTime,
    });
    const saved = await this.blockedSlotsRepository.save(blockedSlot);

    this.logger.log(
      `Slot bloqueado: ${saved.blockedDate} ${saved.startTime || 'TODO EL DÍA'}-${saved.endTime || ''}`,
    );
    return saved;
  }

  /**
   * Listar slots bloqueados
   */
  async findAll(
    startDate?: string,
    endDate?: string,
    isActive?: boolean,
  ): Promise<BlockedSlot[]> {
    const query = this.blockedSlotsRepository.createQueryBuilder('blocked');

    // Filtrar por rango de fechas
    if (startDate) {
      query.andWhere('blocked.blockedDate >= :startDate', { startDate });
    }
    if (endDate) {
      query.andWhere('blocked.blockedDate <= :endDate', { endDate });
    }

    // Filtrar por estado activo
    if (isActive !== undefined) {
      query.andWhere('blocked.isActive = :isActive', { isActive });
    }

    query.orderBy('blocked.blockedDate', 'ASC');
    query.addOrderBy('blocked.startTime', 'ASC');

    return await query.getMany();
  }

  /**
   * Obtener slot bloqueado por ID
   */
  async findOne(id: string): Promise<BlockedSlot> {
    const blockedSlot = await this.blockedSlotsRepository.findOne({
      where: { id },
    });

    if (!blockedSlot) {
      throw new NotFoundException(`Slot bloqueado con ID ${id} no encontrado`);
    }

    return blockedSlot;
  }

  /**
   * Actualizar slot bloqueado
   */
  async update(
    id: string,
    updateDto: UpdateBlockedSlotDto,
  ): Promise<BlockedSlot> {
    const blockedSlot = await this.findOne(id);

    const newStartTime =
      updateDto.startTime !== undefined
        ? updateDto.startTime
        : blockedSlot.startTime;
    const newEndTime =
      updateDto.endTime !== undefined ? updateDto.endTime : blockedSlot.endTime;

    const normalized = this.normalizeTimes(newStartTime, newEndTime);

    const existingActive = await this.findActiveByKey(
      updateDto.blockedDate || blockedSlot.blockedDate,
      normalized.startTime,
      normalized.endTime,
      id,
    );
    if (existingActive) {
      throw new BadRequestException(
        'Ya existe un bloqueo activo con la misma fecha y horario',
      );
    }

    Object.assign(blockedSlot, updateDto, {
      startTime: normalized.startTime,
      endTime: normalized.endTime,
    });
    const updated = await this.blockedSlotsRepository.save(blockedSlot);

    this.logger.log(`Slot bloqueado actualizado: ${updated.blockedDate}`);
    return updated;
  }

  /**
   * Eliminar slot bloqueado (soft delete)
   */
  async remove(id: string): Promise<void> {
    const blockedSlot = await this.findOne(id);

    await this.deactivateActiveDuplicatesByKey(
      blockedSlot.blockedDate,
      blockedSlot.startTime ?? null,
      blockedSlot.endTime ?? null,
    );

    this.logger.log(`Slot bloqueado desactivado: ${blockedSlot.blockedDate}`);
  }

  /**
   * Activar slot bloqueado
   */
  async activate(id: string): Promise<BlockedSlot> {
    const blockedSlot = await this.findOne(id);

    await this.deactivateActiveDuplicatesByKey(
      blockedSlot.blockedDate,
      blockedSlot.startTime ?? null,
      blockedSlot.endTime ?? null,
      id,
    );

    blockedSlot.isActive = true;
    const activated = await this.blockedSlotsRepository.save(blockedSlot);

    this.logger.log(`Slot bloqueado activado: ${activated.blockedDate}`);
    return activated;
  }

  /**
   * Bloquear múltiples días (rango de fechas)
   */
  async blockDateRange(
    startDate: string,
    endDate: string,
    type: BlockedSlotType,
    reason?: string,
  ): Promise<BlockedSlot[]> {
    const start = this.parseLocalDate(startDate);
    const end = this.parseLocalDate(endDate);

    if (end < start) {
      throw new BadRequestException(
        'La fecha de fin debe ser posterior a la de inicio',
      );
    }

    const created: BlockedSlot[] = [];
    const currentDate = new Date(start);

    while (currentDate <= end) {
      const dateStr = this.formatLocalDate(currentDate);

      const existingActive = await this.findActiveByKey(
        dateStr,
        null,
        null,
      );
      if (existingActive) {
        currentDate.setDate(currentDate.getDate() + 1);
        continue;
      }

      const existingInactive = await this.findInactiveByKey(
        dateStr,
        null,
        null,
      );
      if (existingInactive) {
        existingInactive.isActive = true;
        existingInactive.type = type;
        if (reason !== undefined) {
          existingInactive.reason = reason;
        }
        const reactivated = await this.blockedSlotsRepository.save(
          existingInactive,
        );
        created.push(reactivated);
        currentDate.setDate(currentDate.getDate() + 1);
        continue;
      }

      const blockedSlot = this.blockedSlotsRepository.create({
        blockedDate: dateStr as any,
        type,
        reason,
        isActive: true,
        startTime: null,
        endTime: null,
      });

      const saved = await this.blockedSlotsRepository.save(blockedSlot);
      created.push(saved);

      currentDate.setDate(currentDate.getDate() + 1);
    }

    this.logger.log(
      `Rango bloqueado: ${startDate} a ${endDate} (${created.length} días)`,
    );
    return created;
  }

  private normalizeTimes(
    startTime?: string | null,
    endTime?: string | null,
  ): { startTime: string | null; endTime: string | null } {
    const hasStart = startTime !== undefined && startTime !== null;
    const hasEnd = endTime !== undefined && endTime !== null;

    if (hasStart !== hasEnd) {
      throw new BadRequestException(
        'Debes indicar ambas horas (inicio y fin) o ninguna para todo el dÃ­a',
      );
    }

    if (hasStart && hasEnd) {
      const startMinutes = this.timeToMinutes(startTime!);
      const endMinutes = this.timeToMinutes(endTime!);
      if (startMinutes === null || endMinutes === null) {
        throw new BadRequestException('Formato de hora invÃ¡lido');
      }
      if (endMinutes <= startMinutes) {
        throw new BadRequestException(
          'La hora de fin debe ser posterior a la de inicio',
        );
      }
    }

    return {
      startTime: hasStart ? startTime! : null,
      endTime: hasEnd ? endTime! : null,
    };
  }

  private timeToMinutes(time: string): number | null {
    const [hours, minutes] = time.split(':').map(Number);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) {
      return null;
    }
    return hours * 60 + minutes;
  }

  private async findActiveByKey(
    blockedDate: string | Date,
    startTime: string | null,
    endTime: string | null,
    excludeId?: string,
  ): Promise<BlockedSlot | null> {
    const where: Record<string, unknown> = {
      blockedDate: blockedDate as any,
      isActive: true,
      startTime: startTime ?? IsNull(),
      endTime: endTime ?? IsNull(),
    };
    if (excludeId) {
      where.id = Not(excludeId);
    }
    return await this.blockedSlotsRepository.findOne({ where });
  }

  private async findInactiveByKey(
    blockedDate: string | Date,
    startTime: string | null,
    endTime: string | null,
  ): Promise<BlockedSlot | null> {
    return await this.blockedSlotsRepository.findOne({
      where: {
        blockedDate: blockedDate as any,
        isActive: false,
        startTime: startTime ?? IsNull(),
        endTime: endTime ?? IsNull(),
      },
      order: { updatedAt: 'DESC' },
    });
  }

  private async deactivateActiveDuplicatesByKey(
    blockedDate: string | Date,
    startTime: string | null,
    endTime: string | null,
    excludeId?: string,
  ): Promise<void> {
    const query = this.blockedSlotsRepository
      .createQueryBuilder()
      .update(BlockedSlot)
      .set({ isActive: false })
      .where('blocked_date = :blockedDate', { blockedDate })
      .andWhere('is_active = true');

    if (startTime === null && endTime === null) {
      query.andWhere('start_time IS NULL').andWhere('end_time IS NULL');
    } else {
      query
        .andWhere('start_time = :startTime', { startTime })
        .andWhere('end_time = :endTime', { endTime });
    }

    if (excludeId) {
      query.andWhere('id <> :excludeId', { excludeId });
    }

    await query.execute();
  }

  private parseLocalDate(value: string): Date {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  private formatLocalDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
