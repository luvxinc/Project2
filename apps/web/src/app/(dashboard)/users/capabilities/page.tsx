'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useModal } from '@/components/modal/GlobalModal';
import { rolesApi, Role, BoundaryType, CreateRoleDto } from '@/lib/api/roles';

/**
 * 系统级职能开关定义
 * 对应老系统 admin_capabilities.json 中的 6 大开关
 */
const CAPABILITY_SWITCHES = [
  { key: 'can_create_user', i18nKey: 'createUser', icon: 'user-plus', level: 'standard' },
  { key: 'can_lock_user', i18nKey: 'lockUser', icon: 'lock', level: 'standard' },
  { key: 'can_reset_pwd', i18nKey: 'resetPassword', icon: 'key', level: 'warning' },
  { key: 'can_manage_perms', i18nKey: 'managePerms', icon: 'shield', level: 'standard' },
  { key: 'can_change_role', i18nKey: 'changeRole', icon: 'user-tag', level: 'warning' },
  { key: 'can_delete_user', i18nKey: 'deleteUser', icon: 'trash', level: 'danger' },
];

// 预设颜色
const PRESET_COLORS = [
  '#9CA3AF', '#60A5FA', '#34D399', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#6366F1',
];

// SF Symbols 风格图标
function CapIcon({ name, color }: { name: string; color?: string }) {
  const icons: Record<string, React.ReactNode> = {
    'user-plus': (
      <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
      </svg>
    ),
    'lock': (
      <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
      </svg>
    ),
    'key': (
      <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
      </svg>
    ),
    'shield': (
      <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
    'user-tag': (
      <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    ),
    'trash': (
      <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
      </svg>
    ),
    'plus': (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
    ),
    'edit': (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
      </svg>
    ),
  };
  return <span style={{ color }}>{icons[name] || null}</span>;
}

/**
 * Apple iOS/macOS 标准开关
 */
function AppleSwitch({ 
  checked, 
  onChange, 
  variant = 'green',
  disabled = false,
}: { 
  checked: boolean; 
  onChange: (val: boolean) => void;
  variant?: 'green' | 'orange' | 'red';
  disabled?: boolean;
}) {
  const { theme } = useTheme();
  
  const activeColor = { green: '#34c759', orange: '#ff9f0a', red: '#ff3b30' }[variant];
  const inactiveColor = theme === 'dark' ? '#39393d' : '#e9e9eb';
  
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      style={{
        width: 51,
        height: 31,
        padding: 2,
        borderRadius: 15.5,
        backgroundColor: checked ? activeColor : inactiveColor,
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background-color 0.2s ease',
        position: 'relative',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span 
        style={{
          display: 'block',
          width: 27,
          height: 27,
          borderRadius: '50%',
          backgroundColor: '#ffffff',
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
          transition: 'transform 0.2s ease',
          transform: checked ? 'translateX(20px)' : 'translateX(0)',
        }}
      />
    </button>
  );
}

// 职能等级默认配置 (不包含 viewer，因为未登录用户无法进入 dashboard)
const DEFAULT_ROLE_CAPABILITIES: Record<string, Record<string, boolean>> = {
  editor: { can_create_user: false, can_lock_user: false, can_reset_pwd: false, can_manage_perms: false, can_change_role: false, can_delete_user: false },
  staff: { can_create_user: false, can_lock_user: false, can_reset_pwd: false, can_manage_perms: false, can_change_role: false, can_delete_user: false },
  admin: { can_create_user: true, can_lock_user: true, can_reset_pwd: true, can_manage_perms: true, can_change_role: true, can_delete_user: true },
  superuser: { can_create_user: true, can_lock_user: true, can_reset_pwd: true, can_manage_perms: true, can_change_role: true, can_delete_user: true },
};

// 轮播滚动量
const SCROLL_AMOUNT = 340;

/**
 * 添加/编辑职能模态框
 */
function RoleModal({
  isOpen,
  onClose,
  onSave,
  editingRole,
  existingLevels,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { name: string; displayName: string; level: number; color: string }) => void;
  editingRole?: Role | null;
  existingLevels: number[];
}) {
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const t = useTranslations('users');
  
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [level, setLevel] = useState(1);
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editingRole) {
      setName(editingRole.name);
      setDisplayName(editingRole.displayName);
      setLevel(editingRole.level);
      setColor(editingRole.color || PRESET_COLORS[0]);
    } else {
      // 新建时自动计算下一个可用 level
      const maxLevel = Math.max(...existingLevels, 0);
      setName('');
      setDisplayName('');
      setLevel(maxLevel + 1);
      setColor(PRESET_COLORS[existingLevels.length % PRESET_COLORS.length]);
    }
    setError(null);
  }, [editingRole, existingLevels, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = () => {
    setError(null);
    if (!name.trim() || !displayName.trim()) {
      setError(t('roles.messages.fillRequired'));
      return;
    }
    onSave({ name: name.trim(), displayName: displayName.trim(), level, color });
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div 
        className="w-[400px] rounded-2xl p-6"
        style={{ backgroundColor: colors.bgSecondary }}
        onClick={e => e.stopPropagation()}
      >
        <h2 style={{ color: colors.text }} className="text-xl font-semibold mb-6">
          {editingRole ? t('roles.editRole') : t('roles.addRole')}
        </h2>

        {/* 表单 */}
        <div className="space-y-4">
          {/* 职能名称 (英文标识) */}
          <div>
            <label style={{ color: colors.textSecondary }} className="text-sm block mb-1.5">
              {t('roles.fields.name')} {t('roles.fields.nameHint')}
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value.toLowerCase().replace(/[^a-z_]/g, ''))}
              placeholder="e.g. manager"
              disabled={editingRole?.isSystem}
              className="w-full h-10 px-3 rounded-lg text-sm"
              style={{ 
                backgroundColor: colors.bgTertiary,
                color: colors.text,
                border: `1px solid ${colors.border}`,
              }}
            />
          </div>

          {/* 显示名称 */}
          <div>
            <label style={{ color: colors.textSecondary }} className="text-sm block mb-1.5">
              {t('roles.fields.displayName')} {t('roles.fields.displayNameHint')}
            </label>
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder={t('roles.fields.displayNamePlaceholder')}
              className="w-full h-10 px-3 rounded-lg text-sm"
              style={{ 
                backgroundColor: colors.bgTertiary,
                color: colors.text,
                border: `1px solid ${colors.border}`,
              }}
            />
          </div>

          {/* 职级等级 */}
          <div>
            <label style={{ color: colors.textSecondary }} className="text-sm block mb-1.5">
              {t('roles.fields.level')} {t('roles.fields.levelHint')}
            </label>
            <input
              type="number"
              min={1}
              max={10}
              value={level}
              onChange={e => setLevel(parseInt(e.target.value) || 1)}
              disabled={editingRole?.isSystem}
              className="w-full h-10 px-3 rounded-lg text-sm"
              style={{ 
                backgroundColor: colors.bgTertiary,
                color: colors.text,
                border: `1px solid ${colors.border}`,
              }}
            />
          </div>

          {/* 颜色选择 */}
          <div>
            <label style={{ color: colors.textSecondary }} className="text-sm block mb-1.5">
              {t('roles.fields.color')}
            </label>
            <div className="flex gap-2 flex-wrap">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className="w-8 h-8 rounded-full transition-transform"
                  style={{ 
                    backgroundColor: c,
                    transform: color === c ? 'scale(1.2)' : 'scale(1)',
                    boxShadow: color === c ? '0 0 0 2px white, 0 0 0 4px ' + c : 'none',
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div 
            className="mt-4 p-3 rounded-lg text-sm"
            style={{ backgroundColor: '#ff453a20', color: '#ff453a' }}
          >
            {error}
          </div>
        )}

        {/* 按钮 */}
        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 h-10 rounded-lg text-sm font-medium transition-opacity hover:opacity-80"
            style={{ backgroundColor: colors.bgTertiary, color: colors.text }}
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSubmit}
            className="flex-1 h-10 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-80"
            style={{ backgroundColor: '#0071e3' }}
          >
            {editingRole ? t('common.save') : t('roles.addRole')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CapabilitiesPage() {
  const t = useTranslations('users');
  const tc = useTranslations('common');
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const { showPassword, showSuccess, showError } = useModal();
  
  // 状态
  const [roles, setRoles] = useState<Role[]>([]);
  const [roleCapabilities, setRoleCapabilities] = useState<Record<string, Record<string, boolean>>>(DEFAULT_ROLE_CAPABILITIES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // 模态框状态
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  
  // 轮播滚动状态 (仿 HUB 页面)
  const carouselRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  
  // 检查滚动位置
  const updateScrollButtons = useCallback(() => {
    if (carouselRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = carouselRef.current;
      setCanScrollLeft(scrollLeft > 10);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
    }
  }, []);
  
  // 滚动处理
  const scrollCarousel = useCallback((direction: 'left' | 'right') => {
    if (carouselRef.current) {
      const amount = direction === 'left' ? -SCROLL_AMOUNT : SCROLL_AMOUNT;
      carouselRef.current.scrollBy({ left: amount, behavior: 'smooth' });
    }
  }, []);

  // 加载职能角色
  const loadRoles = useCallback(async () => {
    try {
      setLoading(true);
      const data = await rolesApi.findAll();
      if (data && data.length > 0) {
        setRoles(data.sort((a, b) => a.level - b.level));
        // 从后端数据初始化能力配置
        const caps: Record<string, Record<string, boolean>> = {};
        for (const role of data) {
          caps[role.name] = { ...DEFAULT_ROLE_CAPABILITIES[role.name] };
          if (role.boundaries) {
            for (const b of role.boundaries) {
              if (b.boundaryType === 'ALLOWED') caps[role.name][b.permissionKey] = true;
              else if (b.boundaryType === 'DENIED') caps[role.name][b.permissionKey] = false;
            }
          }
        }
        setRoleCapabilities(caps);
      }
    } catch (err) {
      console.warn('Failed to load roles, using static data:', err);
      // 使用静态数据 - L1 最高职级 (admin), L3 最低可配置职级 (editor)
      // 不包含 viewer - 未登录用户无法进入 dashboard，不需要配置边界
      setRoles([
        { id: '4', name: 'admin', displayName: t('roleNames.admin'), level: 1, isSystem: false, isActive: true, color: '#F59E0B', description: null, createdAt: '', updatedAt: '' },
        { id: '3', name: 'staff', displayName: t('roleNames.staff'), level: 2, isSystem: false, isActive: true, color: '#34D399', description: null, createdAt: '', updatedAt: '' },
        { id: '2', name: 'editor', displayName: t('roleNames.editor') || 'Editor', level: 3, isSystem: false, isActive: true, color: '#60A5FA', description: null, createdAt: '', updatedAt: '' },
        { id: '5', name: 'superuser', displayName: t('roleNames.superuser'), level: 0, isSystem: true, isActive: true, color: '#EF4444', description: null, createdAt: '', updatedAt: '' },
      ]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);
  
  // 初始化滚动按钮状态 + 注册原生滚轮事件
  useEffect(() => {
    const carousel = carouselRef.current;
    if (!loading && carousel) {
      // 初始化按钮状态
      requestAnimationFrame(() => {
        updateScrollButtons();
      });
      
      // 注册原生滚轮事件 - 使用 scrollBy 而不是 preventDefault
      const handleWheel = (e: WheelEvent) => {
        // 只处理垂直滚动，且鼠标在轮播区域内时转换为水平滚动
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && e.deltaY !== 0) {
          carousel.scrollBy({
            left: e.deltaY,
            behavior: 'auto'
          });
        }
      };
      
      carousel.addEventListener('wheel', handleWheel, { passive: true });
      
      return () => {
        carousel.removeEventListener('wheel', handleWheel);
      };
    }
  }, [loading, updateScrollButtons, roles]);

  // 切换能力开关
  const toggleCapability = (roleName: string, capKey: string) => {
    if (roleName === 'superuser') return; // superuser 始终全开
    
    setRoleCapabilities(prev => ({
      ...prev,
      [roleName]: { ...prev[roleName], [capKey]: !prev[roleName]?.[capKey] },
    }));
  };

  // 添加职能
  const handleAddRole = async (data: { name: string; displayName: string; level: number; color: string }) => {
    showPassword({
      title: tc('securityCode.title'),
      message: t('roles.messages.enterL3Code'),
      requiredCodes: ['l3'],
      onPasswordSubmit: async (passwords) => {
        const securityCode = passwords.l3;
        if (!securityCode) {
          throw new Error(tc('securityCode.required'));
        }

        try {
          await rolesApi.create({ ...data, sec_code_l3: securityCode });
          setModalOpen(false);
          await loadRoles();
          showSuccess({
            title: tc('success'),
            message: t('roles.messages.added'),
            showCancel: false,
            confirmText: tc('ok'),
          });
        } catch (err: any) {
          showError({
            title: tc('error'),
            message: err.message || tc('operationFailed'),
            showCancel: false,
            confirmText: tc('ok'),
          });
        }
      },
    });
  };

  // 编辑职能
  const handleEditRole = async (data: { name: string; displayName: string; level: number; color: string }) => {
    if (!editingRole) return;
    
    showPassword({
      title: tc('securityCode.title'),
      message: t('roles.messages.enterL3Code'),
      requiredCodes: ['l3'],
      onPasswordSubmit: async (passwords) => {
        const securityCode = passwords.l3;
        if (!securityCode) {
          throw new Error(tc('securityCode.required'));
        }

        try {
          await rolesApi.update(editingRole.id, { ...data, sec_code_l3: securityCode });
          setModalOpen(false);
          setEditingRole(null);
          await loadRoles();
          showSuccess({
            title: tc('success'),
            message: t('roles.messages.updated'),
            showCancel: false,
            confirmText: tc('ok'),
          });
        } catch (err: any) {
          showError({
            title: tc('error'),
            message: err.message || tc('operationFailed'),
            showCancel: false,
            confirmText: tc('ok'),
          });
        }
      },
    });
  };

  // 删除职能
  const handleDeleteRole = async (role: Role) => {
    if (role.isSystem) {
      showError({
        title: tc('error'),
        message: t('roles.messages.cannotDeleteSystem'),
        showCancel: false,
        confirmText: tc('ok'),
      });
      return;
    }
    
    // 使用 showPassword 进行确认和密码验证
    showPassword({
      title: t('roles.deleteRole'),
      message: t('roles.messages.confirmDelete', { name: role.displayName }),
      requiredCodes: ['l4'],
      onPasswordSubmit: async (passwords) => {
        const securityCode = passwords.l4;
        if (!securityCode) {
          throw new Error(tc('securityCode.required'));
        }

        try {
          await rolesApi.delete(role.id, { sec_code_l4: securityCode });
          await loadRoles();
          showSuccess({
            title: tc('success'),
            message: t('roles.messages.deleted'),
            showCancel: false,
            confirmText: tc('ok'),
          });
        } catch (err: any) {
          showError({
            title: tc('error'),
            message: err.message || tc('operationFailed'),
            showCancel: false,
            confirmText: tc('ok'),
          });
        }
      },
    });
  };

  // 保存能力配置 (需要 L1 + L4 双重验证)
  const handleSave = () => {
    showPassword({
      title: tc('securityCode.title'),
      message: t('roles.messages.enterL1L4Code'),
      requiredCodes: ['l1', 'l4'],
      onPasswordSubmit: async (passwords) => {
        const codeL1 = passwords.l1;
        const codeL4 = passwords.l4;
        if (!codeL1 || !codeL4) {
          throw new Error(tc('securityCode.required'));
        }

        try {
          setSaving(true);
          for (const role of roles) {
            if (role.name === 'superuser') continue;
            const caps = roleCapabilities[role.name] || {};
            const boundaries = Object.entries(caps).map(([key, enabled]) => ({
              permissionKey: key,
              boundaryType: enabled ? 'ALLOWED' as BoundaryType : 'DENIED' as BoundaryType,
            }));
            await rolesApi.setBoundaries(role.id, boundaries, { sec_code_l1: codeL1, sec_code_l4: codeL4 });
          }
          showSuccess({
            title: tc('success'),
            message: t('roles.messages.configSaved'),
            showCancel: false,
            confirmText: tc('ok'),
          });
        } catch (err: any) {
          showError({
            title: tc('error'),
            message: err.message || tc('operationFailed'),
            showCancel: false,
            confirmText: tc('ok'),
          });
        } finally {
          setSaving(false);
        }
      },
    });
  };

  const getSwitchVariant = (level: string): 'green' | 'orange' | 'red' => {
    if (level === 'danger') return 'red';
    if (level === 'warning') return 'orange';
    return 'green';
  };

  return (
    <div style={{ backgroundColor: colors.bg }} className="min-h-screen">
      {/* Header + Controls */}
      <section className="pt-12 pb-4 px-6 relative z-10">
        <div className="max-w-[1200px] mx-auto flex items-end justify-between">
          {/* Left: Title */}
          <div>
            <h1 style={{ color: colors.text }} className="text-[32px] font-semibold tracking-tight mb-2">
              {t('capabilities.title')}
            </h1>
            <p style={{ color: colors.textSecondary }} className="text-[17px] leading-relaxed">
              {t('capabilities.description')}
            </p>
          </div>
          
          {/* Right: Save Button + Navigation Arrows */}
          {!loading && (
            <div className="flex items-center gap-3 relative z-50">
              {/* 保存配置按钮 */}
              <button 
                onClick={handleSave}
                disabled={saving}
                style={{ backgroundColor: '#0071e3' }}
                className="h-9 px-5 hover:opacity-90 text-white text-[14px] font-medium rounded-lg transition-opacity disabled:opacity-50 flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {t('roles.messages.saving')}
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    {t('capabilities.saveAll')}
                  </>
                )}
              </button>
              
              {/* Navigation Arrows */}
              <button
                onClick={() => scrollCarousel('left')}
                disabled={!canScrollLeft}
                className="w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200"
                style={{ 
                  backgroundColor: colors.bgTertiary,
                  opacity: canScrollLeft ? 1 : 0.4,
                }}
              >
                <svg className="w-4 h-4" fill="none" stroke={colors.text} viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
              </button>
              <button
                onClick={() => scrollCarousel('right')}
                disabled={!canScrollRight}
                className="w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200"
                style={{ 
                  backgroundColor: colors.bgTertiary,
                  opacity: canScrollRight ? 1 : 0.4,
                }}
              >
                <svg className="w-4 h-4" fill="none" stroke={colors.text} viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </section>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div 
            className="w-8 h-8 border-2 rounded-full animate-spin" 
            style={{ 
              borderLeftColor: colors.border, 
              borderRightColor: colors.border, 
              borderBottomColor: colors.border, 
              borderTopColor: '#0071e3' 
            }} 
          />
        </div>
      ) : (
        <section className="pb-16 overflow-hidden">
          {/* 职能卡片轮播区 - 支持鼠标滚轮横向滚动（事件在 useEffect 中注册） */}
          <div 
            ref={carouselRef}
            onScroll={updateScrollButtons}
            className="hide-scrollbar flex gap-5 overflow-x-auto px-6 pt-4 pb-6 cursor-grab active:cursor-grabbing"
            style={{ 
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {/* Left spacer - 对齐 1200px 内容区 */}
            <div className="flex-shrink-0 w-[max(0px,calc((100vw-1200px)/2-24px))]" />
            
            {/* 过滤 superuser，按 level 升序排序 (L1 最高职级在左) */}
            {roles
              .filter(r => r.name !== 'superuser')
              .sort((a, b) => a.level - b.level)
              .map((role, idx) => (
              <div 
                key={role.name}
                className="flex-shrink-0 animate-fadeInUp"
                style={{ 
                  width: '320px',
                  animationDelay: `${idx * 80}ms`,
                }}
              >
                {/* 卡片主体 */}
                <div 
                  className="rounded-[24px] p-6 flex flex-col transition-transform hover:scale-[1.02]"
                  style={{ 
                    backgroundColor: colors.bgSecondary,
                    border: `1px solid ${colors.border}`,
                    boxShadow: theme === 'dark' 
                      ? '0 8px 32px rgba(0,0,0,0.3)' 
                      : '0 4px 24px rgba(0,0,0,0.08)',
                  }}
                >
                  {/* 卡片头部：职能信息 */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[15px] font-bold"
                        style={{ backgroundColor: role.color || '#666' }}
                      >
                        L{role.level}
                      </div>
                      <div>
                        <h3 
                          style={{ color: colors.text }} 
                          className="text-[17px] font-semibold truncate max-w-[140px]"
                          title={role.displayName}
                        >
                          {role.displayName}
                        </h3>
                        {role.isSystem ? (
                          <span style={{ color: colors.textTertiary }} className="text-[12px]">
                            {t('roles.systemTag')}
                          </span>
                        ) : (
                          <span style={{ color: colors.textSecondary }} className="text-[12px]">
                            {role.name}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    {/* 编辑/删除按钮 */}
                    {!role.isSystem && (
                      <div className="flex gap-1">
                        <button 
                          onClick={() => { setEditingRole(role); setModalOpen(true); }} 
                          className="p-2 rounded-lg hover:opacity-70 transition-opacity"
                          style={{ backgroundColor: colors.bgTertiary }}
                          title={t('roles.edit')}
                        >
                          <CapIcon name="edit" color={colors.textSecondary} />
                        </button>
                        <button 
                          onClick={() => handleDeleteRole(role)} 
                          className="p-2 rounded-lg hover:opacity-70 transition-opacity"
                          style={{ backgroundColor: '#ff3b3010' }}
                          title={t('roles.delete')}
                        >
                          <CapIcon name="trash" color="#ff3b30" />
                        </button>
                      </div>
                    )}
                  </div>
                  
                  {/* 分割线 */}
                  <div className="h-px mb-4" style={{ backgroundColor: colors.border }} />
                  
                  {/* 能力开关列表 */}
                  <div className="space-y-3">
                    {CAPABILITY_SWITCHES.map(cap => (
                      <div 
                        key={cap.key}
                        className="flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2.5">
                          <CapIcon 
                            name={cap.icon} 
                            color={cap.level === 'danger' ? '#ff3b30' : cap.level === 'warning' ? '#ff9f0a' : colors.blue}
                          />
                          <span style={{ color: colors.text }} className="text-[14px]">
                            {t(`capabilities.items.${cap.i18nKey}.title`).replace('允许', '').replace('Allow ', '')}
                          </span>
                        </div>
                        <div className="flex-shrink-0">
                          <AppleSwitch 
                            checked={roleCapabilities[role.name]?.[cap.key] ?? false}
                            onChange={() => toggleCapability(role.name, cap.key)}
                            variant={getSwitchVariant(cap.level)}
                            disabled={role.name === 'superuser'}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
            
            {/* 添加新职能卡片 */}
            <div 
              className="flex-shrink-0 animate-fadeInUp"
              style={{ 
                width: '320px',
                animationDelay: `${roles.filter(r => r.name !== 'superuser').length * 80}ms`,
              }}
            >
              <button 
                onClick={() => { setEditingRole(null); setModalOpen(true); }}
                className="rounded-[24px] w-full h-[400px] flex flex-col items-center justify-center gap-4 transition-all hover:scale-[1.02]"
                style={{ 
                  backgroundColor: colors.bgSecondary,
                  border: `2px dashed ${colors.border}`,
                }}
              >
                <div 
                  className="w-16 h-16 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: '#0071e320' }}
                >
                  <CapIcon name="plus" color="#0071e3" />
                </div>
                <span style={{ color: '#0071e3' }} className="text-[15px] font-medium">
                  {t('roles.addRole')}
                </span>
              </button>
            </div>
            
            {/* Right spacer - 对齐 1200px 内容区 */}
            <div className="flex-shrink-0 w-[max(0px,calc((100vw-1200px)/2-24px))]" />
          </div>
          
          {/* 底部区域：操作须知 */}
          <div className="max-w-[1200px] mx-auto px-6 mt-8">
            {/* 操作须知 */}
            <div 
              className="rounded-xl p-5"
              style={{ backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)' }}
            >
              <div className="flex items-center gap-2 mb-3">
                <svg style={{ color: colors.blue }} className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                </svg>
                <span style={{ color: colors.text }} className="text-[14px] font-medium">{t('capabilities.notice.title')}</span>
              </div>
              <div className="flex flex-col gap-2">
                <span style={{ color: colors.textSecondary }} className="text-[13px] flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-current opacity-40" />
                  {t('capabilities.notice.adminOnly')}
                </span>
                <span style={{ color: colors.textSecondary }} className="text-[13px] flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-current opacity-40" />
                  {t('capabilities.notice.l3Required')}
                </span>
                <span style={{ color: colors.textSecondary }} className="text-[13px] flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-current opacity-40" />
                  {t('capabilities.notice.auditLogged')}
                </span>
                <span style={{ color: colors.textSecondary }} className="text-[13px] flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-current opacity-40" />
                  {t('capabilities.notice.instantEffect')}
                </span>
                <span style={{ color: colors.textSecondary }} className="text-[13px] flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-current opacity-40" />
                  {t('capabilities.superuserAlwaysOn')}
                </span>
              </div>
              
              {/* 图例 */}
              <div className="flex gap-6 mt-4 pt-4" style={{ borderTop: `1px solid ${colors.border}` }}>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#34c759' }} />
                  <span style={{ color: colors.textSecondary }} className="text-[12px]">{t('capabilities.standard')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#ff9f0a' }} />
                  <span style={{ color: colors.textSecondary }} className="text-[12px]">{t('capabilities.highRisk')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#ff3b30' }} />
                  <span style={{ color: colors.textSecondary }} className="text-[12px]">{t('capabilities.criticalRisk')}</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 添加/编辑职能模态框 */}
      <RoleModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditingRole(null); }}
        onSave={editingRole ? handleEditRole : handleAddRole}
        editingRole={editingRole}
        existingLevels={roles.map(r => r.level)}
      />
    </div>
  );
}
