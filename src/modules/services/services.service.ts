import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Service } from './entities/service.entity';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

@Injectable()
export class ServicesService {
  private readonly logger = new Logger(ServicesService.name);

  constructor(
    @InjectRepository(Service)
    private servicesRepository: Repository<Service>,
  ) {}

  /**
   * Crear un nuevo servicio médico
   */
  async create(createServiceDto: CreateServiceDto): Promise<Service> {
    // Validar que la seña no sea mayor que el precio
    if (createServiceDto.depositAmount > createServiceDto.price) {
      throw new BadRequestException(
        'El monto de la seña no puede ser mayor que el precio total',
      );
    }

    const service = this.servicesRepository.create(createServiceDto);
    const saved = await this.servicesRepository.save(service);

    this.logger.log(`Servicio creado: ${saved.name} (ID: ${saved.id})`);
    return saved;
  }

  /**
   * Listar servicios con filtros
   */
  async findAll(
    isActive?: boolean,
    page: number = 1,
    limit: number = 50,
  ): Promise<{
    data: Service[];
    total: number;
    page: number;
    lastPage: number;
  }> {
    const query = this.servicesRepository.createQueryBuilder('service');

    // Filtrar por estado activo si se especifica
    if (isActive !== undefined) {
      query.where('service.isActive = :isActive', { isActive });
    }

    // Ordenar por display_order y nombre
    query.orderBy('service.displayOrder', 'ASC');
    query.addOrderBy('service.name', 'ASC');

    // Paginación
    const total = await query.getCount();
    const data = await query
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return {
      data,
      total,
      page,
      lastPage: Math.ceil(total / limit),
    };
  }

  /**
   * Obtener un servicio por ID
   */
  async findOne(id: string): Promise<Service> {
    const service = await this.servicesRepository.findOne({
      where: { id },
    });

    if (!service) {
      throw new NotFoundException(`Servicio con ID ${id} no encontrado`);
    }

    return service;
  }

  /**
   * Actualizar un servicio
   */
  async update(
    id: string,
    updateServiceDto: UpdateServiceDto,
  ): Promise<Service> {
    const service = await this.findOne(id);

    // Validar que la seña no sea mayor que el precio
    const newPrice = updateServiceDto.price ?? service.price;
    const newDeposit = updateServiceDto.depositAmount ?? service.depositAmount;

    if (newDeposit > newPrice) {
      throw new BadRequestException(
        'El monto de la seña no puede ser mayor que el precio total',
      );
    }

    Object.assign(service, updateServiceDto);
    const updated = await this.servicesRepository.save(service);

    this.logger.log(
      `Servicio actualizado: ${updated.name} (ID: ${updated.id})`,
    );
    return updated;
  }

  /**
   * Eliminar un servicio (soft delete)
   */
  async remove(id: string): Promise<void> {
    const service = await this.findOne(id);

    // Soft delete: cambiar isActive a false
    service.isActive = false;
    await this.servicesRepository.save(service);

    this.logger.log(
      `Servicio desactivado: ${service.name} (ID: ${service.id})`,
    );
  }

  /**
   * Activar un servicio
   */
  async activate(id: string): Promise<Service> {
    const service = await this.findOne(id);

    service.isActive = true;
    const activated = await this.servicesRepository.save(service);

    this.logger.log(
      `Servicio activado: ${activated.name} (ID: ${activated.id})`,
    );
    return activated;
  }

  /**
   * Obtener estadísticas de servicios
   */
  async getStats(): Promise<{
    total: number;
    active: number;
    inactive: number;
    averagePrice: number;
    averageDeposit: number;
  }> {
    const total = await this.servicesRepository.count();
    const active = await this.servicesRepository.count({
      where: { isActive: true },
    });
    const inactive = total - active;

    // Calcular promedios
    const services = await this.servicesRepository.find();
    const averagePrice =
      services.reduce((sum, s) => sum + Number(s.price), 0) / (total || 1);
    const averageDeposit =
      services.reduce((sum, s) => sum + Number(s.depositAmount), 0) /
      (total || 1);

    return {
      total,
      active,
      inactive,
      averagePrice: Math.round(averagePrice),
      averageDeposit: Math.round(averageDeposit),
    };
  }

  /**
   * Reordenar servicios
   */
  async reorder(serviceIds: string[]): Promise<void> {
    if (!Array.isArray(serviceIds)) {
      throw new BadRequestException('El body debe ser un array de IDs');
    }
    const updates = serviceIds.map((id, index) =>
      this.servicesRepository.update(id, { displayOrder: index }),
    );
    await Promise.all(updates);
    this.logger.log(`Servicios reordenados: ${serviceIds.length} servicios`);
  }
}
