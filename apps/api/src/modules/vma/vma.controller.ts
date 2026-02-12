import { Controller, Get } from '@nestjs/common';
import { VmaService } from './vma.service';

@Controller('vma')
export class VmaController {
  constructor(private readonly vmaService: VmaService) {}

  @Get('status')
  getStatus() {
    return this.vmaService.getModuleStatus();
  }
}
