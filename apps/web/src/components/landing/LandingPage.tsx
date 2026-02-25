'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import Link from 'next/link';
import { animate, stagger, createScope } from 'animejs';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { LoginModal } from '@/components/modal/LoginModal';
import { AnimatedLogo } from './AnimatedLogo';

interface LandingPageProps {
  locale: 'zh' | 'en' | 'vi';
}

export function LandingPage({ locale }: LandingPageProps) {
  const tLanding = useTranslations('landing');
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [logoOpacity, setLogoOpacity] = useState(0);
  const featureRef = useRef<HTMLDivElement>(null);
  const scopeRef = useRef<ReturnType<typeof createScope> | null>(null);

  // 入场淡入动画
  useEffect(() => {
    const timer = setTimeout(() => setLogoOpacity(1), 100);
    return () => clearTimeout(timer);
  }, []);

  // Anime.js 功能模块 stagger 动画
  useEffect(() => {
    if (!featureRef.current) return;
    
    scopeRef.current = createScope({ root: featureRef }).add(() => {
      // 标题淡入
      animate('.feature-title', {
        opacity: [0, 1],
        translateY: [20, 0],
        duration: 800,
        delay: 200,
        ease: 'out(3)',
      });
      
      // 描述淡入
      animate('.feature-desc', {
        opacity: [0, 1],
        translateY: [20, 0],
        duration: 800,
        delay: 400,
        ease: 'out(3)',
      });
      
      // 模块卡片 stagger 动画
      animate('.module-card', {
        opacity: [0, 1],
        translateY: [40, 0],
        scale: [0.9, 1],
        duration: 600,
        delay: stagger(100, { start: 600 }),
        ease: 'out(3)',
      });
      
      // 图标弹跳效果
      animate('.module-icon', {
        scale: [0.5, 1],
        rotate: [-10, 0],
        duration: 400,
        delay: stagger(100, { start: 800 }),
        ease: 'out(4)',
      });
    });
    
    return () => {
      scopeRef.current?.revert();
    };
  }, []);


  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* 左上角 Logo (放大 3 倍) */}
      <div className="fixed top-5 left-6 z-40">
        <Image 
          src="/logo.png" 
          alt="Logo" 
          width={120} 
          height={120} 
          className="opacity-80"
        />
      </div>

      {/* 右上角语言切换 */}
      <div className="fixed top-5 right-6 z-40">
        <LanguageSwitcher currentLocale={locale} />
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 pt-8">
        {/* iCloud 风格: 中央 Logo + 旋转轨道 Icons */}
        <div 
          className="mb-8 transition-opacity duration-700 ease-out"
          style={{ opacity: logoOpacity }}
        >
          {/* 旋转轨道组件 (Logo + Icons) */}
          <AnimatedLogo 
            size={840} 
            onClick={() => setShowLoginModal(true)}
            className="relative z-10"
          />
        </div>

        {/* Sign In 按钮 (iCloud 风格 - 带箭头的链接) */}
        <button
          onClick={() => setShowLoginModal(true)}
          className="group mb-8 flex items-center gap-1 text-[21px] text-[#2997ff] hover:underline transition-all"
          style={{ opacity: logoOpacity }}
        >
          <span>{tLanding('signIn')}</span>
          <svg 
            className="w-5 h-5 transition-transform group-hover:translate-x-0.5" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24" 
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* 简洁的标题和描述 (无框体) */}
        <div 
          ref={featureRef}
          className="text-center max-w-[700px] mb-12"
          style={{ opacity: logoOpacity }}
        >
          <h3 className="feature-title text-[28px] font-semibold text-white mb-4">
            {tLanding('heroTitle')}
          </h3>
          <p className="feature-desc text-[15px] text-[rgba(255,255,255,0.65)] leading-relaxed">
            {tLanding('heroDesc')}
          </p>
        </div>
      </main>

      {/* Footer (iCloud 风格) */}
      <footer className="py-6 px-6">
        <div className="max-w-[800px] mx-auto">
          {/* 分隔线 */}
          <div className="border-t border-[#424245]/30 mb-4" />
          
          {/* 底部链接 */}
          <div className="flex flex-wrap justify-center gap-4 text-[11px] text-[#6e6e73] mb-3">
            <span>{tLanding('brand')}</span>
            <span>·</span>
            <span>{tLanding('tagline')}</span>
            <span>·</span>
            <Link href="#" className="hover:text-white transition-colors">
              {tLanding('privacy')}
            </Link>
            <span>·</span>
            <Link href="#" className="hover:text-white transition-colors">
              {tLanding('terms')}
            </Link>
          </div>
          
          <p className="text-[11px] text-[#6e6e73] text-center">
            {tLanding('copyright')}
          </p>
        </div>
      </footer>

      {/* Login Modal */}
      <LoginModal 
        isOpen={showLoginModal} 
        onClose={() => setShowLoginModal(false)}
        locale={locale}
      />

      {/* Scrollbar Styles */}
      <style>{`
        .timeline-scroll::-webkit-scrollbar {
          width: 6px;
        }
        .timeline-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .timeline-scroll::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 3px;
        }
        .timeline-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </div>
  );
}
