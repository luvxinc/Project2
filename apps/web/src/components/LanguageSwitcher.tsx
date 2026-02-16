'use client';

import { useState, useRef, useEffect, useTransition } from 'react';
import { useTheme, themeColors } from '@/contexts/ThemeContext';

type Locale = 'zh' | 'en' | 'vi';

const localeOptions: { key: Locale; label: string; short: string }[] = [
  { key: 'zh', label: '中文', short: 'ZH' },
  { key: 'en', label: 'English', short: 'EN' },
  { key: 'vi', label: 'Tiếng Việt', short: 'VI' },
];

/**
 * macOS 风格语言切换器
 * 地球图标 + 下拉菜单样式 — 紧凑且可扩展
 */
export function LanguageSwitcher({ currentLocale }: { currentLocale: Locale }) {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const colors = themeColors[theme];

  const current = localeOptions.find(o => o.key === currentLocale) || localeOptions[0];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const switchLocale = (newLocale: Locale) => {
    if (newLocale === currentLocale || isPending) return;
    setOpen(false);
    startTransition(() => {
      document.cookie = `locale=${newLocale};path=/;max-age=31536000`;
      window.location.reload();
    });
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={isPending}
        style={{ color: colors.textSecondary }}
        className="flex items-center gap-1.5 h-7 px-2 rounded-md text-[12px] font-medium transition-all hover:opacity-80 disabled:opacity-50"
      >
        <svg className="w-[15px] h-[15px] opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253M3.284 14.253A8.96 8.96 0 013 12c0-.778.099-1.533.284-2.253" />
        </svg>
        <span>{current.short}</span>
        <svg
          className={`w-2.5 h-2.5 opacity-50 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          style={{
            backgroundColor: colors.bgSecondary,
            borderColor: colors.border,
            boxShadow: theme === 'dark'
              ? '0 8px 32px rgba(0,0,0,0.5), 0 0 0 0.5px rgba(255,255,255,0.08)'
              : '0 8px 32px rgba(0,0,0,0.12), 0 0 0 0.5px rgba(0,0,0,0.06)',
          }}
          className="absolute right-0 top-full mt-1.5 min-w-[130px] rounded-lg border overflow-hidden animate-[fadeInDown_0.12s_ease-out] z-50"
        >
          {localeOptions.map(({ key, label, short }) => (
            <button
              key={key}
              onClick={() => switchLocale(key)}
              disabled={isPending}
              style={{
                backgroundColor: key === currentLocale
                  ? (theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)')
                  : 'transparent',
                color: key === currentLocale ? colors.text : colors.textSecondary,
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] transition-colors hover:opacity-80 disabled:opacity-50"
            >
              <span className="w-5 text-[11px] font-semibold opacity-50 text-center">{short}</span>
              <span className="flex-1 text-left">{label}</span>
              {key === currentLocale && (
                <svg className="w-3.5 h-3.5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}

      <style>{`
        @keyframes fadeInDown {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
