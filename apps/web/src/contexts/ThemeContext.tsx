'use client';

import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';

export type Theme = 'dark' | 'light';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

/**
 * macOS 官方系统配色完整集 (NSColor)
 * 
 * 所有颜色值均来自 Apple Human Interface Guidelines 和 NSColor 官方文档
 * 包含完整的 macOS 系统配色，便于日后扩展使用
 * 
 * 参考来源:
 * - Apple HIG: https://developer.apple.com/design/human-interface-guidelines/color
 * - NSColor Documentation: https://developer.apple.com/documentation/appkit/nscolor
 * 
 * 更新日期: 2026-02-05
 */

// ==================== macOS 官方系统色完整集 (NSColor) ====================

const colorTokens = {
  // ===== macOS 暗色模式 (Dark Appearance) =====
  dark: {
    // --- 背景层级 (Background Colors) ---
    background: {
      primary: '#000000',           // underPageBackgroundColor / textBackgroundColor
      secondary: '#1d1d21',         // windowBackgroundColor (RGB: 29, 29, 33)
      tertiary: '#2c2c2e',          // 系统卡片背景
      elevated: '#303033',          // controlColor (RGB: 48, 48, 51)
      // 扩展背景色
      controlBackground: '#1e1e1e', // controlBackgroundColor
      selectedContent: '#0a84ff',   // selectedContentBackgroundColor
      selectedText: '#0a84ff',      // selectedTextBackgroundColor
      findHighlight: '#ffff00',     // findHighlightColor
    },
    
    // --- 边框/分隔线 (Border & Separator) ---
    border: {
      primary: '#38383a',           // gridColor base
      secondary: '#48484a',         // separator variation
      separator: '#54545899',       // separatorColor: #545458 at 60% opacity
      grid: '#545458',              // gridColor
    },
    
    // --- 标签文字层级 (Label Colors) ---
    // 基础色: #EBEBF5 (RGB: 235, 235, 245)
    text: {
      primary: '#ffffff',           // labelColor (100% opacity)
      secondary: '#ebebf599',       // secondaryLabelColor (60% opacity)
      tertiary: '#ebebf54d',        // tertiaryLabelColor (30% opacity)
      quaternary: '#ebebf52e',      // quaternaryLabelColor (18% opacity)
      // 扩展文字色
      placeholder: '#ebebf54d',     // placeholderTextColor (30% opacity)
      header: '#ebebf54d',          // headerTextColor (30% opacity)
      selected: '#ffffff',          // selectedTextColor
      selectedMenu: '#ffffff',      // selectedMenuItemTextColor
      link: '#419cff',              // linkColor
      alternateSelected: '#ffffff', // alternateSelectedControlTextColor
    },
    
    // --- 系统功能色 (System Colors - Dark) ---
    system: {
      blue: '#0a84ff',
      green: '#30d158',
      red: '#ff453a',
      orange: '#ff9f0a',
      yellow: '#ffd60a',
      purple: '#bf5af2',
      pink: '#ff375f',
      teal: '#64d2ff',
      // 扩展系统色
      indigo: '#5e5ce6',
      brown: '#ac8e68',
      mint: '#66d4cf',
      cyan: '#5ac8fa',
      gray: '#8e8e93',
      gray2: '#636366',
      gray3: '#48484a',
      gray4: '#3a3a3c',
      gray5: '#2c2c2e',
      gray6: '#1c1c1e',
    },
    
    // --- 控件色 (Control Colors) ---
    control: {
      accent: '#0a84ff',            // controlAccentColor
      background: '#303033',        // controlColor
      text: '#ffffff',              // controlTextColor
      selectedControl: '#0a84ff',   // selectedControlColor
      selectedControlText: '#ffffff', // selectedControlTextColor
      disabledControlText: '#ebebf54d', // disabledControlTextColor
      scrubberBackground: '#ffffff26', // scrubberTexturedBackground
      keyboardFocus: '#1a9fff',     // keyboardFocusIndicatorColor
    },
    
    // --- 交互状态 ---
    interaction: {
      hover: 'rgba(255, 255, 255, 0.08)',
      active: 'rgba(255, 255, 255, 0.12)',
      focus: 'rgba(10, 132, 255, 0.3)',
      highlight: '#b4d7ff',         // highlightColor
    },
    
    // --- 特殊效果色 ---
    effect: {
      shadow: 'rgba(0, 0, 0, 0.5)', // shadowColor
      unemphasizedSelected: '#464646', // unemphasizedSelectedContentBackgroundColor
    },
    
    // --- Logo 配置 ---
    logo: {
      filter: 'none',
    },
  },
  
  // ===== macOS 亮色模式 (Light Appearance) =====
  light: {
    // --- 背景层级 (Background Colors) ---
    background: {
      primary: '#f2f2f7',           // windowBackgroundColor (RGB: 242, 242, 247)
      secondary: '#ffffff',         // textBackgroundColor / controlColor
      tertiary: '#f2f2f7',          // 输入框背景
      elevated: '#ffffff',          // 悬浮层
      // 扩展背景色
      controlBackground: '#ffffff', // controlBackgroundColor
      selectedContent: '#007aff',   // selectedContentBackgroundColor
      selectedText: '#b4d7ff',      // selectedTextBackgroundColor
      findHighlight: '#ffff00',     // findHighlightColor
    },
    
    // --- 边框/分隔线 (Border & Separator) ---
    border: {
      primary: '#c6c6c8',           // gridColor variation
      secondary: '#d4d4d9',         // underPageBackgroundColor (RGB: 212, 212, 217)
      separator: '#3c3c4338',       // separatorColor: #3C3C43 at 22% opacity
      grid: '#e6e6e6',              // gridColor
    },
    
    // --- 标签文字层级 (Label Colors) ---
    // 基础色: #3C3C43 (RGB: 60, 60, 67)
    text: {
      primary: '#000000',           // labelColor / textColor (100% opacity)
      secondary: '#3c3c4399',       // secondaryLabelColor (60% opacity)
      tertiary: '#3c3c434d',        // tertiaryLabelColor (30% opacity)
      quaternary: '#3c3c432e',      // quaternaryLabelColor (18% opacity)
      // 扩展文字色
      placeholder: '#3c3c434d',     // placeholderTextColor (30% opacity)
      header: '#3c3c434d',          // headerTextColor (30% opacity)
      selected: '#ffffff',          // selectedTextColor
      selectedMenu: '#ffffff',      // selectedMenuItemTextColor
      link: '#0068da',              // linkColor
      alternateSelected: '#ffffff', // alternateSelectedControlTextColor
    },
    
    // --- 系统功能色 (System Colors - Light) ---
    system: {
      blue: '#007aff',
      green: '#34c759',
      red: '#ff3b30',
      orange: '#ff9500',
      yellow: '#ffcc00',
      purple: '#af52de',
      pink: '#ff2d55',
      teal: '#5ac8fa',
      // 扩展系统色
      indigo: '#5856d6',
      brown: '#a2845e',
      mint: '#00c7be',
      cyan: '#32ade6',
      gray: '#8e8e93',
      gray2: '#aeaeb2',
      gray3: '#c7c7cc',
      gray4: '#d1d1d6',
      gray5: '#e5e5ea',
      gray6: '#f2f2f7',
    },
    
    // --- 控件色 (Control Colors) ---
    control: {
      accent: '#007aff',            // controlAccentColor
      background: '#ffffff',        // controlColor
      text: '#000000',              // controlTextColor
      selectedControl: '#b4d7ff',   // selectedControlColor
      selectedControlText: '#000000', // selectedControlTextColor
      disabledControlText: '#3c3c434d', // disabledControlTextColor
      scrubberBackground: '#00000026', // scrubberTexturedBackground
      keyboardFocus: '#007aff',     // keyboardFocusIndicatorColor
    },
    
    // --- 交互状态 ---
    interaction: {
      hover: 'rgba(0, 0, 0, 0.04)',
      active: 'rgba(0, 0, 0, 0.08)',
      focus: 'rgba(0, 122, 255, 0.25)',
      highlight: '#b4d7ff',         // highlightColor
    },
    
    // --- 特殊效果色 ---
    effect: {
      shadow: 'rgba(0, 0, 0, 0.2)', // shadowColor (lighter in light mode)
      unemphasizedSelected: '#dcdcdc', // unemphasizedSelectedContentBackgroundColor
    },
    
    // --- Logo 配置 ---
    logo: {
      filter: 'invert(1)',
    },
  },
};

