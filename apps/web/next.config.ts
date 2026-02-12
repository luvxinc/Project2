import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';
import path from 'path';

const withNextIntl = createNextIntlPlugin('./src/i18n.ts');

const nextConfig: NextConfig = {
  // 本地开发模式 - 前端直接调用 API (localhost:3001)
  turbopack: {
    // Monorepo root — prevents Turbopack from guessing based on lockfiles
    root: path.resolve(__dirname, '../..'),
  },
};

export default withNextIntl(nextConfig);
