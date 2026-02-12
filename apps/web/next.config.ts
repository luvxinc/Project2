import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';
import path from 'path';

const withNextIntl = createNextIntlPlugin('./src/i18n.ts');

const nextConfig: NextConfig = {
  // 本地开发模式 - 前端直接调用 V3 API (localhost:8080/api/v1)
  turbopack: {
    // Monorepo root — prevents Turbopack from guessing based on lockfiles
    root: path.resolve(__dirname, '../..'),
  },
};

export default withNextIntl(nextConfig);
