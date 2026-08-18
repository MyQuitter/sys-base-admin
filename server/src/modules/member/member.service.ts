import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { BusinessException } from '../../common/exceptions/business.exception';
import { getPagination, toPageResult } from '../../common/utils/pagination';
import { CreateMemberDto, QueryMemberDto, ResetMemberPasswordDto, UpdateMemberDto } from './dto/member.dto';
import { Member } from './entities/member.entity';

function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

const sourceLabel: Record<string, string> = {
  app: 'App注册',
  admin: '后台创建',
  h5: 'H5注册',
};

@Injectable()
export class MemberService {
  constructor(
    @InjectRepository(Member)
    private readonly memberRepository: Repository<Member>,
    private readonly configService: ConfigService,
  ) {}

  assertPhoneOrEmail(phone?: string, email?: string) {
    if (!phone?.trim() && !email?.trim()) {
      throw new BusinessException('手机号与邮箱至少填写一项', 'MEMBER_ACCOUNT_REQUIRED');
    }
  }

  private toVo(member: Member) {
    return {
      id: member.id,
      phone: member.phone,
      email: member.email,
      nickname: member.nickname,
      avatar: member.avatar,
      status: member.status,
      registerSource: member.registerSource,
      lastLoginAt: member.lastLoginAt,
      lastLoginIp: member.lastLoginIp,
      createdAt: member.createdAt,
      updatedAt: member.updatedAt,
    };
  }

  async findByAccount(account: string) {
    const trimmed = account.trim();
    return this.memberRepository
      .createQueryBuilder('member')
      .addSelect('member.password')
      .where('member.phone = :account OR member.email = :account', { account: trimmed })
      .getOne();
  }

  async findByIdWithPassword(id: number) {
    return this.memberRepository
      .createQueryBuilder('member')
      .addSelect('member.password')
      .where('member.id = :id', { id })
      .getOne();
  }

  async findAll(query: QueryMemberDto) {
    const { page, pageSize, skip } = getPagination(query);
    const qb = this.buildQuery(query);
    qb.orderBy('member.id', 'DESC').skip(skip).take(pageSize);
    const [items, total] = await qb.getManyAndCount();

    return toPageResult(items.map((m) => this.toVo(m)), total, page, pageSize);
  }

  private buildQuery(query: QueryMemberDto) {
    const qb = this.memberRepository.createQueryBuilder('member');

    if (query.keyword?.trim()) {
      const kw = `%${query.keyword.trim()}%`;
      qb.andWhere('(member.phone LIKE :kw OR member.email LIKE :kw OR member.nickname LIKE :kw)', { kw });
    } else {
      if (query.phone) qb.andWhere('member.phone LIKE :phone', { phone: `%${query.phone}%` });
      if (query.email) qb.andWhere('member.email LIKE :email', { email: `%${query.email}%` });
      if (query.nickname) qb.andWhere('member.nickname LIKE :nickname', { nickname: `%${query.nickname}%` });
    }
    if (query.status !== undefined) qb.andWhere('member.status = :status', { status: query.status });

    return qb;
  }

  async exportMembers(query: QueryMemberDto) {
    const items = await this.buildQuery(query).orderBy('member.id', 'DESC').take(5000).getMany();
    const header = 'ID,手机号,邮箱,昵称,状态,注册来源,最后登录时间,最后登录IP,创建时间\n';
    const rows = items
      .map((m) => {
        const vo = this.toVo(m);
        return [
          vo.id,
          csvCell(vo.phone),
          csvCell(vo.email),
          csvCell(vo.nickname),
          vo.status === 1 ? '启用' : '禁用',
          csvCell(sourceLabel[vo.registerSource] ?? vo.registerSource),
          csvCell(vo.lastLoginAt),
          csvCell(vo.lastLoginIp),
          csvCell(vo.createdAt),
        ].join(',');
      })
      .join('\n');
    return `\uFEFF${header}${rows}`;
  }

  async findOne(id: number) {
    const member = await this.memberRepository.findOne({ where: { id } });
    if (!member) throw new NotFoundException('会员不存在');
    return this.toVo(member);
  }