// ==================== 扁平化导出 (组件常用色) ====================

export const themeColors = {
  dark: {
    // 背景
    bg: colorTokens.dark.background.primary,
    bgSecondary: colorTokens.dark.background.secondary,
    bgTertiary: colorTokens.dark.background.tertiary,
    bgElevated: colorTokens.dark.background.elevated,
    // 边框
    border: colorTokens.dark.border.primary,
    borderLight: colorTokens.dark.border.secondary,
    separator: colorTokens.dark.border.separator,
    // 文字
    text: colorTokens.dark.text.primary,
    textSecondary: colorTokens.dark.text.secondary,
    textTertiary: colorTokens.dark.text.tertiary,
    textQuaternary: colorTokens.dark.text.quaternary,
    textPlaceholder: colorTokens.dark.text.placeholder,
    textLink: colorTokens.dark.text.link,
    // 系统色
    blue: colorTokens.dark.system.blue,
    red: colorTokens.dark.system.red,
    green: colorTokens.dark.system.green,
    orange: colorTokens.dark.system.orange,
    yellow: colorTokens.dark.system.yellow,
    purple: colorTokens.dark.system.purple,
    pink: colorTokens.dark.system.pink,
    teal: colorTokens.dark.system.teal,
    indigo: colorTokens.dark.system.indigo,
    brown: colorTokens.dark.system.brown,
    mint: colorTokens.dark.system.mint,
    cyan: colorTokens.dark.system.cyan,
    // 灰度
    gray: colorTokens.dark.system.gray,
    gray2: colorTokens.dark.system.gray2,
    gray3: colorTokens.dark.system.gray3,
    gray4: colorTokens.dark.system.gray4,
    gray5: colorTokens.dark.system.gray5,
    gray6: colorTokens.dark.system.gray6,
    // 控件
    controlAccent: colorTokens.dark.control.accent,
    controlText: colorTokens.dark.control.text,
    disabledText: colorTokens.dark.control.disabledControlText,
    // 交互
    hover: colorTokens.dark.interaction.hover,
    active: colorTokens.dark.interaction.active,
    focus: colorTokens.dark.interaction.focus,
    highlight: colorTokens.dark.interaction.highlight,
    // 效果
    shadow: colorTokens.dark.effect.shadow,
    // Logo
    logoFilter: colorTokens.dark.logo.filter,
    // 固定对比色
    white: '#ffffff',
    black: '#000000',
    // iOS Switch 控件
    switchTrack: '#39393d',               // iOS switch inactive track (dark)
    switchTrackDisabled: '#1c1c1e',       // iOS switch disabled track (dark)
    // iOS Segment 控件
    segmentBg: '#39393d',                 // segment inactive background (dark)
    segmentIndicator: '#ffffff',          // segment active indicator (dark)
    segmentText: '#1d1d1f',               // segment active text on white pill (dark)
    // macOS 标准色板 (用于角色/部门选色器)
    palette: [
      '#8e8e93',  // systemGray
      '#64d2ff',  // systemCyan (dark)
      '#30d158',  // systemGreen (dark)
      '#ff9f0a',  // systemOrange (dark)
      '#ff453a',  // systemRed (dark)
      '#bf5af2',  // systemPurple (dark)
      '#ff375f',  // systemPink (dark)
      '#5e5ce6',  // systemIndigo (dark)
      '#ff9500',  // iOS orange
      '#ac8e68',  // systemBrown (dark)
    ] as string[],
    // Valve Wireframe 动画色 (canvas 2D)
    wireframe: {
      expandedWire: '#a8b4c4',     expandedHighlight: '#dce3ed',
      crimpingWire: '#f0b429',     crimpingHighlight: '#fde68a',
      crimpedWire: '#5ecea0',      crimpedHighlight: '#a7f3d0',
      expandingWire: '#b8a4f0',    expandingHighlight: '#ddd6fe',
      dimension: '#6baaec',
      successStroke: '#5ecea0',
    },
    // 设备边框
    deviceBorder: '#555b65',
  },
  light: {
    // 背景
    bg: colorTokens.light.background.primary,
    bgSecondary: colorTokens.light.background.secondary,
    bgTertiary: colorTokens.light.background.tertiary,
    bgElevated: colorTokens.light.background.elevated,
    // 边框
    border: colorTokens.light.border.primary,
    borderLight: colorTokens.light.border.secondary,
    separator: colorTokens.light.border.separator,
    // 文字
    text: colorTokens.light.text.primary,
    textSecondary: colorTokens.light.text.secondary,
    textTertiary: colorTokens.light.text.tertiary,
    textQuaternary: colorTokens.light.text.quaternary,
    textPlaceholder: colorTokens.light.text.placeholder,
    textLink: colorTokens.light.text.link,
    // 系统色
    blue: colorTokens.light.system.blue,
    red: colorTokens.light.system.red,
    green: colorTokens.light.system.green,
    orange: colorTokens.light.system.orange,
    yellow: colorTokens.light.system.yellow,
    purple: colorTokens.light.system.purple,
    pink: colorTokens.light.system.pink,
    teal: colorTokens.light.system.teal,
    indigo: colorTokens.light.system.indigo,
    brown: colorTokens.light.system.brown,
    mint: colorTokens.light.system.mint,
    cyan: colorTokens.light.system.cyan,
    // 灰度
    gray: colorTokens.light.system.gray,
    gray2: colorTokens.light.system.gray2,
    gray3: colorTokens.light.system.gray3,
    gray4: colorTokens.light.system.gray4,
    gray5: colorTokens.light.system.gray5,
    gray6: colorTokens.light.system.gray6,
    // 控件
    controlAccent: colorTokens.light.control.accent,
    controlText: colorTokens.light.control.text,
    disabledText: colorTokens.light.control.disabledControlText,
    // 交互
    hover: colorTokens.light.interaction.hover,
    active: colorTokens.light.interaction.active,
    focus: colorTokens.light.interaction.focus,
    highlight: colorTokens.light.interaction.highlight,
    // 效果
    shadow: colorTokens.light.effect.shadow,
    // Logo
    logoFilter: colorTokens.light.logo.filter,
    // 固定对比色
    white: '#ffffff',
    black: '#000000',
    // iOS Switch 控件
    switchTrack: '#e9e9eb',               // iOS switch inactive track (light)
    switchTrackDisabled: '#f0f0f0',       // iOS switch disabled track (light)
    // iOS Segment 控件
    segmentBg: '#e8e8ed',                 // segment inactive background (light)
    segmentIndicator: '#1d1d1f',          // segment active indicator dark pill (light)
    segmentText: '#ffffff',               // segment active text on dark pill (light)
    // macOS 标准色板 (用于角色/部门选色器)
    palette: [
      '#8e8e93',  // systemGray
      '#32ade6',  // systemCyan (light)
      '#34c759',  // systemGreen (light)
      '#ff9500',  // systemOrange (light)
      '#ff3b30',  // systemRed (light)
      '#af52de',  // systemPurple (light)
      '#ff2d55',  // systemPink (light)
      '#5856d6',  // systemIndigo (light)
      '#ff9f0a',  // iOS orange vibrant
      '#a2845e',  // systemBrown (light)
    ] as string[],
    // Valve Wireframe 动画色 (canvas 2D)
    wireframe: {
      expandedWire: '#5a6475',     expandedHighlight: '#c1cbda',
      crimpingWire: '#b45309',     crimpingHighlight: '#fbbf24',
      crimpedWire: '#047857',      crimpedHighlight: '#6ee7b7',
      expandingWire: '#6d28d9',    expandingHighlight: '#a78bfa',
      dimension: '#2a7ade',
      successStroke: '#047857',
    },
    // 设备边框
    deviceBorder: '#a0a5b0',
  },
};

