'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { logsApi, MaintenanceStats } from '@/lib/api/logs';
import { useModal } from '@/components/modal/GlobalModal';
import { getApiBaseUrlCached } from '@/lib/api-url';

// Apple 风格开关组件
function AppleSwitch({ 
  enabled, 
  onChange, 
  disabled = false,
  color,
}: { 
  enabled: boolean; 
  onChange: () => void; 
  disabled?: boolean;
  color?: string;
}) {
  const { theme } = useTheme();
  const c = themeColors[theme];
  const activeColor = color || c.green;
  
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      className="relative w-[51px] h-[31px] rounded-full transition-all duration-300 flex-shrink-0"
      style={{
        backgroundColor: enabled ? activeColor : c.switchTrack,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      <div
        className="absolute w-[27px] h-[27px] rounded-full transition-all duration-300"
        style={{
          top: '2px',
          left: enabled ? '22px' : '2px',
          backgroundColor: c.white,
          boxShadow: '0 3px 8px rgba(0, 0, 0, 0.15), 0 3px 1px rgba(0, 0, 0, 0.06)',
        }}
      />
    </button>
  );
}

// 卡片组件
function Card({
  title,
  icon,
  children,
  colors,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  colors: typeof themeColors.light;
}) {
  return (
    <div
      className="rounded-2xl p-6"
      style={{ backgroundColor: colors.bgSecondary, border: `1px solid ${colors.border}` }}
    >
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: colors.bgTertiary }}>
          {icon}
        </div>
        <h3 style={{ color: colors.text }} className="text-[17px] font-semibold">
          {title}
        </h3>
      </div>
      {children}
    </div>
  );
}

