'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';

/**
 * 导航模块 key → 权限 key 前缀映射
 * 与 AppleNav 保持一致
 */
const NAV_TO_PERMISSION_PREFIX: Record<string, string> = {
  sales:    'module.sales',
  purchase: 'module.purchase',
  inventory:'module.inventory',
  finance:  'module.finance',
  products: 'module.products',
  vma:      'module.vma',
  users:    'module.user_admin',
  db_admin: 'module.db_admin',
  logs:     'module.audit',
};

function hasModulePermission(navKey: string, userPerms: Record<string, unknown>): boolean {
  const prefix = NAV_TO_PERMISSION_PREFIX[navKey];
  if (!prefix) return false;
  return Object.keys(userPerms).some(k => k.startsWith(prefix) && userPerms[k] === true);
}

const moduleCards = [
  { 
    key: 'sales', 
    enabled: false, 
    subs: ['transactions', 'reports', 'visuals'] 
  },
  { 
    key: 'purchase', 
    enabled: false, 
    subs: ['supplier', 'po', 'send', 'receive', 'abnormal'] 
  },
  { 
    key: 'inventory', 
    enabled: false, 
    subs: ['stocktake', 'dynamic', 'shelf'] 
  },
  { 
    key: 'finance', 
    enabled: false, 
    subs: ['flow', 'logistic', 'prepay', 'deposit', 'po_payment'] 
  },
  { 
    key: 'products', 
    enabled: false, 
    subs: ['cogs', 'create', 'barcode'] 
  },
  { 
    key: 'vma', 
    enabled: true, 
    href: '/vma',
    subs: ['truvalve', 'p_valve', 'employees', 'duties', 'training'] 
  },
  { 
    key: 'users', 
    enabled: true, 
    href: '/users', 
    subs: ['list', 'register', 'password', 'capabilities'] 
  },
  { 
    key: 'db_admin', 
    enabled: false, 
    subs: ['backup', 'cleanup'] 
  },
  { 
    key: 'logs', 
    enabled: true,
    href: '/logs',
    subs: ['errors', 'audits', 'business', 'access', 'maintenance'] 
  },
];

