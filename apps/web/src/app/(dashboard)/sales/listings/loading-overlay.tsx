'use client';

import { useState, useEffect } from 'react';

// ═══════════════════════════════════════════════════
// Loading Overlay with elapsed timer
// ═══════════════════════════════════════════════════

interface LoadingOverlayProps {
  accentColor: string;
  isAllSellers: boolean;
  message?: string;
}

export function LoadingOverlay({ accentColor, isAllSellers, message }: LoadingOverlayProps) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const est = isAllSellers ? '~30-60s' : '~15-30s';
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className="w-12 h-12 rounded-full border-4 border-t-transparent animate-spin mb-4"
        style={{ borderColor: `${accentColor}40`, borderTopColor: accentColor }}
      />
      <span className="text-white text-[15px] font-medium">
        {message}
      </span>
      <span className="text-white/60 text-[13px] mt-2 tabular-nums">
        {elapsed}s · Est. {est}
      </span>
    </div>
  );
}
