import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessHours, DayOfWeek } from './entities/business-hours.entity';
import {
  CreateBusinessHoursDto,
  UpdateBusinessHoursDto,
} from './dto/business-hours.dto';

@Injectable()
export class BusinessHoursService {
  private readonly logger = new Logger(BusinessHoursService.name);

  constructor(
    @InjectRepository(BusinessHours)
    private businessHoursRepository: Repository<BusinessHours>,
  ) {}

  /**
   * Crear horario de negocio
   */
  async create(createDto: CreateBusinessHoursDto): Promise<BusinessHours> {
    // Validar que close > open
    if (createDto.closeTime <= createDto.openTime) {
      throw new BadRequestException(
        'La hora de cierre debe ser posterior a la de apertura',
      );
    }

    // Verificar si ya existe para ese día
    const existing = await this.businessHoursRepository.findOne({
      where: { dayOfWeek: createDto.dayOfWeek },
    });

    if (existing) {
      throw new BadRequestException(
        `Ya existe una configuración para ${createDto.dayOfWeek}. Usa PATCH para actualizar.`,
      );
    }

    const businessHours = this.businessHoursRepository.create(createDto);
    const saved = await this.businessHoursRepository.save(businessHours);

    this.logger.log(
      `Horario creado: ${saved.dayOfWeek} ${saved.openTime}-${saved.closeTime}`,
    );
    return saved;
  }

  /**
   * Listar todos los horarios
   */
  async findAll(): Promise<BusinessHours[]> {
    return await this.businessHoursRepository.find({
      order: {
        dayOfWeek: 'ASC',
      },
    });
  }

  /**
   * Obtener horario por ID
   */
  async findOne(id: string): Promise<BusinessHours> {
    const businessHours = await this.businessHoursRepository.findOne({
      where: { id },
    });

    if (!businessHours) {
      throw new NotFoundException(`Horario con ID ${id} no encontrado`);
    }

    return businessHours;
  }

  /**
   * Obtener horario por día de la semana
   */
  async findByDay(dayOfWeek: DayOfWeek): Promise<BusinessHours | null> {
    return await this.businessHoursRepository.findOne({
      where: { dayOfWeek, isActive: true },
    });
  }

  /**
   * Actualizar horario
   */
  async update(
    id: string,
    updateDto: UpdateBusinessHoursDto,
  ): Promise<BusinessHours> {
    const businessHours = await this.findOne(id);

    // Validar close > open si se actualizan
    const newOpenTime = updateDto.openTime || businessHours.openTime;
    const newCloseTime = updateDto.closeTime || businessHours.closeTime;

    if (newCloseTime <= newOpenTime) {
      throw new BadRequestException(
        'La hora de cierre debe ser posterior a la de apertura',
      );
    }

    Object.assign(businessHours, updateDto);
    const updated = await this.businessHoursRepository.save(businessHours);

    this.logger.log(`Horario actualizado: ${updated.dayOfWeek}`);
    return updated;
  }

  /**
   * Eliminar horario (soft delete - marcar como inactivo)
   */
  async remove(id: string): Promise<void> {
    const businessHours = await this.findOne(id);

    businessHours.isActive = false;
    await this.businessHoursRepository.save(businessHours);

    this.logger.log(`Horario desactivado: ${businessHours.dayOfWeek}`);
  }

  /**
   * Activar horario
   */
  async activate(id: string): Promise<BusinessHours> {
    const businessHours = await this.findOne(id);

    businessHours.isActive = true;
    const activated = await this.businessHoursRepository.save(businessHours);

    this.logger.log(`Horario activado: ${activated.dayOfWeek}`);
    return activated;
  }

  /**
   * Configuración inicial - crear horarios para toda la semana
   */
  async seedDefaultHours(): Promise<BusinessHours[]> {
    const days = [
      DayOfWeek.MONDAY,
      DayOfWeek.TUESDAY,
      DayOfWeek.WEDNESDAY,
      DayOfWeek.THURSDAY,
      DayOfWeek.FRIDAY,
    ];

    const created: BusinessHours[] = [];

    for (const day of days) {
      const existing = await this.findByDay(day);
      if (!existing) {
        const businessHours = this.businessHoursRepository.create({
          dayOfWeek: day,
          openTime: '09:00',
          closeTime: '18:00',
          slotDurationMinutes: 30,
          isActive: true,
        });

        const saved = await this.businessHoursRepository.save(businessHours);
        created.push(saved);
      }
    }

    this.logger.log(`Horarios iniciales creados: ${created.length} días`);
    return created;
  }
}