  async create(dto: CreateMemberDto, registerSource: 'admin' | 'app' | 'h5' = 'admin') {
    this.assertPhoneOrEmail(dto.phone, dto.email);
    if (dto.phone) {
      const exists = await this.memberRepository.findOne({ where: { phone: dto.phone } });
      if (exists) throw new BusinessException('手机号已注册', 'MEMBER_PHONE_EXISTS');
    }
    if (dto.email) {
      const exists = await this.memberRepository.findOne({ where: { email: dto.email } });
      if (exists) throw new BusinessException('邮箱已注册', 'MEMBER_EMAIL_EXISTS');
    }

    const rounds = this.configService.get<number>('bcryptRounds') ?? 10;
    const password = await bcrypt.hash(dto.password, rounds);
    const member = this.memberRepository.create({
      phone: dto.phone?.trim() || undefined,
      email: dto.email?.trim() || undefined,
      password,
      nickname: dto.nickname,
      status: dto.status ?? 1,
      registerSource,
    });
    const saved = await this.memberRepository.save(member);
    return this.findOne(saved.id);
  }

  async update(id: number, dto: UpdateMemberDto) {
    const member = await this.memberRepository.findOne({ where: { id } });
    if (!member) throw new NotFoundException('会员不存在');

    if (dto.phone !== undefined && dto.phone !== member.phone) {
      if (dto.phone) {
        const exists = await this.memberRepository.findOne({ where: { phone: dto.phone } });
        if (exists) throw new BusinessException('手机号已注册', 'MEMBER_PHONE_EXISTS');
      }
      member.phone = dto.phone || undefined;
    }
    if (dto.email !== undefined && dto.email !== member.email) {
      if (dto.email) {
        const exists = await this.memberRepository.findOne({ where: { email: dto.email } });
        if (exists) throw new BusinessException('邮箱已注册', 'MEMBER_EMAIL_EXISTS');
      }
      member.email = dto.email || undefined;
    }
    if (!member.phone && !member.email) {
      throw new BusinessException('手机号与邮箱至少保留一项', 'MEMBER_ACCOUNT_REQUIRED');
    }

    if (dto.nickname !== undefined) member.nickname = dto.nickname;
    if (dto.avatar !== undefined) member.avatar = dto.avatar;
    if (dto.status !== undefined) member.status = dto.status;

    await this.memberRepository.save(member);
    return this.findOne(id);
  }

  async remove(id: number) {
    const member = await this.memberRepository.findOne({ where: { id } });
    if (!member) throw new NotFoundException('会员不存在');
    await this.memberRepository.softRemove(member);
    return { success: true };
  }

  async resetPassword(id: number, dto: ResetMemberPasswordDto) {
    const member = await this.findByIdWithPassword(id);
    if (!member) throw new NotFoundException('会员不存在');

    const rounds = this.configService.get<number>('bcryptRounds') ?? 10;
    member.password = await bcrypt.hash(dto.password, rounds);
    await this.memberRepository.save(member);
    return { success: true };
  }

  async changePassword(memberId: number, oldPassword: string, newPassword: string) {
    const member = await this.findByIdWithPassword(memberId);
    if (!member) throw new NotFoundException('会员不存在');

    const valid = await bcrypt.compare(oldPassword, member.password);
    if (!valid) throw new UnauthorizedException({ message: '原密码错误', errorCode: 'AUTH_FAILED' });

    const rounds = this.configService.get<number>('bcryptRounds') ?? 10;
    member.password = await bcrypt.hash(newPassword, rounds);
    await this.memberRepository.save(member);
    return { success: true };
  }

  async updateProfile(memberId: number, data: { nickname?: string; avatar?: string }) {
    return this.update(memberId, data);
  }

  async recordLogin(memberId: number, ip?: string) {
    await this.memberRepository.update(memberId, {
      lastLoginAt: new Date(),
      lastLoginIp: ip,
    });
  }

  buildMemberInfo(member: Member) {
    return {
      id: member.id,
      phone: member.phone,
      email: member.email,
      nickname: member.nickname,
      avatar: member.avatar,
      status: member.status,
      registerSource: member.registerSource,
    };
  }
}
