import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n.ts');

const nextConfig: NextConfig = {
  // 本地开发模式 - 前端直接调用 V3 API (localhost:8080/api/v1)
  transpilePackages: ['animejs'],
};

export default withNextIntl(nextConfig);
