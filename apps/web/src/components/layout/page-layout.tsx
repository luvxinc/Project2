'use client';

import { ReactNode } from 'react';

interface PageLayoutProps {
  children: ReactNode;
  className?: string;
}

/**
 * PageLayout - 页面布局容器
 * 提供一致的页面内边距和最大宽度
 */
export function PageLayout({ children, className = '' }: PageLayoutProps) {
  return (
    <div className={`min-h-screen bg-background ${className}`}>
      <main className="container mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
