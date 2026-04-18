import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Review } from './entities/review.entity';
import { Appointment, AppointmentStatus } from '../appointments/entities/appointment.entity';
import { User, UserRole } from '../users/entities/user.entity';
import {
  CreateReviewDto,
  UpdateReviewDto,
  ApproveReviewDto,
  AdminResponseDto,
  ListReviewsQueryDto,
} from './dto/review.dto';

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    @InjectRepository(Review)
    private reviewsRepository: Repository<Review>,
    @InjectRepository(Appointment)
    private appointmentsRepository: Repository<Appointment>,
  ) {}

  /**
   * Crear review
   */
  async create(
    createReviewDto: CreateReviewDto,
    user: User,
  ): Promise<Review> {
    // Obtener el turno
    const appointment = await this.appointmentsRepository.findOne({
      where: { id: createReviewDto.appointmentId },
      relations: ['user'],
    });

    if (!appointment) {
      throw new NotFoundException('Turno no encontrado');
    }

    // Validar que el turno esté completado
    if (appointment.status !== AppointmentStatus.COMPLETED) {
      throw new BadRequestException(
        'Solo puedes dejar una reseña en turnos completados',
      );
    }

    // Solo pacientes autenticados pueden dejar reseñas
    if (user.role !== UserRole.PATIENT) {
      throw new ForbiddenException(
        'Solo los pacientes pueden dejar reseñas',
      );
    }

    // Validar que sea dueño del turno
    const isOwnerByUserId = !!appointment.userId && appointment.userId === user.id;
    const isOwnerByEmail = appointment.patientEmail === user.email;
    if (!isOwnerByUserId && !isOwnerByEmail) {
      throw new ForbiddenException(
        'No puedes dejar reseña en turnos de otros usuarios',
      );
    }

    // Verificar que no exista ya una review para este turno
    const existingReview = await this.reviewsRepository.findOne({
      where: { appointmentId: createReviewDto.appointmentId },
    });

    if (existingReview) {
      throw new BadRequestException('Ya existe una reseña para este turno');
    }

    // Crear review
    const review = this.reviewsRepository.create({
      appointmentId: createReviewDto.appointmentId,
      rating: createReviewDto.rating,
      comment: createReviewDto.comment,
      userId: user.id,
      reviewerName: createReviewDto.reviewerName || user.fullName || appointment.patientName,
      isApproved: false, // Requiere aprobación del admin
    });

    const saved = await this.reviewsRepository.save(review);

    this.logger.log(
      `⭐ Review creada: ${saved.id} - Rating: ${saved.rating} - Turno: ${appointment.id}`,
    );

    return saved;
  }

  /**
   * Listar reviews (público o admin)
   */
  async findAll(
    queryDto: ListReviewsQueryDto,
    user?: User,
  ): Promise<{
    data: Review[];
    total: number;
    page: number;
    lastPage: number;
  }> {
    const { page = 1, limit = 20, isApproved, rating } = queryDto;

    const query = this.reviewsRepository
      .createQueryBuilder('review')
      .leftJoinAndSelect('review.user', 'user')
      .leftJoinAndSelect('review.appointment', 'appointment')
      .leftJoinAndSelect('appointment.service', 'service');

    // Si NO es admin, solo mostrar aprobadas
    if (!user || user.role !== UserRole.ADMIN) {
      query.andWhere('review.isApproved = :isApproved', { isApproved: true });
    } else {
      // Si es admin y especifica filtro, aplicarlo
      if (isApproved !== undefined) {
        query.andWhere('review.isApproved = :isApproved', { isApproved });
      }
    }

    // Filtrar por rating
    if (rating) {
      query.andWhere('review.rating = :rating', { rating });
    }

    query.orderBy('review.createdAt', 'DESC');

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
   * Obtener review por ID
   */
  async findOne(id: string, user?: User): Promise<Review> {
    const review = await this.reviewsRepository.findOne({
      where: { id },
      relations: ['user', 'appointment', 'appointment.service', 'approvedByUser'],
    });

    if (!review) {
      throw new NotFoundException('Reseña no encontrada');
    }

    // Si no es admin y la review no está aprobada, no mostrar
    if (!user || user.role !== UserRole.ADMIN) {
      if (!review.isApproved) {
        throw new NotFoundException('Reseña no encontrada');
      }
    }

    return review;
  }

  /**
   * Actualizar review (solo el autor o admin)
   */
  async update(
    id: string,
    updateReviewDto: UpdateReviewDto,
    user: User,
  ): Promise<Review> {
    const review = await this.findOne(id, user);

    // Validar permisos
    const isOwner = review.userId === user.id;
    const isAdmin = user.role === UserRole.ADMIN;

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('No tienes permiso para actualizar esta reseña');
    }

    // Si se actualiza, requiere nueva aprobación (excepto admin)
    if (!isAdmin) {
      review.isApproved = false;
      review.approvedAt = null;
      review.approvedByUserId = null;
    }

    Object.assign(review, updateReviewDto);

    const updated = await this.reviewsRepository.save(review);

    this.logger.log(`⭐ Review actualizada: ${id}`);

    return updated;
  }

  /**
   * Aprobar/Rechazar review (solo admin)
   */
  async approve(
    id: string,
    approveDto: ApproveReviewDto,
    admin: User,
  ): Promise<Review> {
    const review = await this.findOne(id, admin);

    review.isApproved = approveDto.isApproved;
    review.approvedAt = approveDto.isApproved ? new Date() : null;
    review.approvedByUserId = approveDto.isApproved ? admin.id : null;

    const updated = await this.reviewsRepository.save(review);

    this.logger.log(
      `${approveDto.isApproved ? '✅' : '❌'} Review ${approveDto.isApproved ? 'aprobada' : 'rechazada'}: ${id}`,
    );

    return updated;
  }

  /**
   * Responder a review (solo admin)
   */
  async respond(
    id: string,
    responseDto: AdminResponseDto,
    admin: User,
  ): Promise<Review> {
    const review = await this.findOne(id, admin);

    review.adminResponse = responseDto.adminResponse;
    review.adminResponseAt = new Date();

    const updated = await this.reviewsRepository.save(review);

    this.logger.log(`💬 Admin respondió a review: ${id}`);

    return updated;
  }

  /**
   * Eliminar review (solo admin)
   */
  async remove(id: string, admin: User): Promise<void> {
    const review = await this.findOne(id, admin);

    await this.reviewsRepository.remove(review);

    this.logger.log(`🗑️ Review eliminada: ${id}`);
  }

  /**
   * Obtener estadísticas de reviews
   */
  async getStats(): Promise<{
    total: number;
    approved: number;
    pending: number;
    averageRating: number;
    ratingDistribution: { rating: number; count: number }[];
  }> {
    const total = await this.reviewsRepository.count();
    const approved = await this.reviewsRepository.count({
      where: { isApproved: true },
    });
    const pending = total - approved;

    // Calcular rating promedio
    const result = await this.reviewsRepository
      .createQueryBuilder('review')
      .select('AVG(review.rating)', 'avg')
      .where('review.isApproved = :isApproved', { isApproved: true })
      .getRawOne();

    const averageRating = result?.avg ? parseFloat(result.avg) : 0;

    // Distribución de ratings
    const distribution = await this.reviewsRepository
      .createQueryBuilder('review')
      .select('review.rating', 'rating')
      .addSelect('COUNT(*)', 'count')
      .where('review.isApproved = :isApproved', { isApproved: true })
      .groupBy('review.rating')
      .orderBy('review.rating', 'DESC')
      .getRawMany();

    const ratingDistribution = distribution.map((d) => ({
      rating: parseInt(d.rating),
      count: parseInt(d.count),
    }));

    return {
      total,
      approved,
      pending,
      averageRating: Math.round(averageRating * 10) / 10, // 1 decimal
      ratingDistribution,
    };
  }

  /**
   * Obtener reviews de un usuario específico
   */
  async findByUser(userId: string): Promise<Review[]> {
    return await this.reviewsRepository.find({
      where: { userId },
      relations: ['appointment', 'appointment.service'],
      order: { createdAt: 'DESC' },
    });
  }
}
