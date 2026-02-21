'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useTheme, themeColors } from '@/contexts/ThemeContext';

// Complete module structure from modules.json
const modules = [
  {
    key: 'sales',
    enabled: false,
    groups: [
      { key: 'transactions', items: ['upload'] },
      { key: 'reports', items: ['generate', 'view'] },
      { key: 'visuals', items: ['dashboard'] }
    ]
  },
  {
    key: 'purchase',
    enabled: true,
    href: '/purchase/suppliers',
    groups: [
      { key: 'supplier', items: ['add', 'strategy'] },
      { key: 'po', items: ['create', 'manage'] },
      { key: 'send', items: ['create', 'manage'] },
      { key: 'receive', items: ['goods', 'manage'] },
      { key: 'abnormal', items: ['manage'] }
    ]
  },
  {
    key: 'inventory',
    enabled: false,
    groups: [
      { key: 'stocktake', items: ['upload', 'modify'] },
      { key: 'dynamic', items: ['view'] },
      { key: 'shelf', items: ['manage'] }
    ]
  },
  {
    key: 'finance',
    enabled: false,
    groups: [
      { key: 'flow', items: ['overview'] },
      { key: 'logistic', items: ['manage'] },
      { key: 'prepay', items: ['manage'] },
      { key: 'deposit', items: ['manage'] },
      { key: 'po_payment', items: ['manage'] }
    ]
  },
  {
    key: 'products',
    enabled: true,
    href: '/products',
    groups: [
      { key: 'cogs', items: ['manage'] },
      { key: 'create', items: ['add'] },
      { key: 'barcode', items: ['generate'] }
    ]
  },
  {
    key: 'vma',
    enabled: true,
    href: '/vma',
    groups: [
      { key: 'truvalve', items: ['manage'] },
      { key: 'p_valve', items: ['inventory', 'clinical_case', 'fridge_shelf', 'site_management'] },
      { key: 'employees', items: ['manage'] },
      { key: 'duties', items: ['manage'] },
      { key: 'training', items: ['manage'] },
      { key: 'training_sop', items: ['manage'] },
      { key: 'training_records', items: ['manage'] },
    ]
  },
  {
    key: 'users',
    enabled: true,
    href: '/users',
    groups: [
      { key: 'list', items: ['view'] },
      { key: 'register', items: ['create'] },
      { key: 'password', items: ['manage'] },
      { key: 'capabilities', items: ['manage'] }
    ]
  },
  {
    key: 'db_admin',
    enabled: false,
    groups: [
      { key: 'backup', items: ['create', 'restore', 'manage'] },
      { key: 'cleanup', items: ['delete'] }
    ]
  },
  {
    key: 'logs',
    enabled: true,
    href: '/logs',
    groups: [
      { key: 'errors', items: ['view'] },
      { key: 'audits', items: ['view'] },
      { key: 'business', items: ['view'] },
      { key: 'access', items: ['view'] },
      { key: 'maintenance', items: ['manage'] }
    ]
  }
];

// VMA dropdown href overrides (group.key → href, or group.key/item → href)
const NAV_HREF_OVERRIDES: Record<string, string> = {
  'purchase.supplier':           '/purchase/suppliers',
  'purchase.supplier.add':       '/purchase/suppliers',
  'purchase.supplier.strategy':  '/purchase/suppliers',
  'purchase.po':                 '/purchase/orders',
  'purchase.po.create':          '/purchase/orders',
  'purchase.po.manage':          '/purchase/orders',
  'purchase.send':               '/purchase/shipments',
  'purchase.send.create':        '/purchase/shipments',
  'purchase.send.manage':        '/purchase/shipments',
  'purchase.receive':            '/purchase/receives',
  'purchase.receive.goods':      '/purchase/receive-goods',
  'purchase.receive.manage':     '/purchase/receives',
  'vma.truvalve':                '/vma/truvalve',
  'vma.p_valve.inventory':       '/vma/p-valve/inventory',
  'vma.p_valve.clinical_case':   '/vma/p-valve/clinical-case',
  'vma.p_valve.fridge_shelf':    '/vma/p-valve/fridge-shelf',
  'vma.p_valve.site_management': '/vma/p-valve/site-management',
  'vma.employees':               '/vma/employees',
  'vma.duties':                  '/vma/duties',
  'vma.training':                '/vma/training',
  'vma.training_sop':            '/vma/training-sop',
  'vma.training_records':        '/vma/training-records',
};


