'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';

export default function DashboardPage() {
  const tHome = useTranslations('home');
  const { theme } = useTheme();
  const colors = themeColors[theme];

  const [username, setUsername] = useState('');
  const [userRole, setUserRole] = useState('');
  const [lastLogin, setLastLogin] = useState('');

  // Time-of-day greeting
  const getGreetingKey = (): 'morning' | 'afternoon' | 'evening' => {
    const hour = new Date().getHours();
    if (hour < 12) return 'morning';
    if (hour < 18) return 'afternoon';
    return 'evening';
  };

  const [greetingKey, setGreetingKey] = useState<'morning' | 'afternoon' | 'evening'>('morning');

  useEffect(() => {
    setGreetingKey(getGreetingKey());

    try {
      const stored = localStorage.getItem('user');
      if (stored) {
        const user = JSON.parse(stored);
        setUsername(user.displayName || user.username || '');
        const roles: string[] = user.roles || [];
        setUserRole(roles[0] || '');
        if (user.lastLoginAt) {
          setLastLogin(new Date(user.lastLoginAt).toLocaleString());
        }
      }
    } catch { /* ignore */ }

    // Listen for global permission sync events from AuthSessionGuard
    const handleUserUpdated = () => {
      try {
        const stored = localStorage.getItem('user');
        if (!stored) return;
        const user = JSON.parse(stored);
        setUsername(user.displayName || user.username || '');
        const roles: string[] = user.roles || [];
        setUserRole(roles[0] || '');
      } catch { /* ignore */ }
    };
    window.addEventListener('mgmt:user-updated', handleUserUpdated);
    return () => window.removeEventListener('mgmt:user-updated', handleUserUpdated);
  }, []);

  return (
    <div style={{ backgroundColor: colors.bg }} className="min-h-screen">
      {/* Hero */}
      <section className="pt-16 pb-8 text-center">
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

      {/* Greeting + Environment (V1 style) */}
      <section className="py-12">
        <div className="max-w-[720px] mx-auto px-6">
          {/* Greeting Card */}
          <div 
            style={{ 
              backgroundColor: colors.bgSecondary, 
              borderColor: colors.border 
            }}
            className="rounded-2xl border p-8 mb-6"
          >
            <div className="text-center mb-6">
              <h2 style={{ color: colors.text }} className="text-[32px] font-semibold mb-2">
                {tHome(`greeting.${greetingKey}`)}
                {username && (
                  <span style={{ color: colors.blue }}>{`, ${username}`}</span>
                )}
              </h2>
              {userRole && (
                <p style={{ color: colors.textSecondary }} className="text-[15px]">
                  {tHome('greeting.role', { role: userRole })}
                </p>
              )}
            </div>

            {lastLogin && (
              <div className="flex items-center justify-center gap-2 mb-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[#30d158]" />
                <span style={{ color: colors.textTertiary }} className="text-[13px]">
                  {tHome('greeting.lastLogin', { time: lastLogin })}
                </span>
              </div>
            )}
            <div className="flex items-center justify-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-[#30d158] animate-pulse" />
              <span style={{ color: colors.textTertiary }} className="text-[13px]">
                {tHome('greeting.sessionActive')}
              </span>
            </div>
          </div>

          {/* Environment Info */}
          <div 
            style={{ 
              backgroundColor: colors.bgSecondary, 
              borderColor: colors.border 
            }}
            className="rounded-2xl border p-6"
          >
            <h3 style={{ color: colors.text }} className="text-[15px] font-semibold mb-4">
              {tHome('environment.title')}
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span style={{ color: colors.textSecondary }} className="text-[13px]">{tHome('environment.version')}</span>
                <span style={{ color: colors.text }} className="text-[13px] font-medium">V3.0</span>
              </div>
              <div style={{ borderColor: `${colors.border}50` }} className="border-t" />
              <div className="flex items-center justify-between">
                <span style={{ color: colors.textSecondary }} className="text-[13px]">{tHome('environment.server')}</span>
                <span className="text-[13px] font-medium text-[#30d158] flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#30d158] animate-pulse inline-block" />
                  {tHome('environment.serverOnline')}
                </span>
              </div>
              <div style={{ borderColor: `${colors.border}50` }} className="border-t" />
              <div className="flex items-center justify-between">
                <span style={{ color: colors.textSecondary }} className="text-[13px]">{tHome('environment.database')}</span>
                <span style={{ color: colors.blue }} className="text-[13px] font-medium flex items-center gap-1.5">
                  <span style={{ backgroundColor: colors.blue }} className="w-1.5 h-1.5 rounded-full inline-block" />
                  {tHome('environment.dbConnected')}
                </span>
              </div>
              <div style={{ borderColor: `${colors.border}50` }} className="border-t" />
              <div className="flex items-center justify-between">
                <span style={{ color: colors.textSecondary }} className="text-[13px]">{tHome('environment.timezone')}</span>
                <span style={{ color: colors.text }} className="text-[13px] font-medium">
                  {Intl.DateTimeFormat().resolvedOptions().timeZone}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderColor: `${colors.border}50` }} className="py-6 border-t">
        <div className="max-w-[980px] mx-auto px-6">
          <p style={{ color: colors.textTertiary }} className="text-[11px] text-center">
            {tHome('footer.brand')}
          </p>
        </div>
      </footer>
    </div>
  );
}