export default function MaintenancePage() {
  const t = useTranslations('logs');
  const tc = useTranslations('common');
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const { showSuccess, showError, showPassword } = useModal();

  const [stats, setStats] = useState<MaintenanceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  
  // 模式状态
  const [devModeEnabled, setDevModeEnabled] = useState(false);
  const [godModeEnabled, setGodModeEnabled] = useState(false);
  const [godModeExpiry, setGodModeExpiry] = useState<string | null>(null);

  // 加载数据
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsData, modeData] = await Promise.all([
          logsApi.getMaintenanceStats(),
          logsApi.getGodModeStatus(),
        ]);
        setStats(statsData);
        setDevModeEnabled(statsData.devMode || false);
        setGodModeEnabled(modeData.godMode);
        if (modeData.expiresAt && typeof modeData.expiresAt === 'string') {
          setGodModeExpiry(new Date(modeData.expiresAt).toLocaleTimeString());
        }
      } catch (error) {
        const err = error as Error;
        console.error('Failed to load maintenance data:', err.message);
        if (err.message === 'FORBIDDEN') {
          setAccessDenied(true);
        }
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // 打开开发模式切换 Modal
  const openDevModeModal = () => {
    showPassword({
      title: t('maintenance.devMode.title'),
      message: t('maintenance.devMode.enterL4'),
      requiredCodes: ['l4'],
      onPasswordSubmit: async (passwords) => {
        try {
          const res = await fetch(`${getApiBaseUrlCached()}/logs/maintenance/execute`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
            },
            body: JSON.stringify({ action: 'TOGGLE_DEV_MODE', securityCode: passwords.l4 }),
          });
          const data = await res.json();
          
          if (data.success) {
            setDevModeEnabled(!devModeEnabled);
            showSuccess({
              title: tc('success'),
              message: devModeEnabled ? t('maintenance.devMode.disabled') : t('maintenance.devMode.enabled'),
              showCancel: false,
              confirmText: tc('ok'),
            });
          } else {
            showError({
              title: tc('error'),
              message: data.message || t('maintenance.devMode.toggleFailed'),
              showCancel: false,
              confirmText: tc('ok'),
            });
          }
        } catch {
          showError({
            title: tc('error'),
            message: t('maintenance.devMode.toggleFailed'),
            showCancel: false,
            confirmText: tc('ok'),
          });
        }
      },
    });
  };

  // 打开 God Mode Modal 或直接关闭
  const openGodModeModal = () => {
    if (godModeEnabled) {
      // 关闭不需要密码
      logsApi.lockGodMode()
        .then(() => {
          setGodModeEnabled(false);
          setGodModeExpiry(null);
          showSuccess({
            title: tc('success'),
            message: t('maintenance.godMode.disabled'),
            showCancel: false,
            confirmText: tc('ok'),
          });
        })
        .catch(() => {
          showError({
            title: tc('error'),
            message: t('maintenance.godMode.lockFailed'),
            showCancel: false,
            confirmText: tc('ok'),
          });
        });
    } else {
      showPassword({
        title: t('maintenance.godMode.title'),
        message: t('maintenance.godMode.enterL3'),
        requiredCodes: ['l3'],
        onPasswordSubmit: async (passwords) => {
          try {
            const result = await logsApi.unlockGodMode(passwords.l3);
            setGodModeEnabled(true);
            if (result.expiresAt) {
              setGodModeExpiry(new Date(result.expiresAt).toLocaleTimeString());
            }
            showSuccess({
              title: tc('success'),
              message: t('maintenance.godMode.enabled'),
              showCancel: false,
              confirmText: tc('ok'),
            });
          } catch {
            showError({
              title: tc('error'),
              message: t('maintenance.godMode.unlockFailed'),
              showCancel: false,
              confirmText: tc('ok'),
            });
          }
        },
      });
    }
  };

  // 打开清理日志 Modal
  const openClearLogsModal = () => {
    showPassword({
      title: t('maintenance.actions.clearDevLogs'),
      message: t('maintenance.actions.enterL4'),
      requiredCodes: ['l4'],
      onPasswordSubmit: async (passwords) => {
        try {
          await logsApi.clearDevLogs(passwords.l4);
          const newStats = await logsApi.getMaintenanceStats();
          setStats(newStats);
          showSuccess({
            title: tc('success'),
            message: t('maintenance.actions.clearSuccess'),
            showCancel: false,
            confirmText: tc('ok'),
          });
        } catch {
          showError({
            title: tc('error'),
            message: t('maintenance.actions.l4Failed'),
            showCancel: false,
            confirmText: tc('ok'),
          });
        }
      },
    });
  };

  // Loading
  if (loading) {
    return (
      <div style={{ backgroundColor: colors.bg }} className="min-h-screen flex items-center justify-center">
        <div
          className="w-8 h-8 border-2 rounded-full animate-spin"
          style={{
            borderLeftColor: colors.border,
            borderRightColor: colors.border,
            borderBottomColor: colors.border,
            borderTopColor: colors.blue,
          }}
        />
      </div>
    );
  }

  // 权限不足
  if (accessDenied) {
    return (
      <div style={{ backgroundColor: colors.bg }} className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full flex items-center justify-center" style={{ backgroundColor: colors.red + '20' }}>
            <svg className="w-8 h-8" style={{ color: colors.red }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <h2 style={{ color: colors.text }} className="text-[24px] font-semibold mb-2">
            {tc('noPermission')}
          </h2>
          <p style={{ color: colors.textSecondary }} className="text-[15px]">
            {t('maintenance.accessDenied')}
          </p>
        </div>
      </div>
    );
  }

  // 图标
  const icons = {
    settings: (
      <svg className="w-5 h-5" fill="none" stroke={colors.textSecondary} viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      </svg>
    ),
    wrench: (
      <svg className="w-5 h-5" fill="none" stroke={colors.textSecondary} viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
      </svg>
    ),
    devLogs: (
      <svg className="w-5 h-5" fill="none" stroke={colors.textSecondary} viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
      </svg>
    ),
    prodLogs: (
      <svg className="w-5 h-5" fill="none" stroke={colors.textSecondary} viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
      </svg>
    ),
    clock: (
      <svg className="w-5 h-5" fill="none" stroke={colors.textSecondary} viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  };

  return (
    <div style={{ backgroundColor: colors.bg }} className="min-h-screen">
      {/* Header */}
      <section className="pt-12 pb-8 px-6">
        <div className="max-w-[980px] mx-auto">
          <h1 style={{ color: colors.text }} className="text-[32px] font-semibold tracking-tight mb-2">
            {t('maintenance.title')}
          </h1>
          <p style={{ color: colors.textSecondary }} className="text-[17px]">
            {t('maintenance.description')}
          </p>
        </div>
      </section>

      {/* 主内容区 - 倒品字布局 */}
      <section className="px-6 pb-16">
        <div className="max-w-[980px] mx-auto">
          {/* 上半部分: 左右两列 */}
          <div className="grid grid-cols-2 gap-6 mb-6">
            {/* 左列: 系统模式 + 维护操作 */}
            <div className="space-y-6">
              {/* 系统模式 */}
              <Card title={t('maintenance.groups.systemMode')} icon={icons.settings} colors={colors}>
                <div className="space-y-4">
                  {/* 开发模式/部署模式切换 */}
                  <div className="flex items-center justify-between py-3 border-b" style={{ borderColor: colors.border }}>
                    <div className="flex-1 pr-4">
                      <p style={{ color: colors.text }} className="text-[15px] font-medium">
                        {t('maintenance.devMode.title')}
                      </p>
                      <p style={{ color: colors.textSecondary }} className="text-[13px] mt-0.5">
                        {devModeEnabled ? t('maintenance.devMode.currentDev') : t('maintenance.devMode.currentProd')}
                      </p>
                    </div>
                    {/* iOS 风格开关 - 开发模式 */}
                    <div 
                      onClick={openDevModeModal}
                      style={{
                        width: '51px',
                        height: '31px',
                        borderRadius: '15.5px',
                        backgroundColor: devModeEnabled ? colors.orange : colors.switchTrack,
                        cursor: 'pointer',
                        position: 'relative',
                        flexShrink: 0,
                      }}
                    >
                      <div style={{
                        width: '27px',
                        height: '27px',
                        borderRadius: '50%',
                        backgroundColor: colors.white,
                        position: 'absolute',
                        top: '2px',
                        left: devModeEnabled ? '22px' : '2px',
                        boxShadow: '0 3px 8px rgba(0, 0, 0, 0.15)',
                        transition: 'left 0.3s ease',
                      }} />
                    </div>
                  </div>
                  
                  {/* 敏感信息查看 (God Mode) */}
                  <div className="flex items-center justify-between py-3">
                    <div className="flex-1 pr-4">
                      <p style={{ color: colors.text }} className="text-[15px] font-medium">
                        {t('maintenance.godMode.title')}
                      </p>
                      <p style={{ color: colors.textSecondary }} className="text-[13px] mt-0.5">
                        {godModeEnabled 
                          ? `${t('maintenance.godMode.activeUntil')} ${godModeExpiry || ''}` 
                          : t('maintenance.godMode.inactive')}
                      </p>
                    </div>
                    {/* iOS 风格开关 - 敏感信息 */}
                    <div 
                      onClick={openGodModeModal}
                      style={{
                        width: '51px',
                        height: '31px',
                        borderRadius: '15.5px',
                        backgroundColor: godModeEnabled ? colors.red : colors.switchTrack,
                        cursor: 'pointer',
                        position: 'relative',
                        flexShrink: 0,
                      }}
                    >
                      <div style={{
                        width: '27px',
                        height: '27px',
                        borderRadius: '50%',
                        backgroundColor: colors.white,
                        position: 'absolute',
                        top: '2px',
                        left: godModeEnabled ? '22px' : '2px',
                        boxShadow: '0 3px 8px rgba(0, 0, 0, 0.15)',
                        transition: 'left 0.3s ease',
                      }} />
                    </div>
                  </div>
                </div>
              </Card>

              {/* 维护操作 */}
              <Card title={t('maintenance.groups.operations')} icon={icons.wrench} colors={colors}>
                <div className="space-y-3">
                  {/* 清理开发日志 */}
                  <button
                    onClick={openClearLogsModal}
                    disabled={!stats?.summary?.canClearDevLogs}
                    className="w-full flex items-center justify-between p-4 rounded-xl transition-all hover:opacity-80 disabled:opacity-50"
                    style={{ backgroundColor: colors.bgTertiary }}
                  >
                    <div className="flex items-center gap-3">
                      <svg className="w-5 h-5" fill="none" stroke="#ff3b30" viewBox="0 0 24 24" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                      <span style={{ color: colors.text }} className="text-[15px] font-medium">
                        {t('maintenance.actions.clearDevLogs')}
                      </span>
                    </div>
                    <span style={{ color: colors.textSecondary }} className="text-[13px]">
                      {t('maintenance.actions.requiresL4')}
                    </span>
                  </button>
                </div>
              </Card>
            </div>

            {/* 右列: 开发日志 + 生产日志 */}
            <div className="space-y-6">
              {/* 开发日志统计 */}
              <Card title={t('maintenance.groups.devLogs')} icon={icons.devLogs} colors={colors}>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-4 rounded-xl" style={{ backgroundColor: colors.bgTertiary }}>
                    <p style={{ color: colors.textSecondary }} className="text-[12px] mb-1">{t('maintenance.stats.errors')}</p>
                    <p style={{ color: colors.red }} className="text-[24px] font-semibold">{stats?.devLogs?.error ?? 0}</p>
                  </div>
                  <div className="p-4 rounded-xl" style={{ backgroundColor: colors.bgTertiary }}>
                    <p style={{ color: colors.textSecondary }} className="text-[12px] mb-1">{t('maintenance.stats.audits')}</p>
                    <p style={{ color: colors.orange }} className="text-[24px] font-semibold">{stats?.devLogs?.audit ?? 0}</p>
                  </div>
                  <div className="p-4 rounded-xl" style={{ backgroundColor: colors.bgTertiary }}>
                    <p style={{ color: colors.textSecondary }} className="text-[12px] mb-1">{t('maintenance.stats.business')}</p>
                    <p style={{ color: colors.green }} className="text-[24px] font-semibold">{stats?.devLogs?.business ?? 0}</p>
                  </div>
                  <div className="p-4 rounded-xl" style={{ backgroundColor: colors.bgTertiary }}>
                    <p style={{ color: colors.textSecondary }} className="text-[12px] mb-1">{t('maintenance.stats.access')}</p>
                    <p style={{ color: colors.blue }} className="text-[24px] font-semibold">{stats?.devLogs?.access ?? 0}</p>
                  </div>
                </div>
              </Card>

              {/* 生产日志统计 */}
              <Card title={t('maintenance.groups.prodLogs')} icon={icons.prodLogs} colors={colors}>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-4 rounded-xl" style={{ backgroundColor: colors.bgTertiary }}>
                    <p style={{ color: colors.textSecondary }} className="text-[12px] mb-1">{t('maintenance.stats.errors')}</p>
                    <p style={{ color: colors.red }} className="text-[24px] font-semibold">{stats?.prodLogs?.error ?? 0}</p>
                  </div>
                  <div className="p-4 rounded-xl" style={{ backgroundColor: colors.bgTertiary }}>
                    <p style={{ color: colors.textSecondary }} className="text-[12px] mb-1">{t('maintenance.stats.audits')}</p>
                    <p style={{ color: colors.orange }} className="text-[24px] font-semibold">{stats?.prodLogs?.audit ?? 0}</p>
                  </div>
                  <div className="p-4 rounded-xl" style={{ backgroundColor: colors.bgTertiary }}>
                    <p style={{ color: colors.textSecondary }} className="text-[12px] mb-1">{t('maintenance.stats.business')}</p>
                    <p style={{ color: colors.green }} className="text-[24px] font-semibold">{stats?.prodLogs?.business ?? 0}</p>
                  </div>
                  <div className="p-4 rounded-xl" style={{ backgroundColor: colors.bgTertiary }}>
                    <p style={{ color: colors.textSecondary }} className="text-[12px] mb-1">{t('maintenance.stats.access')}</p>
                    <p style={{ color: colors.blue }} className="text-[24px] font-semibold">{stats?.prodLogs?.access ?? 0}</p>
                  </div>
                </div>
              </Card>
            </div>
          </div>

          {/* 下半部分: 保留策略 (占两列宽度) */}
          <Card title={t('maintenance.policy.title')} icon={icons.clock} colors={colors}>
            <div className="grid grid-cols-4 gap-4">
              <div className="p-4 rounded-xl text-center" style={{ backgroundColor: colors.bgTertiary }}>
                <p style={{ color: colors.textSecondary }} className="text-[13px] mb-2">{t('maintenance.policy.errorLogs')}</p>
                <p style={{ color: colors.text }} className="text-[20px] font-semibold">90 {tc('days')}</p>
              </div>
              <div className="p-4 rounded-xl text-center" style={{ backgroundColor: colors.bgTertiary }}>
                <p style={{ color: colors.textSecondary }} className="text-[13px] mb-2">{t('maintenance.policy.auditLogs')}</p>
                <p style={{ color: colors.text }} className="text-[20px] font-semibold">365 {tc('days')}</p>
              </div>
              <div className="p-4 rounded-xl text-center" style={{ backgroundColor: colors.bgTertiary }}>
                <p style={{ color: colors.textSecondary }} className="text-[13px] mb-2">{t('maintenance.policy.businessLogs')}</p>
                <p style={{ color: colors.text }} className="text-[20px] font-semibold">180 {tc('days')}</p>
              </div>
              <div className="p-4 rounded-xl text-center" style={{ backgroundColor: colors.bgTertiary }}>
                <p style={{ color: colors.textSecondary }} className="text-[13px] mb-2">{t('maintenance.policy.accessLogs')}</p>
                <p style={{ color: colors.text }} className="text-[20px] font-semibold">30 {tc('days')}</p>
              </div>
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}
