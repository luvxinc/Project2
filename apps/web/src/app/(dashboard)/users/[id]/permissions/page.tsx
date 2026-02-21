'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { usersApi } from '@/lib/api';
import { SecurityCodeDialog } from '@/components/ui/security-code-dialog';
import { useSecurityAction } from '@/hooks/useSecurityAction';
import { useTheme, themeColors } from '@/contexts/ThemeContext';

/**
 * 权限树结构 (从 modules.json 提取)
 * 关键安全逻辑: 扁平化二级结构 - 模块直接包含子功能
 */
const permissionTree = [
  {
    key: 'module.sales',
    i18nKey: 'sales',
    children: [
      { key: 'module.sales.transactions', nameKey: 'transactions' },
      { key: 'module.sales.transactions.upload', nameKey: 'transactionsUpload' },
      { key: 'module.sales.reports', nameKey: 'reports' },
      { key: 'module.sales.reports.generate', nameKey: 'reportsGenerate' },
      { key: 'module.sales.reports.center', nameKey: 'reportsCenter' },
      { key: 'module.sales.visuals', nameKey: 'visuals' },
      { key: 'module.sales.visuals.dashboard', nameKey: 'visualsDashboard' },
    ],
  },
  {
    key: 'module.purchase',
    i18nKey: 'purchase',
    children: [
      { key: 'module.purchase.supplier', nameKey: 'supplier' },
      { key: 'module.purchase.supplier.add', nameKey: 'supplierAdd' },
      { key: 'module.purchase.supplier.strategy', nameKey: 'supplierStrategy' },
      { key: 'module.purchase.po', nameKey: 'po' },
      { key: 'module.purchase.po.add', nameKey: 'poAdd' },
      { key: 'module.purchase.po.mgmt', nameKey: 'poMgmt' },
      { key: 'module.purchase.send', nameKey: 'send' },
      { key: 'module.purchase.send.add', nameKey: 'sendAdd' },
      { key: 'module.purchase.send.mgmt', nameKey: 'sendMgmt' },
      { key: 'module.purchase.receive', nameKey: 'receive' },
      { key: 'module.purchase.receive.mgmt', nameKey: 'receiveMgmt' },
      { key: 'module.purchase.abnormal', nameKey: 'abnormal' },
      { key: 'module.purchase.abnormal.manage', nameKey: 'abnormalManage' },
    ],
  },
  {
    key: 'module.inventory',
    i18nKey: 'inventory',
    children: [
      { key: 'module.inventory.stocktake', nameKey: 'stocktake' },
      { key: 'module.inventory.stocktake.upload', nameKey: 'stocktakeUpload' },
      { key: 'module.inventory.stocktake.modify', nameKey: 'stocktakeModify' },
      { key: 'module.inventory.dynamic', nameKey: 'dynamic' },
      { key: 'module.inventory.dynamic.view', nameKey: 'dynamicView' },
      { key: 'module.inventory.shelf', nameKey: 'shelf' },
      { key: 'module.inventory.shelf.manage', nameKey: 'shelfManage' },
    ],
  },
  {
    key: 'module.finance',
    i18nKey: 'finance',
    children: [
      { key: 'module.finance.flow', nameKey: 'flow' },
      { key: 'module.finance.flow.view', nameKey: 'flowView' },
      { key: 'module.finance.logistic', nameKey: 'logistic' },
      { key: 'module.finance.logistic.manage', nameKey: 'logisticManage' },
      { key: 'module.finance.prepay', nameKey: 'prepay' },
      { key: 'module.finance.prepay.manage', nameKey: 'prepayManage' },
      { key: 'module.finance.deposit', nameKey: 'deposit' },
      { key: 'module.finance.deposit.manage', nameKey: 'depositManage' },
      { key: 'module.finance.po', nameKey: 'finPo' },
      { key: 'module.finance.po.manage', nameKey: 'finPoManage' },
    ],
  },
  {
    key: 'module.products',
    i18nKey: 'products',
    children: [
      { key: 'module.products.catalog', nameKey: 'catalog' },
      { key: 'module.products.catalog.cogs', nameKey: 'catalogCogs' },
      { key: 'module.products.catalog.create', nameKey: 'catalogCreate' },
      { key: 'module.products.barcode', nameKey: 'barcode' },
      { key: 'module.products.barcode.generate', nameKey: 'barcodeGenerate' },
    ],
  },
  {
    key: 'module.db_admin',
    i18nKey: 'db_admin',
    children: [
      { key: 'module.db_admin.backup', nameKey: 'backup' },
      { key: 'module.db_admin.backup.create', nameKey: 'backupCreate' },
      { key: 'module.db_admin.backup.restore', nameKey: 'backupRestore' },
      { key: 'module.db_admin.backup.manage', nameKey: 'backupManage' },
      { key: 'module.db_admin.cleanup', nameKey: 'cleanup' },
      { key: 'module.db_admin.cleanup.delete', nameKey: 'cleanupDelete' },
    ],
  },
  {
    key: 'module.user_admin',
    i18nKey: 'user_admin',
    children: [
      { key: 'module.user_admin.users', nameKey: 'users' },
      { key: 'module.user_admin.register', nameKey: 'register' },
      { key: 'module.user_admin.password_policy', nameKey: 'passwordPolicy' },
      { key: 'module.user_admin.role_switches', nameKey: 'roleSwitches' },
    ],
  },
  {
    key: 'module.audit',
    i18nKey: 'audit',
    children: [
      { key: 'module.audit.logs', nameKey: 'logs' },
    ],
  },
  {
    key: 'module.vma',
    i18nKey: 'vma',
    children: [
      { key: 'module.vma.truvalve', nameKey: 'vmaTruvalve' },
      { key: 'module.vma.truvalve.manage', nameKey: 'vmaTruvalveManage' },
      { key: 'module.vma.pvalve', nameKey: 'vmaPvalve' },
      { key: 'module.vma.pvalve.inventory', nameKey: 'vmaPvalveInventory' },
      { key: 'module.vma.pvalve.clinical_case', nameKey: 'vmaPvalveClinicalCase' },
      { key: 'module.vma.pvalve.delivery_system', nameKey: 'vmaPvalveDeliverySystem' },
      { key: 'module.vma.pvalve.overview', nameKey: 'vmaPvalveOverview' },
      { key: 'module.vma.pvalve.demo_inventory', nameKey: 'vmaPvalveDemoInventory' },
      { key: 'module.vma.pvalve.fridge_shelf', nameKey: 'vmaPvalveFridgeShelf' },
      { key: 'module.vma.pvalve.product_mgmt', nameKey: 'vmaPvalveProductMgmt' },
      { key: 'module.vma.pvalve.site_mgmt', nameKey: 'vmaPvalveSiteMgmt' },
      { key: 'module.vma.employees.manage', nameKey: 'vmaEmployees' },
      { key: 'module.vma.departments.manage', nameKey: 'vmaDepartments' },
      { key: 'module.vma.training_sop.manage', nameKey: 'vmaTrainingSop' },
      { key: 'module.vma.training.manage', nameKey: 'vmaTraining' },
      { key: 'module.vma.training_records.manage', nameKey: 'vmaTrainingRecords' },
    ],
  },
];

