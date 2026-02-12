'use client';

import { useState, useEffect } from 'react';

export function MainContent({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const checkCollapsed = () => {
      setCollapsed(localStorage.getItem('sidebarCollapsed') === 'true');
    };
    checkCollapsed();
    const interval = setInterval(checkCollapsed, 100);
    return () => clearInterval(interval);
  }, []);

  return (
    <main 
      className={`pt-12 min-h-screen transition-all duration-200 ${
        collapsed ? 'ml-0' : 'ml-60'
      }`}
    >
      <div className="p-6">
        {children}
      </div>
    </main>
  );
}
