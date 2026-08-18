import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { getAddress, isAddress } from 'viem';
import { In, Like, Repository } from 'typeorm';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { getPagination, toPageResult } from '../../../common/utils/pagination';
import { maskWallet } from '../../../common/utils/wallet';
import { Position } from '../position/entities/position.entity';
import { Role } from '../role/entities/role.entity';
import { BindWalletDto } from './dto/bind-wallet.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { QueryUserDto } from './dto/query-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';

/**
 * 用户业务服务：分页查询、CRUD、角色/部门/岗位关联与密码重置。
 */
@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(Position)
    private readonly positionRepository: Repository<Position>,
    private readonly configService: ConfigService,
  ) {}

  private toUserVo(user: User) {
    return {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      status: user.status,
      departmentId: user.departmentId,
      walletAddress: user.walletAddress,
      walletAddressMasked: maskWallet(user.walletAddress),
      roles: user.roles?.map((r) => ({ id: r.id, code: r.code, name: r.name })) ?? [],
      positions: user.positions?.map((p) => ({ id: p.id, code: p.code, name: p.name })) ?? [],
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async findAll(query: QueryUserDto) {
    const { page, pageSize, skip } = getPagination(query);
    const where: Record<string, unknown> = {};
    if (query.username) where.username = Like(`%${query.username}%`);
    if (query.status !== undefined) where.status = query.status;
    if (query.departmentId !== undefined) where.departmentId = query.departmentId;

    const [items, total] = await this.userRepository.findAndCount({
      where,
      relations: { roles: true, positions: true },
      skip,
      take: pageSize,
      order: { id: 'DESC' },
    });

    return toPageResult(items.map((u) => this.toUserVo(u)), total, page, pageSize);
  }

  async findOne(id: number) {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: { roles: true, positions: true },
    });
    if (!user) throw new NotFoundException('用户不存在');
    return this.toUserVo(user);
  }

  async create(dto: CreateUserDto) {
    const exists = await this.userRepository.findOne({ where: { username: dto.username } });
    if (exists) throw new BusinessException('用户名已存在', 'USER_EXISTS');

    const rounds = this.configService.get<number>('bcryptRounds') ?? 10;
    const password = await bcrypt.hash(dto.password, rounds);
    const roles = dto.roleIds?.length
      ? await this.roleRepository.find({ where: { id: In(dto.roleIds) } })
      : [];
    const positions = dto.positionIds?.length
      ? await this.positionRepository.find({ where: { id: In(dto.positionIds) } })
      : [];

    const user = this.userRepository.create({
      username: dto.username,
      password,
      nickname: dto.nickname,
      status: dto.status ?? 1,
      departmentId: dto.departmentId,
      roles,
      positions,
    });
    const saved = await this.userRepository.save(user);
    return this.findOne(saved.id);
  }

  async update(id: number, dto: UpdateUserDto) {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: { roles: true, positions: true },
    });
    if (!user) throw new NotFoundException('用户不存在');

    if (dto.username !== undefined && dto.username !== user.username) {
      const exists = await this.userRepository.findOne({ where: { username: dto.username } });
      if (exists) throw new BusinessException('用户名已存在', 'USER_EXISTS');
      user.username = dto.username;
    }
    if (dto.nickname !== undefined) user.nickname = dto.nickname;
    if (dto.status !== undefined) user.status = dto.status;
    if (dto.departmentId !== undefined) user.departmentId = dto.departmentId;
    if (dto.roleIds !== undefined) {
      user.roles = dto.roleIds.length
        ? await this.roleRepository.find({ where: { id: In(dto.roleIds) } })
        : [];
    }
    if (dto.positionIds !== undefined) {
      user.positions = dto.positionIds.length
        ? await this.positionRepository.find({ where: { id: In(dto.positionIds) } })
        : [];
    }

    await this.userRepository.save(user);
    return this.findOne(id);
  }

  async remove(id: number) {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('用户不存在');

    const activeCount = await this.userRepository.count();
    if (activeCount <= 1) {
      throw new BusinessException('系统至少保留一名用户，无法删除', 'USER_LAST_ONE');
    }

    await this.userRepository.softRemove(user);
    return { success: true };
  }

  async resetPassword(id: number, dto: ResetPasswordDto) {
    const user = await this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.id = :id', { id })
      .getOne();
    if (!user) throw new NotFoundException('用户不存在');

    const rounds = this.configService.get<number>('bcryptRounds') ?? 10;
    user.password = await bcrypt.hash(dto.password, rounds);
    await this.userRepository.save(user);
    return { success: true };
  }

  /** 当前用户修改密码，需校验旧密码 */
  async changePassword(userId: number, oldPassword: string, newPassword: string) {
    const user = await this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.id = :id', { id: userId })
      .getOne();
    if (!user) throw new NotFoundException('用户不存在');

    const valid = await bcrypt.compare(oldPassword, user.password);
    if (!valid) throw new UnauthorizedException('原密码错误');

    const rounds = this.configService.get<number>('bcryptRounds') ?? 10;
    user.password = await bcrypt.hash(newPassword, rounds);
    await this.userRepository.save(user);
    return { success: true };
  }

  /** 当前用户更新昵称等资料 */
  async updateProfile(userId: number, nickname?: string) {
    return this.update(userId, { nickname });
  }

  async bindWallet(id: number, dto: BindWalletDto, operatorId: number) {
    if (!isAddress(dto.walletAddress)) {
      throw new BusinessException('钱包地址格式无效', 'WALLET_ADDRESS_INVALID');
    }
    const checksum = getAddress(dto.walletAddress);
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('用户不存在');

    const occupied = await this.userRepository.findOne({ where: { walletAddress: checksum } });
    if (occupied && occupied.id !== id) {
      throw new BusinessException('该钱包地址已绑定其他用户', 'WALLET_ADDRESS_TAKEN');
    }

    user.walletAddress = checksum;
    user.walletBoundAt = new Date();
    user.walletBoundBy = operatorId;
    await this.userRepository.save(user);
    return this.findOne(id);
  }

  async unbindWallet(id: number) {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('用户不存在');
    user.walletAddress = undefined;
    user.walletBoundAt = undefined;
    user.walletBoundBy = undefined;
    await this.userRepository.save(user);
    return this.findOne(id);
  }
}