// 导出完整 token 供高级用途
export { colorTokens };

// ==================== Provider ====================

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Always start with 'dark' to match SSR — avoids hydration mismatch.
  // The real theme is loaded from localStorage in the useEffect below.
  const [theme, setThemeState] = useState<Theme>('dark');
  const mountedRef = useRef(false);

  // After hydration: read the real user preference from localStorage
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark' || savedTheme === 'light') {
      setThemeState(savedTheme);
    } else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
      setThemeState('light');
    }
    mountedRef.current = true;
  }, []);

  useEffect(() => {
    // Only persist after initial mount — prevents SSR default 'dark' from
    // overwriting the user's saved theme before the mount effect reads it.
    if (!mountedRef.current) return;

    localStorage.setItem('theme', theme);
    document.documentElement.classList.remove('theme-dark', 'theme-light');
    document.documentElement.classList.add(`theme-${theme}`);

    // 同步更新 CSS 变量
    const colors = themeColors[theme];
    const root = document.documentElement;
    root.style.setProperty('--color-bg', colors.bg);
    root.style.setProperty('--color-bg-secondary', colors.bgSecondary);
    root.style.setProperty('--color-bg-tertiary', colors.bgTertiary);
    root.style.setProperty('--color-text', colors.text);
    root.style.setProperty('--color-text-secondary', colors.textSecondary);
    root.style.setProperty('--color-border', colors.border);
    root.style.setProperty('--color-blue', colors.blue);
    root.style.setProperty('--color-shadow', colors.shadow);
    root.style.setProperty('--logo-filter', colors.logoFilter);
  }, [theme]);

  const toggleTheme = () => {
    setThemeState(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

export function useThemeColors() {
  const { theme } = useTheme();
  return themeColors[theme];
}
