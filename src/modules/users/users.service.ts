import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from './entities/user.entity';

export class CreateUserDto {
  email: string;
  fullName: string;
  phone?: string;
  dni?: string;
  dateOfBirth?: Date;
  address?: string;
}

export class UpdateUserDto {
  fullName?: string;
  phone?: string;
  dni?: string;
  dateOfBirth?: Date;
  address?: string;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  /**
   * Crear un nuevo usuario
   */
  async create(createUserDto: CreateUserDto): Promise<User> {
    // Verificar si el email ya existe
    const existingUser = await this.findByEmail(createUserDto.email);
    if (existingUser) {
      throw new ConflictException('El email ya está registrado');
    }

    // Verificar si el DNI ya existe (si se proporcionó)
    if (createUserDto.dni) {
      const existingDni = await this.findByDni(createUserDto.dni);
      if (existingDni) {
        throw new ConflictException('El DNI ya está registrado');
      }
    }

    const user = this.usersRepository.create({
      ...createUserDto,
      role: UserRole.PATIENT, // Por defecto es paciente
    });

    return await this.usersRepository.save(user);
  }

  /**
   * Buscar todos los usuarios (con paginación)
   */
  async findAll(
    page: number = 1,
    limit: number = 20,
    role?: UserRole,
  ): Promise<{ data: User[]; total: number; page: number; lastPage: number }> {
    const query = this.usersRepository
      .createQueryBuilder('user')
      .where('user.isActive = :isActive', { isActive: true });

    // Filtrar por rol si se especifica
    if (role) {
      query.andWhere('user.role = :role', { role });
    }

    // Paginación
    const total = await query.getCount();
    const data = await query
      .skip((page - 1) * limit)
      .take(limit)
      .orderBy('user.createdAt', 'DESC')
      .getMany();

    return {
      data,
      total,
      page,
      lastPage: Math.ceil(total / limit),
    };
  }

  /**
   * Buscar usuario por ID
   */
  async findOne(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({
      where: { id, isActive: true },
    });

    if (!user) {
      throw new NotFoundException(`Usuario con ID ${id} no encontrado`);
    }

    return user;
  }

  /**
   * Buscar usuario por email
   */
  async findByEmail(email: string): Promise<User | null> {
    return await this.usersRepository.findOne({
      where: { email },
    });
  }

  /**
   * Buscar usuario por DNI
   */
  async findByDni(dni: string): Promise<User | null> {
    return await this.usersRepository.findOne({
      where: { dni },
    });
  }

  /**
   * Buscar usuario por Google ID
   */
  async findByGoogleId(googleId: string): Promise<User | null> {
    return await this.usersRepository.findOne({
      where: { googleId },
    });
  }

  /**
   * Actualizar usuario
   */
  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);

    // Verificar DNI único si se está actualizando
    if (updateUserDto.dni && updateUserDto.dni !== user.dni) {
      const existingDni = await this.findByDni(updateUserDto.dni);
      if (existingDni && existingDni.id !== id) {
        throw new ConflictException(
          'El DNI ya está registrado por otro usuario',
        );
      }
    }

    Object.assign(user, updateUserDto);
    return await this.usersRepository.save(user);
  }

  /**
   * Soft delete de usuario
   */
  async remove(id: string): Promise<void> {
    const user = await this.findOne(id);

    // No permitir eliminar admin
    if (user.role === UserRole.ADMIN) {
      throw new BadRequestException(
        'No se puede eliminar un usuario administrador',
      );
    }

    user.isActive = false;
    await this.usersRepository.save(user);
  }

  /**
   * Verificar email de usuario
   */
  async verifyEmail(userId: string): Promise<User> {
    const user = await this.findOne(userId);
    user.emailVerified = true;
    return await this.usersRepository.save(user);
  }

  /**
   * Verificar teléfono de usuario
   */
  async verifyPhone(userId: string): Promise<User> {
    const user = await this.findOne(userId);
    user.phoneVerified = true;
    return await this.usersRepository.save(user);
  }

  /**
   * Contar usuarios por rol
   */
  async countByRole(role: UserRole): Promise<number> {
    return await this.usersRepository.count({
      where: { role, isActive: true },
    });
  }

  /**
   * Obtener estadísticas de usuarios
   */
  async getStats(): Promise<{
    totalUsers: number;
    totalPatients: number;
    totalAdmins: number;
    verifiedEmails: number;
    googleUsers: number;
  }> {
    const totalUsers = await this.usersRepository.count({
      where: { isActive: true },
    });
    const totalPatients = await this.countByRole(UserRole.PATIENT);
    const totalAdmins = await this.countByRole(UserRole.ADMIN);
    const verifiedEmails = await this.usersRepository.count({
      where: { emailVerified: true, isActive: true },
    });
    const googleUsers = await this.usersRepository
      .createQueryBuilder('user')
      .where('user.googleId IS NOT NULL')
      .andWhere('user.isActive = :isActive', { isActive: true })
      .getCount();

    return {
      totalUsers,
      totalPatients,
      totalAdmins,
      verifiedEmails,
      googleUsers,
    };
  }
}
