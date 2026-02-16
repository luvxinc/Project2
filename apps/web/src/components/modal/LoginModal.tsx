'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useTheme, themeColors } from '@/contexts/ThemeContext';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  locale?: 'zh' | 'en' | 'vi';
}

export function LoginModal({ isOpen, onClose, locale = 'zh' }: LoginModalProps) {
  const tAuth = useTranslations('auth');
  const tLanding = useTranslations('landing');
  const router = useRouter();
  const { theme } = useTheme();
  const colors = themeColors[theme];
  
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleClose = () => {
    setShowPassword(false);
    setUsername('');
    setPassword('');
    setError('');
    onClose();
  };

  const handleContinue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    setShowPassword(true);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showPassword) {
      handleContinue(e);
      return;
    }
    
    setError('');
    setLoading(true);

    try {
      // 🔒 使用环境变量配置 API URL（支持生产环境部署）
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
      const res = await fetch(`${apiUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (data.success) {
        localStorage.setItem('accessToken', data.data.accessToken);
        localStorage.setItem('refreshToken', data.data.refreshToken);
        localStorage.setItem('user', JSON.stringify(data.data.user));
        
        // 🔒 设置 auth session cookie (供 middleware 验证)
        // 安全属性: SameSite=Strict 防止 CSRF，Secure 在 HTTPS 下启用
        const isSecure = window.location.protocol === 'https:';
        const secureFlag = isSecure ? '; Secure' : '';
        document.cookie = `auth_session=${data.data.accessToken}; path=/; max-age=${60 * 60 * 6}; SameSite=Strict${secureFlag}`;
        
        handleClose();
        router.push('/dashboard');
      } else {
        // 🔒 Phase 1 & 2: 使用 i18n 并支持动态参数
        const errorCode = data.errorCode;
        const remainingAttempts = data.remainingAttempts;
        const remainingSeconds = data.remainingSeconds;

        if (errorCode) {
          // 处理带有动态参数的错误消息
          if (errorCode === 'INVALID_CREDENTIALS' && typeof remainingAttempts === 'number') {
            setError(tAuth('errors.INVALID_CREDENTIALS_WITH_REMAINING', { remaining: remainingAttempts }));
          } else if (errorCode === 'ACCOUNT_LOCKED' && typeof remainingSeconds === 'number') {
            const minutes = Math.ceil(remainingSeconds / 60);
            setError(tAuth('errors.ACCOUNT_LOCKED_WITH_TIME', { minutes }));
          } else {
            // 尝试从 i18n 获取翻译
            const translatedError = tAuth(`errors.${errorCode}` as any);
            // 如果翻译不存在（返回 key 本身），则使用后端 message
            setError(translatedError.startsWith('errors.') ? data.message : translatedError);
          }
        } else {
          setError(data.message || tAuth('loginFailed'));
        }
      }
    } catch {
      setError(tAuth('networkError'));
    } finally {
      setLoading(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.7)' }}
      onClick={handleBackdropClick}
    >
      {/* Backdrop blur */}
      <div className="absolute inset-0 backdrop-blur-md" />
      
      {/* Modal - Apple 风格 */}
      <div 
        style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
        className="relative border rounded-2xl shadow-2xl w-full max-w-[420px] mx-4 overflow-hidden animate-[modalIn_0.2s_ease-out]"
      >
        {/* Close Button */}
        <button
          onClick={handleClose}
          style={{ color: colors.textSecondary }}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full hover:opacity-70 transition-colors z-10"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="p-8 pt-10 text-center">
          {/* 公司 Logo (放大 3 倍) */}
          <div className="mb-6">
            <Image 
              src="/logo.png" 
              alt="Logo" 
              width={240} 
              height={240}
              style={{ filter: colors.logoFilter }}
              className="mx-auto"
            />
          </div>

          {/* 标题 */}
          <h2 style={{ color: colors.text }} className="text-[24px] font-medium mb-6">
            {tLanding('modalTitle')}
          </h2>

          {/* 错误提示 */}
          {error && (
            <div 
              style={{ backgroundColor: `${colors.red}15`, borderColor: `${colors.red}50` }}
              className="border rounded-xl px-4 py-3 mb-4"
            >
              <p style={{ color: colors.red }} className="text-[13px]">{error}</p>
            </div>
          )}

          {/* 表单 */}
          <form onSubmit={handleSubmit} className="space-y-3">
            {/* 用户名输入框 */}
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={tAuth('username')}
              autoComplete="username"
              autoFocus
              disabled={showPassword}
              style={{ 
                backgroundColor: colors.bgTertiary, 
                borderColor: colors.border,
                color: colors.text 
              }}
              className={`w-full h-[48px] px-4 border rounded-xl text-[17px] focus:outline-none transition-all ${
                showPassword ? 'opacity-70' : 'focus:border-[#0071e3] focus:ring-1 focus:ring-[#0071e3]'
              }`}
              required
            />

            {/* 密码输入框 (Continue 后显示) */}
            {showPassword && (
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={tAuth('password')}
                autoComplete="current-password"
                autoFocus
                style={{ 
                  backgroundColor: colors.bgTertiary, 
                  borderColor: colors.border,
                  color: colors.text 
                }}
                className="w-full h-[48px] px-4 border rounded-xl text-[17px] focus:outline-none focus:border-[#0071e3] focus:ring-1 focus:ring-[#0071e3] transition-all"
                required
              />
            )}

            {/* Continue / Sign In 按钮 */}
            <button
              type="submit"
              disabled={loading}
              style={{ backgroundColor: colors.blue }}
              className="w-full h-[44px] hover:opacity-90 disabled:opacity-50 text-white text-[17px] font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : showPassword ? (
                <span>{tAuth('login')}</span>
              ) : (
                <>
                  <span>{tAuth('continue')}</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </>
              )}
            </button>
          </form>

          {/* 底部描述 - Apple 风格 */}
          <div style={{ borderColor: `${colors.border}80` }} className="mt-8 pt-6 border-t">
            <div className="flex justify-center mb-3">
              <svg style={{ color: colors.textTertiary }} className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"/>
              </svg>
            </div>
            <p style={{ color: colors.textTertiary }} className="text-[12px] leading-relaxed max-w-[320px] mx-auto">
              {tLanding('modalSubtitle')}
            </p>
          </div>
        </div>
      </div>

      {/* Animation Styles */}
      <style>{`
        @keyframes modalIn {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(10px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
