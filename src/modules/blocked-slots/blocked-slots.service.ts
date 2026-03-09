import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
    // Validar que endTime > startTime si ambos existen
    if (createDto.endTime <= createDto.startTime) {
      throw new BadRequestException(
        'La hora de fin debe ser posterior a la de inicio',
      );
    }

    const blockedSlot = this.blockedSlotsRepository.create(createDto);
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

    // Validar endTime > startTime si se actualizan
    const newStartTime = updateDto.startTime || blockedSlot.startTime;
    const newEndTime = updateDto.endTime || blockedSlot.endTime;

    if (newEndTime <= newStartTime) {
      throw new BadRequestException(
        'La hora de fin debe ser posterior a la de inicio',
      );
    }

    Object.assign(blockedSlot, updateDto);
    const updated = await this.blockedSlotsRepository.save(blockedSlot);

    this.logger.log(`Slot bloqueado actualizado: ${updated.blockedDate}`);
    return updated;
  }

  /**
   * Eliminar slot bloqueado (soft delete)
   */
  async remove(id: string): Promise<void> {
    const blockedSlot = await this.findOne(id);

    blockedSlot.isActive = false;
    await this.blockedSlotsRepository.save(blockedSlot);

    this.logger.log(`Slot bloqueado desactivado: ${blockedSlot.blockedDate}`);
  }

  /**
   * Activar slot bloqueado
   */
  async activate(id: string): Promise<BlockedSlot> {
    const blockedSlot = await this.findOne(id);

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

      const blockedSlot = this.blockedSlotsRepository.create({
        blockedDate: dateStr as any,
        type,
        reason,
        isActive: true,
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