/**
 * Apple Switch (权限专用)
 */
function PermSwitch({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  const { theme } = useTheme();
  const activeColor = '#34c759';
  const inactiveColor = theme === 'dark' ? '#39393d' : '#e9e9eb';
  const disabledColor = theme === 'dark' ? '#1c1c1e' : '#f0f0f0';

  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); if (!disabled) onChange(); }}
      style={{
        width: 40,
        height: 24,
        padding: 2,
        borderRadius: 12,
        backgroundColor: disabled ? disabledColor : (checked ? activeColor : inactiveColor),
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background-color 0.2s ease',
        position: 'relative',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <span
        style={{
          display: 'block',
          width: 20,
          height: 20,
          borderRadius: '50%',
          backgroundColor: '#ffffff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          transition: 'transform 0.2s ease',
          transform: checked ? 'translateX(16px)' : 'translateX(0)',
        }}
      />
    </button>
  );
}

export default function UserPermissionsPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const userId = resolvedParams.id;

  const t = useTranslations('users');
  const tc = useTranslations('common');
  const router = useRouter();
  const queryClient = useQueryClient();
  const { theme } = useTheme();
  const colors = themeColors[theme];

  // State
  const [selectedPerms, setSelectedPerms] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // 从 localStorage 动态获取当前登录用户的角色
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('user');
      if (!stored) return;
      const u = JSON.parse(stored);
      const roles: string[] = u.roles || [];
      setIsSuperuser(roles.includes('superuser'));
      setIsAdmin(roles.includes('admin'));
    } catch { /* ignore */ }

    const handleUpdate = () => {
      try {
        const stored = localStorage.getItem('user');
        if (!stored) return;
        const u = JSON.parse(stored);
        const roles: string[] = u.roles || [];
        setIsSuperuser(roles.includes('superuser'));
        setIsAdmin(roles.includes('admin'));
      } catch { /* ignore */ }
    };
    window.addEventListener('mgmt:user-updated', handleUpdate);
    return () => window.removeEventListener('mgmt:user-updated', handleUpdate);
  }, []);

  // Admin 和 Superuser 可以配置所有模块的权限
  // 收集权限树中所有权限 key，admin/superuser 拥有完整配置权
  const [actorPerms, setActorPerms] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isSuperuser || isAdmin) {
      const allPerms = new Set<string>();
      permissionTree.forEach(mod => {
        allPerms.add(mod.key);
        mod.children.forEach(child => allPerms.add(child.key));
      });
      setActorPerms(allPerms);
    } else {
      setActorPerms(new Set<string>());
    }
  }, [isSuperuser, isAdmin]);

  // Query
  const { data: user, isLoading } = useQuery({
    queryKey: ['user', userId],
    queryFn: () => usersApi.findOne(userId),
  });

  // Initialize permissions when user data loads
  useEffect(() => {
    if (user?.permissions) {
      // permissions 可能是 Record<string, string[]> 或扁平化的 string[]
      const permsData = user.permissions;
      if (Array.isArray(permsData)) {
        setSelectedPerms(new Set(permsData as string[]));
      } else {
        // 从 Record<string, string[]> 提取所有权限键
        const flatPerms = Object.keys(permsData).filter(k => permsData[k]);
        setSelectedPerms(new Set(flatPerms));
      }
    }
  }, [user]);

  // 计算选中权限数
  const permCount = selectedPerms.size;

  // 检查操作者是否有权限配置某个权限节点
  const canConfigurePerm = (permKey: string): boolean => {
    return isSuperuser || actorPerms.has(permKey);
  };

  // 切换单个权限
  const togglePerm = (permKey: string) => {
    if (!canConfigurePerm(permKey)) return;

    setSelectedPerms(prev => {
      const next = new Set(prev);
      if (next.has(permKey)) {
        next.delete(permKey);
      } else {
        next.add(permKey);
      }
      return next;
    });
    setHasChanges(true);
  };

  // 切换模块下所有权限
  const toggleModuleAll = (moduleKey: string, children: typeof permissionTree[0]['children']) => {
    // 只能操作有权限配置的子项
    const configurableChildren = children.filter(c => canConfigurePerm(c.key));
    if (configurableChildren.length === 0) return;

    const allChecked = configurableChildren.every(c => selectedPerms.has(c.key));

    setSelectedPerms(prev => {
      const next = new Set(prev);
      if (allChecked) {
        configurableChildren.forEach(c => next.delete(c.key));
        next.delete(moduleKey);
      } else {
        configurableChildren.forEach(c => next.add(c.key));
        next.add(moduleKey);
      }
      return next;
    });
    setHasChanges(true);
  };

  // 检查模块的选中状态
  const getModuleCheckedState = (children: typeof permissionTree[0]['children']) => {
    const configurableChildren = children.filter(c => canConfigurePerm(c.key));
    if (configurableChildren.length === 0) return { allChecked: false, someChecked: false };

    const allChecked = configurableChildren.every(c => selectedPerms.has(c.key));
    const someChecked = configurableChildren.some(c => selectedPerms.has(c.key));
    return { allChecked, someChecked };
  };

  // Mutation
  const updateMutation = useMutation({
    mutationFn: (data: { permissions: Record<string, boolean>; sec_code_l2: string }) =>
      usersApi.updatePermissions(userId, { permissions: data.permissions, sec_code_l2: data.sec_code_l2 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', userId] });
      permsSecurity.onCancel();
      setHasChanges(false);
    },
    onError: (err: Error) => {
      setError(err.message || tc('error'));
    },
  });

  const permsSecurity = useSecurityAction({
    actionKey: 'btn_user_permissions',
    level: 'L2',
    onExecute: (code) => {
      const permsRecord: Record<string, boolean> = {};
      selectedPerms.forEach(p => { permsRecord[p] = true; });
      updateMutation.mutate({
        permissions: permsRecord,
        sec_code_l2: code,
      });
    },
  });

  const handleSave = () => {
    setError(null);
    permsSecurity.trigger();
  };

  if (isLoading) {
    return (
      <div style={{ backgroundColor: colors.bg }} className="min-h-screen flex items-center justify-center">
        <div style={{ borderRightColor: colors.text, borderBottomColor: colors.text, borderLeftColor: colors.text, borderTopColor: 'transparent' }} className="w-8 h-8 border-2 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ backgroundColor: colors.bg }} className="min-h-screen flex items-center justify-center">
        <p style={{ color: colors.textSecondary }} className="text-[19px]">{t('errors.userNotFound')}</p>
      </div>
    );
  }

  // 用户角色徽章
  const getRoleBadge = () => {
    const primaryRole = user.roles?.[0] || 'staff';
    if (primaryRole === 'superuser') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
          style={{ background: 'linear-gradient(135deg, rgba(220,53,69,0.2), rgba(255,193,7,0.2))', color: '#ffc107', border: '1px solid rgba(255,193,7,0.3)' }}>
          <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 24 24"><path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5z" /></svg>
          {t(`roleNames.${primaryRole}`)}
        </span>
      );
    }
    if (primaryRole === 'admin') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
          style={{ backgroundColor: 'rgba(13,202,240,0.15)', color: '#0dcaf0', border: '1px solid rgba(13,202,240,0.25)' }}>
          <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" /></svg>
          {t(`roleNames.${primaryRole}`)}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
        style={{ backgroundColor: 'rgba(108,117,125,0.15)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(108,117,125,0.25)' }}>
        <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></svg>
        {t(`roleNames.${primaryRole}`)}
      </span>
    );
  };

  return (
    <div style={{ backgroundColor: colors.bg }} className="min-h-screen">
      {/* Header */}
      <section className="pt-12 pb-6 px-6">
        <div className="max-w-[1100px] mx-auto text-center">
          <h1 style={{ color: colors.text }} className="text-[32px] font-semibold tracking-tight mb-2">
            {t('permissions.title')}
          </h1>
          <p style={{ color: colors.textSecondary }} className="text-[17px] leading-relaxed">
            {t('permissions.description')}
          </p>
        </div>
      </section>

      {/* Two Column Layout */}
      <section className="max-w-[1100px] mx-auto px-6 pb-16">
        <div className="flex gap-8">

          {/* LEFT: Permission Cards */}
          <div className="flex-1 min-w-0">
            {/* User Info Bar */}
            <div
              style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
              className="rounded-xl border p-4 mb-6 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-[16px] font-bold"
                  style={{
                    background: 'linear-gradient(135deg, rgba(13,202,240,0.2), rgba(13,110,253,0.2))',
                    border: '1px solid rgba(13,202,240,0.3)',
                    color: '#0dcaf0'
                  }}
                >
                  {(user.displayName || user.username || '?').charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span style={{ color: colors.text }} className="text-[15px] font-semibold">
                      {user.displayName || user.username}
                    </span>
                    {getRoleBadge()}
                  </div>
                  <div style={{ color: colors.textSecondary }} className="text-[12px] mt-0.5">
                    {t('permissions.selectedCount', { count: permCount })}
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={!hasChanges || updateMutation.isPending}
                  style={{ backgroundColor: colors.blue }}
                  className="h-9 px-4 text-white text-[13px] font-medium rounded-full hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
                >
                  {updateMutation.isPending && (
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  )}
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  {tc('save')}
                </button>
                <button
                  onClick={() => router.back()}
                  style={{ borderColor: colors.border, color: colors.textSecondary }}
                  className="h-9 px-4 text-[13px] font-medium rounded-full border hover:opacity-80"
                >
                  {tc('cancel')}
                </button>
              </div>
            </div>

            {/* Permission Cards */}
            <div className="space-y-3">
              {permissionTree.map(mod => {
                const { allChecked, someChecked } = getModuleCheckedState(mod.children);
                const canConfigureModule = canConfigurePerm(mod.key);

                return (
                  <div
                    key={mod.key}
                    style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
                    className="rounded-xl border overflow-hidden"
                  >
                    {/* Module Row */}
                    <div className="flex">
                      {/* Left: Module Info */}
                      <div
                        className="w-40 flex-shrink-0 p-4 flex flex-col justify-between"
                        style={{
                          background: `linear-gradient(135deg, ${colors.blue}15, ${colors.blue}08)`,
                          borderRight: `2px solid ${colors.blue}40`
                        }}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <svg style={{ color: colors.blue }} className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-2.25-1.313M21 7.5v2.25m0-2.25l-2.25 1.313M3 7.5l2.25-1.313M3 7.5l2.25 1.313M3 7.5v2.25m9 3l2.25-1.313M12 12.75l-2.25-1.313M12 12.75V15m0 6.75l2.25-1.313M12 21.75V19.5m0 2.25l-2.25-1.313m0-16.875L12 2.25l2.25 1.313M21 14.25v2.25l-2.25 1.313m-13.5 0L3 16.5v-2.25" />
                          </svg>
                          <span style={{ color: colors.text }} className="text-[13px] font-semibold">
                            {t(`permissions.modules.${mod.i18nKey}`)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {canConfigureModule ? (
                            <>
                              <PermSwitch
                                checked={allChecked}
                                onChange={() => toggleModuleAll(mod.key, mod.children)}
                              />
                              <span style={{ color: colors.textTertiary }} className="text-[11px]">
                                {tc('selectAll')}
                              </span>
                            </>
                          ) : (
                            <span style={{ color: colors.textTertiary }} className="text-[11px] flex items-center gap-1">
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
                              </svg>
                              {tc('noPermission')}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Right: Features Grid */}
                      <div className="flex-1 p-3">
                        <div className="flex flex-wrap gap-2">
                          {mod.children.map(child => {
                            const isChecked = selectedPerms.has(child.key);
                            const canConfig = canConfigurePerm(child.key);

                            return (
                              <div
                                key={child.key}
                                onClick={() => canConfig && togglePerm(child.key)}
                                className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all"
                                style={{
                                  backgroundColor: isChecked
                                    ? `${colors.blue}15`
                                    : (theme === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'),
                                  border: `1px solid ${isChecked ? `${colors.blue}40` : colors.border}`,
                                  opacity: canConfig ? 1 : 0.4,
                                  cursor: canConfig ? 'pointer' : 'not-allowed',
                                  minWidth: 'fit-content',
                                }}
                              >
                                <PermSwitch
                                  checked={isChecked}
                                  onChange={() => togglePerm(child.key)}
                                  disabled={!canConfig}
                                />
                                <span
                                  style={{ color: isChecked ? colors.text : colors.textSecondary }}
                                  className="text-[12px] whitespace-nowrap"
                                >
                                  {t(`permissions.features.${child.nameKey}`)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* RIGHT: Notice Sidebar */}
          <div className="w-[280px] flex-shrink-0">
            <div
              style={{
                backgroundColor: theme === 'dark' ? 'rgba(13, 202, 240, 0.08)' : 'rgba(13, 202, 240, 0.06)',
                borderColor: theme === 'dark' ? 'rgba(13, 202, 240, 0.2)' : 'rgba(13, 202, 240, 0.15)'
              }}
              className="rounded-xl border p-5 sticky top-6"
            >
              <div className="flex items-center gap-2 mb-4">
                <svg style={{ color: '#0dcaf0' }} className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                </svg>
                <span style={{ color: '#0dcaf0' }} className="text-[14px] font-semibold">
                  {t('permissions.notice.title')}
                </span>
              </div>

              {/* Operation Guide */}
              <div style={{ borderColor: colors.border }} className="mb-4 pb-4 border-b">
                <div style={{ color: colors.text }} className="text-[12px] font-semibold mb-2 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.5 1H14a2.5 2.5 0 0 0-2.5 2.5V8h-6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5h1a2.5 2.5 0 0 0 2.5-2.5V3.5A2.5 2.5 0 0 0 18.5 1z" />
                  </svg>
                  {t('permissions.notice.operationGuide')}
                </div>
                <ul style={{ color: colors.textSecondary }} className="text-[12px] space-y-1 pl-4 list-disc">
                  <li>{t('permissions.notice.rowIsModule')}</li>
                  <li>{t('permissions.notice.selectToggle')}</li>
                  <li>{t('permissions.notice.rightFeatures')}</li>
                  <li>{t('permissions.notice.grayNoAccess')}</li>
                </ul>
              </div>

              {/* Security Tips */}
              <div style={{ color: colors.text }} className="text-[12px] font-semibold mb-2 flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
                </svg>
                {t('permissions.notice.securityTips')}
              </div>
              <ul style={{ color: colors.textSecondary }} className="text-[12px] space-y-2">
                <li>
                  <strong style={{ color: colors.text }}>{t('permissions.notice.passthrough')}:</strong><br />
                  {t('permissions.notice.passthroughDesc')}
                </li>
                <li>
                  <strong style={{ color: colors.text }}>{t('permissions.notice.effectTime')}:</strong><br />
                  {t('permissions.notice.effectTimeDesc')}
                </li>
                <li>
                  <strong style={{ color: colors.text }}>{t('permissions.notice.auditTrail')}:</strong><br />
                  {t('permissions.notice.auditTrailDesc')}
                </li>
              </ul>
            </div>
          </div>

        </div>
      </section>

      {/* Security Dialog */}
      <SecurityCodeDialog
        isOpen={permsSecurity.isOpen}
        level={permsSecurity.level}
        title={t('permissions.title')}
        description={tc('securityCode.required')}
        onConfirm={permsSecurity.onConfirm}
        onCancel={permsSecurity.onCancel}
        isLoading={updateMutation.isPending}
        error={error || permsSecurity.error}
      />
    </div>
  );
}