interface User {
  id: string;
  username: string;
  displayName?: string;
  roles: string[];
  permissions?: Record<string, unknown>;
}

/**
 * 导航模块 key → 权限 key 映射
 * 导航用 'products'，权限树用 'module.products'
 * 只要用户拥有 module.{key} 或其任一子权限，即视为有权访问该模块
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

/**
 * 检查用户是否有权访问某个导航模块
 * 逻辑: 用户 permissions 中任一 key 以该模块的权限前缀开头 → 有权
 */
function hasModulePermission(navKey: string, userPerms: Record<string, unknown>): boolean {
  const prefix = NAV_TO_PERMISSION_PREFIX[navKey];
  if (!prefix) return false;
  return Object.keys(userPerms).some(k => k.startsWith(prefix) && userPerms[k] === true);
}

export function AppleNav({ locale }: { locale: 'zh' | 'en' | 'vi' }) {
  const t = useTranslations('modules');
  const tNav = useTranslations('nav');
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const colors = themeColors[theme];
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Load user from localStorage after mount to avoid hydration mismatch
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser) as User);
      } catch {
        // ignore
      }
    }
  }, []);

  // 权限检查: 判断用户是否有权访问某个模块
  const isPrivileged = user?.roles?.some(r => r === 'superuser' || r === 'admin') ?? false;
  const canAccessModule = (modKey: string): boolean => {
    if (isPrivileged) return true;
    if (!user?.permissions) return false;
    return hasModulePermission(modKey, user.permissions as Record<string, unknown>);
  };

  // 点击外部关闭用户菜单
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 退出登录
  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    
    // 清除 auth session cookie
    document.cookie = 'auth_session=; path=/; max-age=0';
    
    setUser(null);
    setShowUserMenu(false);
    router.push('/');
  };

  // 获取角色显示文本
  const getRoleDisplay = (roles: string[]) => {
    const roleMap: Record<string, Record<string, string>> = {
      superuser: { zh: '超级管理员', en: 'Super Admin', vi: 'Quản trị viên cao cấp' },
      admin:     { zh: '管理员', en: 'Admin', vi: 'Quản trị viên' },
      operator:  { zh: '操作员', en: 'Operator', vi: 'Nhân viên vận hành' },
    };
    const fallback: Record<string, string> = { zh: '用户', en: 'User', vi: 'Người dùng' };
    for (const role of ['superuser', 'admin', 'operator']) {
      if (roles.includes(role)) return roleMap[role][locale] || roleMap[role].en;
    }
    return fallback[locale] || fallback.en;
  };

  return (
    <>
      {/* Navigation Bar */}
      <nav 
        style={{ 
          backgroundColor: theme === 'dark' ? 'rgba(22,22,23,0.8)' : 'rgba(255,255,255,0.8)',
          borderColor: colors.border 
        }} 
        className="fixed top-0 left-0 right-0 h-11 backdrop-blur-xl z-50 border-b"
      >
        <div className="max-w-[1024px] mx-auto h-full px-5 flex items-center justify-between">
          {/* Logo - 点击返回 Dashboard */}
          <Link href="/dashboard" className="flex-shrink-0 h-full flex items-center">
            <Image 
              src="/logo.png" 
              alt="Logo" 
              width={77} 
              height={77} 
              style={{ filter: colors.logoFilter }}
              className="opacity-80 hover:opacity-100 transition-opacity" 
            />
          </Link>

          {/* 
            ╔═══════════════════════════════════════════════════════════════════╗
            ║  🔒 LOCKED: 导航栏下拉菜单 Hover 逻辑 - 请勿修改                    ║
            ║  Last verified: 2026-02-05 by Agent                               ║
            ╠═══════════════════════════════════════════════════════════════════╣
            ║  行为说明:                                                         ║
            ║  1. onMouseEnter 在导航项目上 → 打开下拉菜单                        ║
            ║  2. onMouseLeave 在下拉菜单面板上 → 关闭菜单                        ║
            ║  3. 此容器不能有 onMouseLeave，否则鼠标移向下拉菜单时会提前关闭       ║
            ║                                                                   ║
            ║  ⚠️  修改此逻辑前必须阅读: style_patterns.md §4.1                  ║
            ╚═══════════════════════════════════════════════════════════════════╝
          */}
          <div className="flex items-center gap-7">
            {modules.map((mod) => {
              const hasAccess = mod.enabled && canAccessModule(mod.key);
              const isLocked = mod.enabled && !canAccessModule(mod.key);

              return (
                <div
                  key={mod.key}
                  className="relative h-11 flex items-center"
                  onMouseEnter={() => setActiveMenu(mod.key)}
                >
                  {hasAccess && mod.href ? (
                    <Link
                      href={mod.href}
                      style={{ color: activeMenu === mod.key ? colors.text : colors.textSecondary }}
                      className="text-[12px] transition-colors hover:opacity-100"
                    >
                      {t(`${mod.key}.title`)}
                    </Link>
                  ) : (
                    <span 
                      style={{ 
                        color: isLocked
                          ? colors.textTertiary
                          : activeMenu === mod.key 
                            ? colors.text 
                            : mod.enabled 
                              ? colors.textSecondary 
                              : colors.textTertiary 
                      }}
                      className={`text-[12px] transition-colors flex items-center gap-1 ${
                        isLocked ? 'cursor-not-allowed opacity-50' : mod.enabled ? 'cursor-pointer hover:opacity-100' : ''
                      }`}
                    >
                      {t(`${mod.key}.title`)}
                      {isLocked && (
                        <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
                        </svg>
                      )}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Right Section */}
          <div className="flex items-center gap-4">
            <LanguageSwitcher currentLocale={locale} />
            
            {/* 主题切换 - macOS 分段控制器风格 */}
            <div 
              style={{ backgroundColor: colors.bgTertiary }}
              className="flex items-center h-7 p-0.5 rounded-md"
            >
              <button
                onClick={() => theme !== 'light' && toggleTheme()}
                style={{ 
                  backgroundColor: theme === 'light' ? colors.bgSecondary : 'transparent',
                  color: theme === 'light' ? colors.text : colors.textSecondary,
                  boxShadow: theme === 'light' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none'
                }}
                className="h-6 w-7 flex items-center justify-center rounded-[5px] transition-all"
                title="Light Mode"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                </svg>
              </button>
              <button
                onClick={() => theme !== 'dark' && toggleTheme()}
                style={{ 
                  backgroundColor: theme === 'dark' ? colors.bgSecondary : 'transparent',
                  color: theme === 'dark' ? colors.text : colors.textSecondary,
                  boxShadow: theme === 'dark' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none'
                }}
                className="h-6 w-7 flex items-center justify-center rounded-[5px] transition-all"
                title="Dark Mode"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
                </svg>
              </button>
            </div>
            {user ? (
              /* 已登录: 显示用户名 + 下拉菜单 */
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  style={{ color: colors.textSecondary }}
                  className="flex items-center gap-2 text-[12px] hover:opacity-80 transition-colors"
                >
                  {/* 用户头像 (首字母) */}
                  <div style={{ backgroundColor: colors.blue }} className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-medium text-white">
                    {user.username.charAt(0).toUpperCase()}
                  </div>
                  <span>{user.username}</span>
                  <svg 
                    className={`w-3 h-3 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24" 
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* 用户下拉菜单 */}
                {showUserMenu && (
                  <div 
                    style={{ 
                      backgroundColor: colors.bgSecondary, 
                      borderColor: colors.border 
                    }}
                    className="absolute right-0 top-full mt-2 w-56 border rounded-xl shadow-2xl overflow-hidden animate-[fadeIn_0.15s_ease-out]"
                  >
                    {/* 用户信息区域 */}
                    <div style={{ borderColor: `${colors.border}80` }} className="px-4 py-3 border-b">
                      <div style={{ color: colors.text }} className="text-[14px] font-medium">{user.displayName || user.username}</div>
                      <div style={{ color: colors.textSecondary }} className="text-[12px]">{getRoleDisplay(user.roles)}</div>
                    </div>

                    {/* 菜单项 */}
                    <div className="py-1">
                      <Link
                        href={`/users/${user.id}`}
                        onClick={() => setShowUserMenu(false)}
                        style={{ color: colors.textSecondary }}
                        className="flex items-center gap-3 px-4 py-2.5 text-[13px] hover:opacity-70 transition-colors"
                      >
                        <svg style={{ color: colors.textTertiary }} className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                        </svg>
                        {tNav('viewProfile')}
                      </Link>
                      <Link
                        href={`/users/${user.id}/permissions`}
                        onClick={() => setShowUserMenu(false)}
                        style={{ color: colors.textSecondary }}
                        className="flex items-center gap-3 px-4 py-2.5 text-[13px] hover:opacity-70 transition-colors"
                      >
                        <svg style={{ color: colors.textTertiary }} className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                        </svg>
                        {tNav('viewPermissions')}
                      </Link>
                      <Link
                        href={`/users/${user.id}/change-password`}
                        onClick={() => setShowUserMenu(false)}
                        style={{ color: colors.textSecondary }}
                        className="flex items-center gap-3 px-4 py-2.5 text-[13px] hover:opacity-70 transition-colors"
                      >
                        <svg style={{ color: colors.textTertiary }} className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                        </svg>
                        {tNav('changePassword')}
                      </Link>
                    </div>

                    {/* 分隔线 */}
                    <div style={{ borderColor: `${colors.border}80` }} className="border-t" />

                    {/* 退出登录 */}
                    <div className="py-1">
                      <button
                        onClick={handleLogout}
                        style={{ color: colors.red }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] hover:opacity-70 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                        </svg>
                        {tNav('signOut')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* 未登录: 显示 Sign In */
              <Link 
                href="/login" 
                style={{ color: colors.textSecondary }}
                className="text-[12px] hover:opacity-80 transition-colors"
              >
                {tNav('signIn')}
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* 
        ╔═══════════════════════════════════════════════════════════════════════╗
        ║  🔒 LOCKED: 下拉菜单面板结构 - 请勿修改                                 ║
        ║  Last verified: 2026-02-05 by Agent                                   ║
        ╠═══════════════════════════════════════════════════════════════════════╣
        ║  关键结构:                                                             ║
        ║  1. Backdrop (z-30): 独立层，点击关闭菜单，不参与 hover 逻辑            ║
        ║  2. Panel (z-40): onMouseLeave 在这里，鼠标离开面板才关闭              ║
        ║                                                                       ║
        ║  ⚠️  禁止操作:                                                        ║
        ║  - 不要把 backdrop 放在 panel 内部（会阻止 onMouseLeave 触发）          ║
        ║  - 不要在导航栏容器添加 onMouseLeave                                   ║
        ║                                                                       ║
        ║  ⚠️  修改此逻辑前必须阅读: style_patterns.md §4.1                      ║
        ╚═══════════════════════════════════════════════════════════════════════╝
      */}
      {activeMenu && (
        <>
          {/* Backdrop with Frosted Glass Effect - 独立层，点击关闭 */}
          <div 
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-30"
            onClick={() => setActiveMenu(null)}
          />
          
          {/* Panel - onMouseLeave 在这里，鼠标离开面板区域才关闭 */}
          <div 
            className="fixed top-11 left-0 right-0 z-40"
            onMouseLeave={() => setActiveMenu(null)}
          >
            <div 
              style={{ 
                backgroundColor: theme === 'dark' ? 'rgba(29,29,31,0.98)' : 'rgba(255,255,255,0.98)',
                borderColor: `${colors.border}50`
              }}
              className="backdrop-blur-2xl border-b animate-[slideDown_0.2s_ease-out]"
            >
              <div className="max-w-[1024px] mx-auto px-5 py-8">
                {modules.filter(m => m.key === activeMenu).map((mod) => {
                  const modLocked = mod.enabled && !canAccessModule(mod.key);

                  return (
                  <div key={mod.key} className="grid grid-cols-5 gap-8">
                    {/* Module Info */}
                    <div className="col-span-1">
                      <h2 style={{ color: modLocked ? colors.textTertiary : colors.text }} className="text-[24px] font-semibold mb-2">
                        {t(`${mod.key}.title`)}
                      </h2>
                      <p style={{ color: modLocked ? colors.textTertiary : colors.textSecondary }} className="text-[13px] mb-4">
                        {t(`${mod.key}.description`)}
                      </p>
                      <div className="flex items-center gap-2">
                        {modLocked ? (
                          <span className="text-[11px] uppercase tracking-wide font-medium flex items-center gap-1" style={{ color: colors.textTertiary }}>
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
                            </svg>
                            {t('noPermission')}
                          </span>
                        ) : mod.enabled ? (
                          <span className="text-[11px] text-[#30d158] uppercase tracking-wide font-medium">
                            ● {t('completed')}
                          </span>
                        ) : (
                          <span className="text-[11px] text-[#ff9f0a] uppercase tracking-wide font-medium">
                            ○ {t('pending')}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Submodule Groups */}
                    <div className="col-span-4 grid grid-cols-4 gap-6" style={{ opacity: modLocked ? 0.4 : 1 }}>
                      {mod.groups.map((group) => (
                        <div key={group.key}>
                          <h3 style={{ color: colors.textSecondary }} className="text-[11px] uppercase tracking-wider mb-3">
                            {t(`${mod.key}.${group.key}.title`)}
                          </h3>
                          <ul className="space-y-2">
                            {group.items.map((item) => {
                              const subHref = NAV_HREF_OVERRIDES[`${mod.key}.${group.key}.${item}`]
                                || NAV_HREF_OVERRIDES[`${mod.key}.${group.key}`]
                                || (mod.href ? `${mod.href}/${group.key}` : '#');
                              
                              return (
                                <li key={item}>
                                  {mod.enabled && !modLocked ? (
                                    <Link
                                      href={subHref}
                                      onClick={() => setActiveMenu(null)}
                                      style={{ color: colors.textSecondary }}
                                      className="text-[14px] hover:opacity-80 transition-colors"
                                    >
                                      {t(`${mod.key}.${group.key}.${item}`)}
                                    </Link>
                                  ) : (
                                    <span style={{ color: colors.textTertiary }} className="text-[14px] flex items-center gap-2">
                                      {t(`${mod.key}.${group.key}.${item}`)}
                                      <svg className="w-3 h-3 opacity-40" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M12 1C8.676 1 6 3.676 6 7v2H4v14h16V9h-2V7c0-3.324-2.676-6-6-6zm0 2c2.276 0 4 1.724 4 4v2H8V7c0-2.276 1.724-4 4-4z"/>
                                      </svg>
                                    </span>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Animation */}
      <style>{`
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  );
}

