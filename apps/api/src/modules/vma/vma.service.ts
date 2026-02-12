import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class VmaService {
  private readonly logger = new Logger(VmaService.name);

  /**
   * 获取 VMA 模块状态
   */
  getModuleStatus() {
    return {
      module: 'vma',
      status: 'active',
      subModules: [
        { key: 'truvalve', status: 'pending' },
        { key: 'p-valve', status: 'pending' },
        { key: 'training', status: 'pending' },
      ],
    };
  }
}
