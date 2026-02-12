'use client';

import { useTheme, themeColors } from '@/contexts/ThemeContext';

export function ThemedBackground({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const colors = themeColors[theme];

  return (
    <div style={{ backgroundColor: colors.bg, minHeight: '100vh' }}>
      {children}
    </div>
  );
}
