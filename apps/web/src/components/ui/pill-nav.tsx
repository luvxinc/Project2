'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { useTheme, themeColors } from '@/contexts/ThemeContext';

interface PillNavStep {
  key: string;
  label: string;
}

interface PillNavProps {
  steps: PillNavStep[];
  activeStep: string;
  onStepChange: (key: string) => void;
  completedSteps?: string[];
}

export function PillNav({ steps, activeStep, onStepChange, completedSteps = [] }: PillNavProps) {
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [pillPos, setPillPos] = useState({ left: 0, width: 100 });
  const [ready, setReady] = useState(false);

  const currentIndex = steps.findIndex(s => s.key === activeStep);

  const updatePillPosition = useCallback(() => {
    const container = containerRef.current;
    const button = buttonRefs.current[currentIndex];
    if (!container || !button) return;
    const containerRect = container.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    setPillPos({
      left: buttonRect.left - containerRect.left,
      width: buttonRect.width,
    });
  }, [currentIndex]);

  useEffect(() => {
    const timer = setTimeout(() => {
      updatePillPosition();
      setReady(true);
    }, 50);
    return () => clearTimeout(timer);
  }, [updatePillPosition]);

  useEffect(() => {
    updatePillPosition();
  }, [currentIndex, updatePillPosition]);

  useEffect(() => {
    window.addEventListener('resize', updatePillPosition);
    return () => window.removeEventListener('resize', updatePillPosition);
  }, [updatePillPosition]);

  const handleClick = (step: PillNavStep, index: number) => {
    if (step.key === activeStep) return;
    // Only allow clicking COMPLETED steps (going back to modify)
    // Forward navigation is handled by Next/Submit buttons, NOT by clicking pills
    if (!completedSteps.includes(step.key)) return;

    const button = buttonRefs.current[index];
    const container = containerRef.current;
    if (button && container) {
      const containerRect = container.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      setPillPos({
        left: buttonRect.left - containerRect.left,
        width: buttonRect.width,
      });
    }
    onStepChange(step.key);
  };

  return (
    <div
      ref={containerRef}
      className="relative inline-flex items-center rounded-full"
      style={{
        backgroundColor: colors.gray5,
        padding: '3px',
      }}
    >
      <div
        className="absolute rounded-full"
        style={{
          top: '3px',
          bottom: '3px',
          left: `${pillPos.left}px`,
          width: `${pillPos.width}px`,
          backgroundColor: colors.text,
          transition: ready
            ? 'left 0.3s cubic-bezier(0.25, 0.1, 0.25, 1), width 0.15s ease'
            : 'none',
          zIndex: 1,
        }}
      />

      {steps.map((step, index) => {
        const isActive = activeStep === step.key;
        const isCompleted = completedSteps.includes(step.key);
        // Only completed steps are clickable (go back to modify)
        // Future uncompleted steps are NOT clickable — use Next button to advance
        const isClickable = isCompleted;

        return (
          <button
            key={step.key}
            type="button"
            ref={el => { buttonRefs.current[index] = el; }}
            onClick={() => handleClick(step, index)}
            className="relative rounded-full select-none whitespace-nowrap"
            style={{
              zIndex: 2,
              padding: '8px 20px',
              color: isActive
                ? colors.bg
                : isClickable
                  ? (theme === 'dark' ? 'rgba(255,255,255,0.5)' : colors.gray)
                  : (theme === 'dark' ? 'rgba(255,255,255,0.25)' : `${colors.gray}80`),
              fontSize: '13px',
              fontWeight: 500,
              fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
              transition: 'color 0.2s ease',
              cursor: isClickable ? 'pointer' : 'default',
              background: 'transparent',
              border: 'none',
            }}
          >
            {isCompleted && !isActive && (
              <span className="mr-1" style={{ color: colors.green }}>&#10003;</span>
            )}
            {step.label}
          </button>
        );
      })}
    </div>
  );
}
