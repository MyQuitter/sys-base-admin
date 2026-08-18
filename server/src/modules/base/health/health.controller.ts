import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { HealthService } from './health.service';

/**
 * 健康检查接口：无需认证，供 Docker/K8s 探活。
 */
@ApiTags('健康检查')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: '服务健康检查' })
  check() {
    return this.healthService.check();
  }
}
