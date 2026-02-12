'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { usersApi } from '@/lib/api';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useModal } from '@/components/modal/GlobalModal';

export default function RegisterPage() {
  const t = useTranslations('users');
  const tc = useTranslations('common');
  const router = useRouter();
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const { showPassword } = useModal();

  // Form state
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Mutation
  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof usersApi.create>[0]) => usersApi.create(data),
    onSuccess: () => {
      setSuccess(true);
      setTimeout(() => router.push('/users'), 1500);
    },
    onError: (err: Error) => {
      setError(err.message || tc('error'));
    },
  });

  // 处理表单提交
  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // 验证用户名
    if (!username.trim()) {
      setError(t('form.username.label') + ' ' + tc('isRequired'));
      return;
    }

    if (username.trim().length < 3) {
      setError(t('form.username.hint'));
      return;
    }

    // 验证邮箱
    if (!email.trim()) {
      setError(t('form.email.label') + ' ' + tc('isRequired'));
      return;
    }

    // 验证密码
    if (!password || password.length < 8) {
      setError(t('form.password.hint'));
      return;
    }

    if (password !== confirmPassword) {
      setError(tc('passwordMismatch'));
      return;
    }

    // 使用 L2 安全验证 modal
    showPassword({
      title: tc('securityCode.title'),
      message: t('security.requiresL2'),
      requiredCodes: ['l2'],
      onPasswordSubmit: (passwords) => {
        const secCode = passwords.l2;
        if (!secCode) {
          setError(t('security.enterSecurityCode'));
          return;
        }

        // 提交请求
        createMutation.mutate({
          username: username.trim(),
          email: email.trim(),
          displayName: displayName.trim() || undefined,
          password,
          roles: ['viewer'], // 默认最低角色
          sec_code_l2: secCode,
        });
      },
    });
  }, [username, email, displayName, password, confirmPassword, showPassword, t, tc, createMutation]);

  // 成功提示
  if (success) {
    return (
      <div style={{ backgroundColor: colors.bg }} className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#30d158]/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-[#30d158]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 style={{ color: colors.text }} className="text-[24px] font-semibold mb-2">
            {t('messages.createSuccess')}
          </h2>
          <p style={{ color: colors.textSecondary }} className="text-[15px]">
            {tc('redirecting')}...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: colors.bg }} className="min-h-screen">
      {/* Header Section - Apple ID 风格居中标题 */}
      <section className="pt-12 pb-8 px-6">
        <div className="max-w-[480px] mx-auto text-center">
          <h1 style={{ color: colors.text }} className="text-[32px] font-semibold tracking-tight mb-2">
            {t('register.title')}
          </h1>
          <p style={{ color: colors.textSecondary }} className="text-[17px] leading-relaxed">
            {t('register.description')}
          </p>
        </div>
      </section>

      {/* Form Section - Apple ID 风格 */}
      <section className="px-6 pb-20">
        <div className="max-w-[480px] mx-auto">
          <form onSubmit={handleSubmit}>
            
            {/* Account Info Group - Apple 风格连续输入框组 */}
            <div 
              style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
              className="rounded-xl overflow-hidden border"
            >
              {/* Username */}
              <div style={{ borderColor: colors.border }} className="border-b">
                <div className="flex items-center px-4">
                  <label style={{ color: colors.textSecondary }} className="w-28 shrink-0 text-[15px]">
                    {t('form.username.label')}
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={t('form.username.placeholder')}
                    autoComplete="off"
                    style={{ color: colors.text }}
                    className="flex-1 h-12 bg-transparent text-[15px] focus:outline-none"
                  />
                </div>
              </div>
              
              {/* Email */}
              <div style={{ borderColor: colors.border }} className="border-b">
                <div className="flex items-center px-4">
                  <label style={{ color: colors.textSecondary }} className="w-28 shrink-0 text-[15px]">
                    {t('form.email.label')}
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('form.email.placeholder')}
                    autoComplete="off"
                    style={{ color: colors.text }}
                    className="flex-1 h-12 bg-transparent text-[15px] focus:outline-none"
                  />
                </div>
              </div>
              
              {/* Display Name */}
              <div>
                <div className="flex items-center px-4">
                  <label style={{ color: colors.textSecondary }} className="w-28 shrink-0 text-[15px]">
                    {t('form.displayName.label')}
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder={tc('optional')}
                    autoComplete="off"
                    style={{ color: colors.text }}
                    className="flex-1 h-12 bg-transparent text-[15px] focus:outline-none"
                  />
                </div>
              </div>
            </div>
            
            {/* Hint Text */}
            <p style={{ color: colors.textTertiary }} className="text-[12px] mt-2 px-4 mb-6">
              {t('form.username.hint')}
            </p>

            {/* Password Group */}
            <div 
              style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
              className="rounded-xl overflow-hidden border"
            >
              {/* Password */}
              <div style={{ borderColor: colors.border }} className="border-b">
                <div className="flex items-center px-4">
                  <label style={{ color: colors.textSecondary }} className="w-28 shrink-0 text-[15px]">
                    {t('form.password.label')}
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t('form.password.placeholder')}
                    autoComplete="new-password"
                    style={{ color: colors.text }}
                    className="flex-1 h-12 bg-transparent text-[15px] focus:outline-none"
                  />
                </div>
              </div>
              
              {/* Confirm Password */}
              <div>
                <div className="flex items-center px-4">
                  <label style={{ color: colors.textSecondary }} className="w-28 shrink-0 text-[15px]">
                    {tc('confirmPassword')}
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={tc('confirmPasswordPlaceholder')}
                    autoComplete="new-password"
                    style={{ color: colors.text }}
                    className="flex-1 h-12 bg-transparent text-[15px] focus:outline-none"
                  />
                </div>
              </div>
            </div>
            
            {/* Password Hint */}
            <p style={{ color: colors.textTertiary }} className="text-[12px] mt-2 px-4 mb-8">
              {t('form.password.hint')}
            </p>

            {/* Error Message */}
            {error && (
              <div 
                style={{ backgroundColor: `${colors.red}10` }}
                className="mb-6 p-4 rounded-xl flex items-start gap-3"
              >
                <svg className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: colors.red }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
                <p style={{ color: colors.red }} className="text-[14px]">{error}</p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col items-center gap-4">
              <button
                type="submit"
                disabled={createMutation.isPending}
                style={{ backgroundColor: colors.blue }}
                className="w-full h-12 hover:opacity-90 text-white text-[17px] font-medium rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {createMutation.isPending && (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                )}
                {t('actions.create')}
              </button>
              <button
                type="button"
                onClick={() => router.back()}
                style={{ color: colors.blue }}
                className="text-[15px] font-medium transition-colors hover:underline"
              >
                {tc('cancel')}
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
