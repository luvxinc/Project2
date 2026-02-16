'use client';

import Link from 'next/link';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { usersApi, User, UserStatus, UserRole } from '@/lib/api';
import { SecurityCodeDialog } from '@/components/ui/security-code-dialog';
import { useTheme, themeColors } from '@/contexts/ThemeContext';

// 角色配置函数：返回主题响应的角色配色（Pattern #9）
const getRoleConfig = (colors: typeof themeColors.dark): Record<string, { level: number; color: string; icon: string }> => ({
  superuser: { level: 0, color: colors.red, icon: 'crown' },
  admin: { level: 1, color: colors.blue, icon: 'shield' },
  manager: { level: 2, color: colors.green, icon: 'chart' },
  staff: { level: 3, color: colors.orange, icon: 'user' },
  operator: { level: 4, color: colors.indigo, icon: 'cog' },
  editor: { level: 5, color: colors.cyan, icon: 'edit' },
  viewer: { level: 6, color: colors.gray, icon: 'eye' },
});

// 滚动量
const SCROLL_AMOUNT = 340;

// 角色图标组件
function RoleIcon({ type, className }: { type: string; className?: string }) {
  const icons: Record<string, React.ReactNode> = {
    crown: <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l2.5 5 5.5.5-4 4 1 5.5L12 15.5l-5 2.5 1-5.5-4-4 5.5-.5L12 3z" />,
    shield: <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />,
    chart: <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />,
    user: <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />,
    cog: <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />,
    edit: <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />,
    eye: <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />,
  };
  return (
    <svg className={className || "w-4 h-4"} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      {icons[type] || icons.user}
    </svg>
  );
}

