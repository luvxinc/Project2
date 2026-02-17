'use client';

import { useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { usersApi, User, UserRole } from '@/lib/api';
import { SecurityCodeDialog } from '@/components/ui/security-code-dialog';
import { useTheme, themeColors } from '@/contexts/ThemeContext';

const statusColor: Record<string, string> = {
  ACTIVE: '#30d158',
  DISABLED: '#86868b',
  LOCKED: '#ff453a',
};

const roles: UserRole[] = ['admin', 'manager', 'staff', 'operator', 'viewer'];

export default function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const userId = resolvedParams.id;
  
  const t = useTranslations('users');
  const tc = useTranslations('common');
  const router = useRouter();
  const queryClient = useQueryClient();
  const { theme } = useTheme();
  const colors = themeColors[theme];

  // State
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    displayName: '',
    email: '',
    roles: [] as UserRole[],
  });
  const [secCode, setSecCode] = useState('');
  const [showSecurityDialog, setShowSecurityDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Query
  const { data: user, isLoading } = useQuery({
    queryKey: ['user', userId],
    queryFn: () => usersApi.findOne(userId),
  });

  // Mutation
  const updateMutation = useMutation({
    mutationFn: (data: Parameters<typeof usersApi.update>[1]) => usersApi.update(userId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', userId] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setIsEditing(false);
      setShowSecurityDialog(false);
    },
    onError: (err: Error) => {
      setError(err.message || tc('error'));
    },
  });

  const handleEdit = () => {
    if (user) {
      setFormData({
        displayName: user.displayName || '',
        email: user.email,
        roles: user.roles,
      });
      setIsEditing(true);
      setError(null);
    }
  };

  const handleSave = () => {
    setShowSecurityDialog(true);
  };

  const handleSecurityConfirm = (code: string) => {
    updateMutation.mutate({
      displayName: formData.displayName || undefined,
      email: formData.email,
      sec_code_l2: code,
    });
  };

  if (isLoading) {
    return (
      <div style={{ backgroundColor: colors.bg }} className="min-h-screen flex items-center justify-center">
        <div style={{ borderColor: colors.text, borderTopColor: 'transparent' }} className="w-8 h-8 border-2 rounded-full animate-spin" />
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

  return (
    <div style={{ backgroundColor: colors.bg }} className="min-h-screen">
      {/* Hero */}
      <section className="text-center pt-12 pb-8">
        {/* Avatar */}
        <div 
          style={{ backgroundColor: colors.bgSecondary }}
          className="mx-auto w-24 h-24 rounded-full flex items-center justify-center mb-4"
        >
          <svg style={{ color: colors.text }} className="w-12 h-12 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
          </svg>
        </div>
        
        {/* Name */}
        <h2 style={{ color: colors.text }} className="text-[40px] font-semibold tracking-tight">
          {user.displayName || user.username}
        </h2>
        
        {/* Status + Role */}
        <div className="flex items-center justify-center gap-4 mt-3">
          <span 
            className="px-3 py-1 rounded-full text-[12px] font-medium"
            style={{ 
              backgroundColor: `${statusColor[user.status]}20`,
              color: statusColor[user.status]
            }}
          >
            {t(`status.${user.status.toLowerCase()}`)}
          </span>
          <span style={{ color: colors.textSecondary }} className="text-[14px]">
            {t(`roleNames.${user.roles[0]}`)}
          </span>
        </div>
      </section>

      {/* Detail Card */}
      <section className="max-w-xl mx-auto px-6 pb-16">
        <div style={{ backgroundColor: colors.bgSecondary }} className="rounded-2xl p-6">
          {/* Username (readonly) */}
          <div className="mb-5">
            <label style={{ color: colors.textSecondary }} className="block text-[12px] mb-2 uppercase tracking-wide">
              {t('form.username.label')}
            </label>
            <p style={{ color: colors.text }} className="text-[17px] font-medium">
              @{user.username}
            </p>
          </div>

          {/* Email */}
          <div className="mb-5">
            <label style={{ color: colors.textSecondary }} className="block text-[12px] mb-2 uppercase tracking-wide">
              {t('form.email.label')}
            </label>
            {isEditing ? (
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                style={{ 
                  backgroundColor: colors.bgTertiary, 
                  borderColor: colors.border,
                  color: colors.text 
                }}
                className="w-full h-12 px-4 border rounded-xl text-[15px] focus:outline-none focus:border-[#0071e3]"
              />
            ) : (
              <p style={{ color: colors.text }} className="text-[17px]">{user.email}</p>
            )}
          </div>

          {/* Display Name */}
          <div className="mb-5">
            <label style={{ color: colors.textSecondary }} className="block text-[12px] mb-2 uppercase tracking-wide">
              {t('form.displayName.label')}
            </label>
            {isEditing ? (
              <input
                type="text"
                value={formData.displayName}
                onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                style={{ 
                  backgroundColor: colors.bgTertiary, 
                  borderColor: colors.border,
                  color: colors.text 
                }}
                className="w-full h-12 px-4 border rounded-xl text-[15px] focus:outline-none focus:border-[#0071e3]"
              />
            ) : (
              <p style={{ color: colors.text }} className="text-[17px]">{user.displayName || '-'}</p>
            )}
          </div>

          {/* Roles */}
          <div className="mb-5">
            <label style={{ color: colors.textSecondary }} className="block text-[12px] mb-2 uppercase tracking-wide">
              {t('form.roles.label')}
            </label>
            <div className="flex flex-wrap gap-2 mb-3">
              {user.roles.map((role) => (
                <span
                  key={role}
                  style={{ backgroundColor: colors.bgTertiary, color: colors.text }}
                  className="px-3 py-1 text-[13px] rounded-lg"
                >
                  {t(`roleNames.${role}`)}
                </span>
              ))}
            </div>
            <Link href={`/users/${userId}/permissions`} style={{ color: colors.blue }} className="text-[13px] hover:underline">
              {t('actions.updatePermissions')}
            </Link>
          </div>

          {/* Last Login */}
          <div className="mb-5">
            <label style={{ color: colors.textSecondary }} className="block text-[12px] mb-2 uppercase tracking-wide">
              {t('list.columns.lastLogin')}
            </label>
            <p style={{ color: colors.textTertiary }} className="text-[15px]">
              {user.lastLoginAt 
                ? new Date(user.lastLoginAt).toLocaleString()
                : '-'
              }
            </p>
          </div>

          {/* Created At */}
          <div className="mb-6">
            <label style={{ color: colors.textSecondary }} className="block text-[12px] mb-2 uppercase tracking-wide">
              {t('list.columns.createdAt')}
            </label>
            <p style={{ color: colors.textTertiary }} className="text-[15px]">
              {new Date(user.createdAt).toLocaleString()}
            </p>
          </div>

          {/* Error */}
          {error && (
            <div 
              style={{ backgroundColor: `${colors.red}15`, borderColor: `${colors.red}50` }}
              className="mb-4 p-3 border rounded-lg"
            >
              <p style={{ color: colors.red }} className="text-[13px]">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div style={{ borderColor: colors.border }} className="flex gap-3 pt-4 border-t">
            {isEditing ? (
              <>
                <button
                  onClick={() => setIsEditing(false)}
                  style={{ backgroundColor: colors.bgTertiary, color: colors.text }}
                  className="flex-1 h-11 hover:opacity-80 text-[15px] font-medium rounded-full"
                >
                  {tc('cancel')}
                </button>
                <button
                  onClick={handleSave}
                  style={{ backgroundColor: colors.blue }}
                  className="flex-1 h-11 hover:opacity-90 text-white text-[15px] font-medium rounded-full"
                >
                  {tc('save')}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => router.back()}
                  style={{ backgroundColor: colors.bgTertiary, color: colors.text }}
                  className="flex-1 h-11 hover:opacity-80 text-[15px] font-medium rounded-full"
                >
                  Back
                </button>
                <button
                  onClick={handleEdit}
                  style={{ backgroundColor: colors.blue }}
                  className="flex-1 h-11 hover:opacity-90 text-white text-[15px] font-medium rounded-full"
                >
                  {tc('edit')}
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Security Dialog */}
      <SecurityCodeDialog
        isOpen={showSecurityDialog}
        level="L2"
        title={t('form.updateTitle')}
        description={tc('securityCode.required')}
        onConfirm={handleSecurityConfirm}
        onCancel={() => setShowSecurityDialog(false)}
        isLoading={updateMutation.isPending}
        error={error}
      />
    </div>
  );
}