export default function DashboardPage() {
  const tHome = useTranslations('home');
  const tModules = useTranslations('modules');
  const { theme } = useTheme();
  const colors = themeColors[theme];

  // 读取当前用户权限
  const [userPerms, setUserPerms] = useState<{ isPrivileged: boolean; permissions: Record<string, unknown> }>({
    isPrivileged: false, permissions: {}
  });
  useEffect(() => {
    try {
      const stored = localStorage.getItem('user');
      if (!stored) return;
      const user = JSON.parse(stored);
      const roles: string[] = user.roles || [];
      setUserPerms({
        isPrivileged: roles.includes('superuser') || roles.includes('admin'),
        permissions: user.permissions || {},
      });
    } catch { /* ignore */ }
  }, []);

  const canAccessModule = (modKey: string): boolean => {
    if (userPerms.isPrivileged) return true;
    return hasModulePermission(modKey, userPerms.permissions);
  };

  return (
    <div style={{ backgroundColor: colors.bg }} className="min-h-screen">
      {/* Hero */}
      <section className="pt-16 pb-12 text-center">
        <div className="max-w-[980px] mx-auto px-6">
          <Image 
            src="/logo.png" 
            alt="Logo" 
            width={350} 
            height={350} 
            style={{ filter: colors.logoFilter }}
            className="mx-auto mb-6"
          />
          <h1 style={{ color: colors.text }} className="text-[56px] font-semibold tracking-tight">
            {tHome('title')}
          </h1>
          <p style={{ color: colors.textSecondary }} className="text-[21px] mt-4 max-w-[600px] mx-auto">
            {tHome('description')}
          </p>
        </div>
      </section>

      {/* Modules */}
      <section style={{ backgroundColor: colors.bgSecondary }} className="py-16">
        <div className="max-w-[1200px] mx-auto px-6">
          <h2 style={{ color: colors.text }} className="text-[40px] font-semibold text-center mb-2">
            {tModules('title')}
          </h2>
          <p style={{ color: colors.textSecondary }} className="text-[17px] text-center mb-12">
            {tModules('subtitle')}
          </p>
          
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {moduleCards.map((mod) => {
              const hasAccess = mod.enabled && canAccessModule(mod.key);
              const isLocked = mod.enabled && !canAccessModule(mod.key);

              return (
                <div
                  key={mod.key}
                  style={{
                    backgroundColor: hasAccess ? colors.bgTertiary : `${colors.bgTertiary}80`,
                    borderColor: hasAccess ? colors.border : `${colors.border}50`
                  }}
                  className={`rounded-2xl overflow-hidden transition-all border ${
                    hasAccess ? 'hover:border-[#0071e3]' : ''
                  }`}
                >
                  {hasAccess && mod.href ? (
                    <Link href={mod.href} className="block p-5">
                      <div className="flex items-center justify-between mb-3">
                        <h3 style={{ color: colors.text }} className="text-[17px] font-semibold">
                          {tModules(`${mod.key}.title`)}
                        </h3>
                        <span className="text-[10px] text-[#30d158] uppercase tracking-wide">
                          ● {tModules('completed')}
                        </span>
                      </div>
                      <p style={{ color: colors.textSecondary }} className="text-[12px] mb-4">
                        {tModules(`${mod.key}.description`)}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {mod.subs.map((sub) => (
                          <span 
                            key={sub}
                            style={{ backgroundColor: `${colors.blue}20`, color: colors.blue }}
                            className="text-[10px] px-2 py-0.5 rounded-full"
                          >
                            {tModules(`${mod.key}.${sub}.title`)}
                          </span>
                        ))}
                      </div>
                    </Link>
                  ) : isLocked ? (
                    /* 🔒 锁定状态: 有此模块但无权限 */
                    <div className="p-5 cursor-not-allowed">
                      <div className="flex items-center justify-between mb-3">
                        <h3 style={{ color: colors.textTertiary }} className="text-[17px] font-semibold">
                          {tModules(`${mod.key}.title`)}
                        </h3>
                        <span className="text-[10px] uppercase tracking-wide font-medium flex items-center gap-1" style={{ color: colors.textTertiary }}>
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
                          </svg>
                          {tModules('noPermission')}
                        </span>
                      </div>
                      <p style={{ color: colors.textTertiary }} className="text-[12px] mb-4">
                        {tModules(`${mod.key}.description`)}
                      </p>
                      <div className="flex flex-wrap gap-1.5 opacity-40">
                        {mod.subs.map((sub) => (
                          <span 
                            key={sub}
                            style={{ backgroundColor: `${colors.border}50`, color: colors.textTertiary }}
                            className="text-[10px] px-2 py-0.5 rounded-full"
                          >
                            {tModules(`${mod.key}.${sub}.title`)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    /* 待迁移状态 */
                    <div className="p-5">
                      <div className="flex items-center justify-between mb-3">
                        <h3 style={{ color: colors.textTertiary }} className="text-[17px] font-semibold">
                          {tModules(`${mod.key}.title`)}
                        </h3>
                        <span className="text-[10px] text-[#ff9f0a] uppercase tracking-wide">
                          ○ {tModules('pending')}
                        </span>
                      </div>
                      <p style={{ color: colors.textTertiary }} className="text-[12px] mb-4">
                        {tModules(`${mod.key}.description`)}
                      </p>
                      <div className="flex flex-wrap gap-1.5 opacity-40">
                        {mod.subs.map((sub) => (
                          <span 
                            key={sub}
                            style={{ backgroundColor: `${colors.border}50`, color: colors.textTertiary }}
                            className="text-[10px] px-2 py-0.5 rounded-full"
                          >
                            {tModules(`${mod.key}.${sub}.title`)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Status */}
      <section className="py-16">
        <div className="max-w-[980px] mx-auto px-6">
          <h2 style={{ color: colors.text }} className="text-[28px] font-semibold text-center mb-10">
            System Status
          </h2>
          
          <div className="grid md:grid-cols-3 gap-4">
            <div 
              style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
              className="p-5 rounded-xl border"
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full bg-[#30d158] animate-pulse" />
                <span className="text-[11px] text-[#30d158] font-medium uppercase tracking-wide">
                  Running
                </span>
              </div>
              <h3 style={{ color: colors.text }} className="text-[15px] font-semibold">API Server</h3>
              <p style={{ color: colors.textTertiary }} className="text-[12px] mt-1">Spring Boot 3.x</p>
            </div>

            <div 
              style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
              className="p-5 rounded-xl border"
            >
              <div className="flex items-center gap-2 mb-3">
                <div style={{ backgroundColor: colors.blue }} className="w-2 h-2 rounded-full" />
                <span style={{ color: colors.blue }} className="text-[11px] font-medium uppercase tracking-wide">
                  Connected
                </span>
              </div>
              <h3 style={{ color: colors.text }} className="text-[15px] font-semibold">Database</h3>
              <p style={{ color: colors.textTertiary }} className="text-[12px] mt-1">PostgreSQL + JPA</p>
            </div>

            <div 
              style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
              className="p-5 rounded-xl border"
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full bg-[#bf5af2]" />
                <span className="text-[11px] text-[#bf5af2] font-medium uppercase tracking-wide">
                  100% Passed
                </span>
              </div>
              <h3 style={{ color: colors.text }} className="text-[15px] font-semibold">Auth Module</h3>
              <p style={{ color: colors.textTertiary }} className="text-[12px] mt-1">JWT + RBAC</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderColor: `${colors.border}50` }} className="py-6 border-t">
        <div className="max-w-[980px] mx-auto px-6">
          <p style={{ color: colors.textTertiary }} className="text-[11px] text-center">
            MGMT V3 · {tHome('footer.phase')} · {tHome('footer.module')}
          </p>
        </div>
      </footer>
    </div>
  );
}