// 状态徽章 - 使用 i18n 和动态 colors 确保主题响应性
function StatusBadge({ status, colors, t }: { status: UserStatus; colors: typeof themeColors.dark; t: any }) {
  const config: Record<UserStatus, { color: string; bg: string; labelKey: string }> = {
    ACTIVE: { color: colors.green, bg: `${colors.green}26`, labelKey: 'active' },
    DISABLED: { color: colors.textSecondary, bg: `${colors.textSecondary}20`, labelKey: 'disabled' },
    LOCKED: { color: colors.red, bg: `${colors.red}26`, labelKey: 'locked' },
  };
  const c = config[status];
  return (
    <span 
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${status === 'LOCKED' ? 'animate-pulse' : ''}`}
      style={{ backgroundColor: c.bg, color: c.color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c.color }} />
      {t(`status.${c.labelKey}`)}
    </span>
  );
}

// 分组轮播组件
function GroupCarousel({
  roleKey,
  roleLabel,
  roleColor,
  users,
  colors,
  theme,
  t,
  tc,
  currentUser,
  onAction,
}: {
  roleKey: string;
  roleLabel: string;
  roleColor: string;
  users: User[];
  colors: typeof themeColors.dark;
  theme: 'light' | 'dark';
  t: any;
  tc: any;
  currentUser: { id: string; roles: string[] } | null;
  onAction: (user: User, action: string) => void;
}) {
  const carouselRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollButtons = useCallback(() => {
    if (carouselRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = carouselRef.current;
      setCanScrollLeft(scrollLeft > 10);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
    }
  }, []);

  const scrollCarousel = (direction: 'left' | 'right') => {
    if (carouselRef.current) {
      const amount = direction === 'left' ? -SCROLL_AMOUNT : SCROLL_AMOUNT;
      carouselRef.current.scrollBy({ left: amount, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    const carousel = carouselRef.current;
    if (carousel) {
      requestAnimationFrame(updateScrollButtons);
      
      const handleWheel = (e: WheelEvent) => {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && e.deltaY !== 0) {
          carousel.scrollBy({ left: e.deltaY, behavior: 'auto' });
        }
      };
      
      carousel.addEventListener('wheel', handleWheel, { passive: true });
      return () => carousel.removeEventListener('wheel', handleWheel);
    }
  }, [updateScrollButtons, users]);

  const formatLastLogin = (dateStr: string | null) => {
    if (!dateStr) return t('list.neverLogin');
    return new Date(dateStr).toLocaleDateString('zh-CN', {
      timeZone: 'America/Los_Angeles',
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  const isSelf = (user: User) => currentUser?.id === user.id;
  const isSuperUser = (user: User) => user.roles.includes('superuser');
  const isAdmin = (user: User) => user.roles.includes('admin') || isSuperUser(user);
  
  // 获取动态角色配置
  const roleConfig = getRoleConfig(colors);
  
  const canOperate = (user: User) => {
    if (!currentUser || isSelf(user)) return false;
    const currentLevel = roleConfig[currentUser.roles[0]]?.level ?? 99;
    const targetLevel = roleConfig[user.roles[0]]?.level ?? 99;
    return currentLevel < targetLevel;
  };
  const canPromote = (user: User) => !isSelf(user) && !isSuperUser(user) && !isAdmin(user) && canOperate(user);
  const canDemote = (user: User) => !isSelf(user) && !isSuperUser(user) && isAdmin(user) && canOperate(user);

  return (
    <div className="mb-10">
      {/* 分组标题 */}
      <div className="max-w-[1200px] mx-auto px-6 flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div 
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[13px] font-bold"
            style={{ backgroundColor: roleColor }}
          >
            <RoleIcon type={roleConfig[roleKey]?.icon || 'user'} className="w-4 h-4" />
          </div>
          <h2 style={{ color: colors.text }} className="text-[18px] font-semibold">
            {roleLabel}
          </h2>
          <span style={{ color: colors.textTertiary }} className="text-[14px]">
            ({users.length})
          </span>
        </div>
        
        {/* Navigation Arrows */}
        <div className="flex gap-1">
          <button
            onClick={() => scrollCarousel('left')}
            disabled={!canScrollLeft}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200"
            style={{ backgroundColor: colors.bgTertiary, opacity: canScrollLeft ? 1 : 0.4 }}
          >
            <svg className="w-4 h-4" fill="none" stroke={colors.text} viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <button
            onClick={() => scrollCarousel('right')}
            disabled={!canScrollRight}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200"
            style={{ backgroundColor: colors.bgTertiary, opacity: canScrollRight ? 1 : 0.4 }}
          >
            <svg className="w-4 h-4" fill="none" stroke={colors.text} viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>
      </div>

      {/* 卡片轮播区 */}
      <div 
        ref={carouselRef}
        onScroll={updateScrollButtons}
        className="flex gap-4 overflow-x-auto px-6 pt-2 pb-2 cursor-grab active:cursor-grabbing"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
      >
        {/* Left spacer */}
        <div className="flex-shrink-0 w-[max(0px,calc((100vw-1200px)/2-24px))]" />
        
        {users.map((user, idx) => (
          <div 
            key={user.id}
            className="flex-shrink-0 animate-fadeInUp flex flex-col"
            style={{ width: '320px', animationDelay: `${idx * 60}ms` }}
          >
            {/* 用户名片 */}
            <div 
              className="rounded-[20px] p-5 flex flex-col transition-transform hover:scale-[1.02]"
              style={{ 
                backgroundColor: colors.bgSecondary,
                border: `1px solid ${isSelf(user) ? roleColor : colors.border}`,
                boxShadow: theme === 'dark' 
                  ? '0 6px 24px rgba(0,0,0,0.3)' 
                  : '0 4px 16px rgba(0,0,0,0.06)',
              }}
            >
              {/* 用户头部 */}
              <div className="flex items-center gap-3 mb-4">
                {/* 实心颜色背景的首字母 */}
                <div 
                  className="w-12 h-12 rounded-full flex items-center justify-center text-[18px] font-bold text-white"
                  style={{ backgroundColor: roleColor }}
                >
                  {(user.displayName || user.username).charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span style={{ color: colors.text }} className="text-[15px] font-semibold truncate">
                      {user.displayName || user.username}
                    </span>
                    {isSelf(user) && (
                      <span 
                        className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                        style={{ backgroundColor: `${roleColor}20`, color: roleColor }}
                      >
                        {t('list.me')}
                      </span>
                    )}
                  </div>
                  <div style={{ color: colors.textSecondary }} className="text-[12px] truncate">
                    @{user.username}
                  </div>
                </div>
              </div>

              {/* 信息行 */}
              <div className="space-y-2 mb-4">
                {/* 邮箱 */}
                <div className="flex items-center gap-2">
                  <svg className="w-3.5 h-3.5" fill="none" stroke={colors.textTertiary} viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                  </svg>
                  <span style={{ color: colors.textSecondary }} className="text-[12px] truncate flex-1">
                    {user.email || '-'}
                  </span>
                </div>
                
                {/* 状态 */}
                <div className="flex items-center justify-between">
                  <StatusBadge status={user.status} colors={colors} t={t} />
                  <span style={{ color: colors.textTertiary }} className="text-[11px]">
                    {formatLastLogin(user.lastLoginAt)}
                  </span>
                </div>
              </div>

              {/* 操作按钮行 - 实心风格 */}
              <div className="flex items-center justify-center gap-2 pt-3 border-t" style={{ borderColor: colors.border }}>
                {/* 锁定 - 灰色实心按钮 */}
                {canOperate(user) && user.status !== 'LOCKED' && (
                  <button
                    onClick={() => onAction(user, 'lock')}
                    className="h-8 px-3 flex items-center justify-center gap-1.5 rounded-lg text-[12px] font-medium transition-all hover:opacity-90 text-white"
                    style={{ backgroundColor: colors.gray }}
                    title={t('actions.lock')}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                    </svg>
                  </button>
                )}
                {/* 解锁 - 红色实心按钮 */}
                {canOperate(user) && user.status === 'LOCKED' && (
                  <button
                    onClick={() => onAction(user, 'unlock')}
                    className="h-8 px-3 flex items-center justify-center gap-1.5 rounded-lg text-[12px] font-medium transition-all hover:opacity-90 text-white"
                    style={{ backgroundColor: colors.red }}
                    title={t('actions.unlock')}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                    </svg>
                  </button>
                )}

                {/* 重置密码 - 灰色实心按钮 */}
                {(isSelf(user) || canOperate(user)) && (
                  <button
                    onClick={() => onAction(user, 'resetPassword')}
                    className="h-8 px-3 flex items-center justify-center rounded-lg transition-all hover:opacity-90 text-white"
                    style={{ backgroundColor: colors.gray }}
                    title={t('actions.resetPassword')}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                    </svg>
                  </button>
                )}

                {/* 升级 - 蓝色实心按钮 */}
                {canPromote(user) && (
                  <button
                    onClick={() => onAction(user, 'promote')}
                    className="h-8 px-3 flex items-center justify-center rounded-lg transition-all hover:opacity-90 text-white"
                    style={{ backgroundColor: colors.blue }}
                    title={t('actions.promote')}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
                    </svg>
                  </button>
                )}

                {/* 降级 - 橙色实心按钮 */}
                {canDemote(user) && (
                  <button
                    onClick={() => onAction(user, 'demote')}
                    className="h-8 px-3 flex items-center justify-center rounded-lg transition-all hover:opacity-90 text-white"
                    style={{ backgroundColor: colors.orange }}
                    title={t('actions.demote')}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
                    </svg>
                  </button>
                )}

                {/* 删除 - 红色实心按钮 */}
                {canOperate(user) && !isSuperUser(user) && (
                  <button
                    onClick={() => onAction(user, 'delete')}
                    className="h-8 px-3 flex items-center justify-center rounded-lg transition-all hover:opacity-90 text-white"
                    style={{ backgroundColor: colors.red }}
                    title={t('actions.delete')}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* 权限管理按钮 - Apple风格紧凑按钮，文字宽度自适应 */}
            {!isSelf(user) && !isSuperUser(user) && (
              <div className="mt-2 flex justify-center">
                <Link
                  href={`/users/${user.id}/permissions`}
                  className="h-8 px-4 inline-flex items-center justify-center rounded-full text-[13px] font-medium transition-all hover:opacity-90 text-white"
                  style={{ backgroundColor: colors.blue }}
                >
                  {t('actions.permissions')}
                </Link>
              </div>
            )}
          </div>
        ))}
        
        {/* Right spacer */}
        <div className="flex-shrink-0 w-[max(24px,calc((100vw-1200px)/2))]" />
      </div>
      
      {/* Hide scrollbar */}
      <style>{`div::-webkit-scrollbar { display: none; }`}</style>
    </div>
  );
}

// 操作类型
type ActionType = 'lock' | 'unlock' | 'delete' | 'resetPassword' | 'promote' | 'demote' | null;

interface CurrentUser {
  id: string;
  username: string;
  roles: string[];
}

export default function UsersListPage() {
  const t = useTranslations('users');
  const tc = useTranslations('common');
  const queryClient = useQueryClient();
  const { theme } = useTheme();
  const colors = themeColors[theme];
  
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [actionType, setActionType] = useState<ActionType>(null);
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [deleteReason, setDeleteReason] = useState('');

  useEffect(() => {
    setIsClient(true);
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        setCurrentUser(JSON.parse(storedUser));
      } catch (e) {
        console.error('Failed to parse user data');
      }
    }
  }, []);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['users', 1, search],
    queryFn: () => usersApi.findAll({ page: 1, limit: 100, search: search || undefined }),
    enabled: isClient && !!currentUser,
  });

  const users = data?.data ?? [];

  // 按角色分组用户
  const groupedUsers = users.reduce((acc, user) => {
    const role = user.roles[0] || 'viewer';
    if (!acc[role]) acc[role] = [];
    acc[role].push(user);
    return acc;
  }, {} as Record<string, User[]>);

  // 动态获取角色配置（主题响应）
  const roleConfig = getRoleConfig(colors);

  // 按职能等级排序（低等级在上）
  const sortedRoles = Object.keys(groupedUsers).sort((a, b) => {
    return (roleConfig[a]?.level ?? 99) - (roleConfig[b]?.level ?? 99);
  });

  // Mutations
  const lockMutation = useMutation({
    mutationFn: ({ id, code }: { id: string; code: string }) => usersApi.lock(id, code),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['users'] }); closeAction(); },
    onError: () => setSecurityError(tc('securityCode.invalid')),
  });

  const unlockMutation = useMutation({
    mutationFn: ({ id, code }: { id: string; code: string }) => usersApi.unlock(id, code),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['users'] }); closeAction(); },
    onError: () => setSecurityError(tc('securityCode.invalid')),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: ({ id, password, code }: { id: string; password: string; code: string }) =>
      usersApi.resetPassword(id, { newPassword: password, sec_code_l2: code }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['users'] }); closeAction(); },
    onError: () => setSecurityError(tc('securityCode.invalid')),
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, code, reason }: { id: string; code: string; reason: string }) => usersApi.delete(id, code, reason),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['users'] }); closeAction(); },
    onError: (err: any) => {
      const msg = err?.message || tc('securityCode.invalid');
      setSecurityError(msg);
    },
  });

  const promoteMutation = useMutation({
    mutationFn: ({ id, code }: { id: string; code: string }) =>
      usersApi.changeRole(id, { roles: ['admin'], sec_code_l2: code }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['users'] }); closeAction(); },
    onError: () => setSecurityError(tc('securityCode.invalid')),
  });

  const demoteMutation = useMutation({
    mutationFn: ({ id, code }: { id: string; code: string }) =>
      usersApi.changeRole(id, { roles: ['staff'], sec_code_l2: code }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['users'] }); closeAction(); },
    onError: () => setSecurityError(tc('securityCode.invalid')),
  });

  const openAction = (user: User, type: string) => {
    setSelectedUser(user);
    setActionType(type as ActionType);
    setSecurityError(null);
    setNewPassword('');
  };

  const closeAction = () => {
    setSelectedUser(null);
    setActionType(null);
    setSecurityError(null);
    setNewPassword('');
    setDeleteReason('');
  };

  const handleSecurityConfirm = (code: string) => {
    if (!selectedUser) return;
    switch (actionType) {
      case 'lock':
        lockMutation.mutate({ id: selectedUser.id, code });
        break;
      case 'unlock':
        unlockMutation.mutate({ id: selectedUser.id, code });
        break;
      case 'resetPassword':
        if (newPassword) {
          resetPasswordMutation.mutate({ id: selectedUser.id, password: newPassword, code });
        }
        break;
      case 'promote':
        promoteMutation.mutate({ id: selectedUser.id, code });
        break;
      case 'demote':
        demoteMutation.mutate({ id: selectedUser.id, code });
        break;
    }
  };

  const isActionLoading = lockMutation.isPending || unlockMutation.isPending || resetPasswordMutation.isPending || deleteMutation.isPending || promoteMutation.isPending || demoteMutation.isPending;

  const getActionInfo = () => {
    switch (actionType) {
      case 'lock': return { title: t('actions.lock'), description: t('messages.confirmLock') };
      case 'unlock': return { title: t('actions.unlock'), description: t('messages.confirmUnlock') };
      case 'delete': return { title: t('actions.delete'), description: t('messages.confirmDelete') };
      case 'promote': return { title: t('actions.promote'), description: t('messages.confirmPromote') };
      case 'demote': return { title: t('actions.demote'), description: t('messages.confirmDemote') };
      default: return { title: '', description: '' };
    }
  };

  return (
    <div style={{ backgroundColor: colors.bg }} className="min-h-screen">
      {/* Header */}
      <section className="pt-12 pb-10 px-6">
        <div className="max-w-[1200px] mx-auto flex items-end justify-between">
          <div>
            <h1 style={{ color: colors.text }} className="text-[32px] font-semibold tracking-tight mb-2">
              {t('title')}
            </h1>
            <p style={{ color: colors.textSecondary }} className="text-[17px]">
              {t('description')}
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            {/* 搜索 */}
            <div className="relative">
              <svg style={{ color: colors.textSecondary }} className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('list.searchPlaceholder')}
                style={{ backgroundColor: colors.bgTertiary, borderColor: colors.border, color: colors.text }}
                className="w-64 h-10 pl-10 pr-4 rounded-xl text-[14px] border focus:outline-none"
              />
            </div>
            
            {/* 刷新 */}
            <button
              onClick={() => refetch()}
              style={{ backgroundColor: colors.bgTertiary, color: colors.text }}
              className="h-10 px-4 rounded-xl text-[14px] font-medium flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
              {tc('refresh')}
            </button>
            
            {/* 新建用户 */}
            <Link
              href="/users/register"
              style={{ backgroundColor: colors.blue }}
              className="h-10 px-5 rounded-xl text-white text-[14px] font-medium flex items-center gap-2 hover:opacity-90 transition-opacity"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              {t('actions.create')}
            </Link>
          </div>
        </div>
      </section>

      {/* Loading */}
      {isClient && currentUser && isLoading && (
        <div className="flex items-center justify-center h-64">
          <div 
            className="w-8 h-8 border-2 rounded-full animate-spin" 
            style={{ borderColor: colors.border, borderTopColor: colors.blue }} 
          />
        </div>
      )}

      {/* 未登录提示 */}
      {isClient && !currentUser && (
        <div className="flex flex-col items-center justify-center h-64">
          <p style={{ color: colors.textSecondary }} className="text-[15px] mb-4">{t('list.loginRequired')}</p>
          <button
            onClick={() => {
              const loginBtn = document.querySelector('[data-login-trigger]') as HTMLElement;
              if (loginBtn) loginBtn.click();
            }}
            style={{ backgroundColor: colors.blue }}
            className="px-6 py-2 text-white text-[14px] font-medium rounded-lg hover:opacity-90"
          >
            {t('list.signIn')}
          </button>
        </div>
      )}

      {/* 分组卡片轮播 */}
      {isClient && currentUser && !isLoading && !error && (
        <section className="pb-16">
          {sortedRoles.map((roleKey) => (
            <GroupCarousel
              key={roleKey}
              roleKey={roleKey}
              roleLabel={t(`roleNames.${roleKey}`)}
              roleColor={roleConfig[roleKey]?.color || colors.gray}
              users={groupedUsers[roleKey]}
              colors={colors}
              theme={theme}
              t={t}
              tc={tc}
              currentUser={currentUser}
              onAction={openAction}
            />
          ))}
        </section>
      )}

      {/* Reset Password Dialog */}
      {actionType === 'resetPassword' && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeAction} />
          <div 
            style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
            className="relative w-full max-w-md rounded-2xl shadow-2xl p-6 border"
          >
            <h2 style={{ color: colors.text }} className="text-[17px] font-semibold mb-4">
              {t('actions.resetPassword')} - {selectedUser.displayName || selectedUser.username}
            </h2>
            
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={t('form.password.placeholder')}
              style={{ backgroundColor: colors.bgTertiary, borderColor: colors.border, color: colors.text }}
              className="w-full h-12 px-4 border rounded-xl text-[15px] focus:outline-none mb-4"
            />
            
            <input
              type="password"
              id="sec_code"
              placeholder={tc('securityCode.placeholder')}
              style={{ backgroundColor: colors.bgTertiary, borderColor: colors.border, color: colors.text }}
              className="w-full h-12 px-4 border rounded-xl text-[15px] focus:outline-none mb-4"
            />

            {securityError && (
              <p style={{ color: colors.red }} className="text-[13px] mb-4">{securityError}</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={closeAction}
                style={{ backgroundColor: colors.bgTertiary, color: colors.text }}
                className="flex-1 h-11 hover:opacity-80 text-[15px] font-medium rounded-xl transition-colors"
              >
                {tc('cancel')}
              </button>
              <button
                onClick={() => {
                  const code = (document.getElementById('sec_code') as HTMLInputElement)?.value;
                  if (code && newPassword) handleSecurityConfirm(code);
                }}
                disabled={isActionLoading || !newPassword}
                style={{ backgroundColor: colors.blue }}
                className="flex-1 h-11 hover:opacity-90 text-white text-[15px] font-medium rounded-xl disabled:opacity-50 transition-colors"
              >
                {tc('confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lock/Unlock/Promote/Demote Security Dialog (NOT delete) */}
      {(actionType === 'lock' || actionType === 'unlock' || actionType === 'promote' || actionType === 'demote') && selectedUser && (
        <SecurityCodeDialog
          isOpen={true}
          level="L2"
          title={getActionInfo().title}
          description={`${getActionInfo().description} (${selectedUser.displayName || selectedUser.username})`}
          onConfirm={handleSecurityConfirm}
          onCancel={closeAction}
          isLoading={isActionLoading}
          error={securityError || undefined}
        />
      )}

      {/* Delete User Dialog - with reason input */}
      {actionType === 'delete' && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeAction} />
          <div 
            style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
            className="relative w-full max-w-md rounded-2xl shadow-2xl p-6 border"
          >
            <div className="flex items-center gap-3 mb-4">
              <svg style={{ color: colors.red }} className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <h2 style={{ color: colors.text }} className="text-[17px] font-semibold">
                {t('actions.delete')} - {selectedUser.displayName || selectedUser.username}
              </h2>
            </div>

            <p style={{ color: colors.textSecondary }} className="text-[13px] mb-4">
              {t('messages.confirmDelete')}
            </p>

            {/* Delete Reason */}
            <div className="mb-4">
              <label style={{ color: colors.textSecondary }} className="block text-[12px] mb-1">
                {t('form.deleteReason.label')}
              </label>
              <textarea
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder={t('form.deleteReason.placeholder')}
                rows={2}
                style={{ backgroundColor: colors.bgTertiary, borderColor: colors.border, color: colors.text }}
                className="w-full px-4 py-3 border rounded-xl text-[15px] focus:outline-none resize-none"
              />
              <p style={{ color: colors.textTertiary }} className="text-[11px] mt-1">
                {t('form.deleteReason.hint')}
              </p>
            </div>
            
            {/* Security Code (L3) */}
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <span 
                  className="px-2 py-0.5 rounded text-[11px] font-medium"
                  style={{ backgroundColor: `${colors.red}33`, color: colors.red }}
                >
                  L3
                </span>
                <span style={{ color: colors.textSecondary }} className="text-[12px]">Database Code</span>
              </div>
              <input
                type="password"
                id="delete_sec_code"
                placeholder={tc('securityCode.placeholder')}
                style={{ backgroundColor: colors.bgTertiary, borderColor: colors.border, color: colors.text }}
                className="w-full h-12 px-4 border rounded-xl text-[15px] focus:outline-none"
              />
            </div>

            {securityError && (
              <p style={{ color: colors.red }} className="text-[13px] mb-4">{securityError}</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={closeAction}
                style={{ backgroundColor: colors.bgTertiary, color: colors.text }}
                className="flex-1 h-11 hover:opacity-80 text-[15px] font-medium rounded-xl transition-colors"
              >
                {tc('cancel')}
              </button>
              <button
                onClick={() => {
                  const code = (document.getElementById('delete_sec_code') as HTMLInputElement)?.value;
                  if (code && deleteReason.trim()) {
                    deleteMutation.mutate({ id: selectedUser.id, code, reason: deleteReason.trim() });
                  } else if (!deleteReason.trim()) {
                    setSecurityError(t('form.deleteReason.required'));
                  }
                }}
                disabled={isActionLoading || !deleteReason.trim()}
                style={{ backgroundColor: colors.red }}
                className="flex-1 h-11 hover:opacity-90 text-white text-[15px] font-medium rounded-xl disabled:opacity-50 transition-colors"
              >
                {tc('confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Animation Keyframes */}
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeInUp {
          animation: fadeInUp 0.5s ease-out forwards;
          opacity: 0;
        }
      `}</style>
    </div>
  );
}
