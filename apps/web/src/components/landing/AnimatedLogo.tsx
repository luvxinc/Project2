'use client';

import { useEffect, useRef } from 'react';
import { animate } from 'animejs';
import Image from 'next/image';
import { useTranslations } from 'next-intl';

interface OrbitingIconsProps {
  size?: number;
  className?: string;
  onClick?: () => void;
}

// 8 个功能模块 (对应导航栏)
const ORBIT_ITEMS = [
  { 
    id: 'sales', 
    i18nKey: 'sales.title',
    icon: (iconSize: number) => (
      <svg className="text-white" style={{ width: iconSize, height: iconSize }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
    gradient: 'from-[#0a84ff] to-[#64d2ff]',
  },
  { 
    id: 'purchase', 
    i18nKey: 'purchase.title',
    icon: (iconSize: number) => (
      <svg className="text-white" style={{ width: iconSize, height: iconSize }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
      </svg>
    ),
    gradient: 'from-[#34c759] to-[#30d158]',
  },
  { 
    id: 'inventory', 
    i18nKey: 'inventory.title',
    icon: (iconSize: number) => (
      <svg className="text-white" style={{ width: iconSize, height: iconSize }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
      </svg>
    ),
    gradient: 'from-[#ff9f0a] to-[#ff9500]',
  },
  { 
    id: 'finance', 
    i18nKey: 'finance.title',
    icon: (iconSize: number) => (
      <svg className="text-white" style={{ width: iconSize, height: iconSize }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    gradient: 'from-[#5e5ce6] to-[#bf5af2]',
  },
  { 
    id: 'products', 
    i18nKey: 'products.title',
    icon: (iconSize: number) => (
      <svg className="text-white" style={{ width: iconSize, height: iconSize }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
      </svg>
    ),
    gradient: 'from-[#ff375f] to-[#ff6482]',
  },
  { 
    id: 'users', 
    i18nKey: 'users.title',
    icon: (iconSize: number) => (
      <svg className="text-white" style={{ width: iconSize, height: iconSize }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    ),
    gradient: 'from-[#ac8e68] to-[#c4a77d]',
  },
  { 
    id: 'db_admin', 
    i18nKey: 'db_admin.title',
    icon: (iconSize: number) => (
      <svg className="text-white" style={{ width: iconSize, height: iconSize }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
      </svg>
    ),
    gradient: 'from-[#8e8e93] to-[#636366]',
  },
  { 
    id: 'logs', 
    i18nKey: 'logs.title',
    icon: (iconSize: number) => (
      <svg className="text-white" style={{ width: iconSize, height: iconSize }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
    gradient: 'from-[#30d158] to-[#34c759]',
  },
];

/**
 * iCloud 风格旋转轨道组件
 * 
 * - 中心 Logo (z-20, 最上层)
 * - 周围 8 个模块 Icons + 文字 (z-10, 下层)
 * - 12 秒旋转一圈
 */
export function AnimatedLogo({ size = 840, className = '', onClick }: OrbitingIconsProps) {
  const tModules = useTranslations('modules');
  const orbitRef = useRef<HTMLDivElement>(null);
  const iconRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (!orbitRef.current) return;

    // 轨道旋转 (12秒一圈)
    const orbitAnim = animate(orbitRef.current, {
      rotate: '1turn',
      duration: 12000,
      ease: 'linear',
      loop: true,
    });

    // Icons 反向旋转保持正向
    const iconAnims = iconRefs.current.filter(Boolean).map(icon => 
      animate(icon!, {
        rotate: '-1turn',
        duration: 12000,
        ease: 'linear',
        loop: true,
      })
    );

    return () => {
      orbitAnim.pause();
      iconAnims.forEach(a => a.pause());
    };
  }, []);

  // 尺寸计算
  const logoWidth = size * 0.5;
  const logoHeight = logoWidth / 5.8;
  const orbitRadius = size * 0.28;
  const iconContainerSize = size * 0.16;
  const innerIconSize = iconContainerSize * 0.45;  // 内部图标
  const fontSize = iconContainerSize * 0.16;       // 文字大小

  return (
    <div 
      className={`relative ${className}`}
      style={{ width: size, height: size }}
    >
      {/* 发光背景 */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(circle at center, rgba(94,92,230,0.25) 0%, transparent 40%),
            radial-gradient(circle at center, rgba(191,90,242,0.15) 20%, transparent 50%)
          `,
          filter: 'blur(40px)',
        }}
      />

      {/* 轨道线 (装饰性) */}
      <div 
        className="absolute rounded-full border border-[rgba(255,255,255,0.06)]"
        style={{
          width: orbitRadius * 2,
          height: orbitRadius * 2,
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        }}
      />

      {/* 旋转轨道容器 (z-10, 下层) */}
      <div 
        ref={orbitRef}
        className="absolute z-10"
        style={{
          width: orbitRadius * 2,
          height: orbitRadius * 2,
          top: '50%',
          left: '50%',
          marginLeft: -orbitRadius,
          marginTop: -orbitRadius,
        }}
      >
        {/* 轨道上的 Icons + 文字 */}
        {ORBIT_ITEMS.map((item, i) => {
          const angle = (i / ORBIT_ITEMS.length) * 360 - 90; // 从顶部开始
          const radian = (angle * Math.PI) / 180;
          const x = orbitRadius + orbitRadius * Math.cos(radian) - iconContainerSize / 2;
          const y = orbitRadius + orbitRadius * Math.sin(radian) - iconContainerSize / 2;

          return (
            <div
              key={item.id}
              ref={el => { iconRefs.current[i] = el; }}
              className="absolute flex flex-col items-center"
              style={{
                left: x,
                top: y,
                width: iconContainerSize,
              }}
            >
              {/* Icon 容器 */}
              <div 
                className={`rounded-2xl bg-gradient-to-br ${item.gradient} flex items-center justify-center shadow-lg`}
                style={{
                  width: iconContainerSize,
                  height: iconContainerSize,
                  boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                }}
              >
                {item.icon(innerIconSize)}
              </div>
              {/* Label (i18n) */}
              <div 
                className="text-white/80 mt-2 whitespace-nowrap font-medium text-center"
                style={{ fontSize }}
              >
                {tModules(item.i18nKey)}
              </div>
            </div>
          );
        })}
      </div>

      {/* 中心 Logo (z-20, 最上层) */}
      <div 
        className="absolute z-20 cursor-pointer"
        style={{
          width: logoWidth,
          height: logoHeight,
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        }}
        onClick={onClick}
      >
        <Image 
          src="/logo.png"
          alt="ESPLUS Logo"
          fill
          className="object-contain drop-shadow-[0_0_40px_rgba(255,255,255,0.5)]"
          priority
        />
      </div>
    </div>
  );
}
