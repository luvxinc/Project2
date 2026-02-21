'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useTheme, themeColors } from '@/contexts/ThemeContext';

/**
 * SkuAutocomplete — Custom autocomplete replacing native <datalist>.
 * Shows max 5 items at a time with scroll + keyboard navigation.
 */

interface SkuOption {
  sku: string;
  name?: string;
}

interface SkuAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  options: SkuOption[];
  placeholder?: string;
  disabled?: boolean;
  hasError?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

const VISIBLE_COUNT = 5;
const ITEM_HEIGHT = 32; // px per row

export default function SkuAutocomplete({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  hasError,
  className,
  style,
}: SkuAutocompleteProps) {
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  // Filter options based on current input
  const filtered = value.trim()
    ? options.filter(
        (o) =>
          o.sku.toUpperCase().includes(value.toUpperCase()) ||
          (o.name && o.name.toUpperCase().includes(value.toUpperCase()))
      )
    : options;

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const el = listRef.current.children[activeIndex] as HTMLElement;
      if (el) el.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  const selectItem = useCallback(
    (sku: string) => {
      onChange(sku.toUpperCase());
      setIsOpen(false);
      setActiveIndex(-1);
    },
    [onChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        setIsOpen(true);
        setActiveIndex(0);
        e.preventDefault();
        return;
      }
      if (!isOpen) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setActiveIndex((prev) => Math.min(prev + 1, filtered.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setActiveIndex((prev) => Math.max(prev - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (activeIndex >= 0 && activeIndex < filtered.length) {
            selectItem(filtered[activeIndex].sku);
          }
          break;
        case 'Escape':
          setIsOpen(false);
          setActiveIndex(-1);
          break;
      }
    },
    [isOpen, activeIndex, filtered, selectItem]
  );

  const dropdownMaxHeight = VISIBLE_COUNT * ITEM_HEIGHT;

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value.toUpperCase());
          setIsOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
        style={{
          ...style,
          borderColor: hasError ? colors.red : (style?.borderColor || colors.border),
        }}
      />

      {isOpen && filtered.length > 0 && !disabled && (
        <div
          ref={listRef}
          className="absolute z-50 left-0 right-0 mt-1 rounded-lg border shadow-lg overflow-y-auto"
          style={{
            maxHeight: dropdownMaxHeight,
            backgroundColor: colors.bgSecondary,
            borderColor: colors.border,
          }}
        >
          {filtered.map((opt, idx) => (
            <div
              key={opt.sku}
              className="flex items-center justify-between px-2.5 cursor-pointer transition-colors"
              style={{
                height: ITEM_HEIGHT,
                backgroundColor: idx === activeIndex ? `${colors.blue}18` : 'transparent',
                color: idx === activeIndex ? colors.blue : colors.text,
              }}
              onMouseEnter={() => setActiveIndex(idx)}
              onMouseDown={(e) => {
                e.preventDefault(); // prevent blur
                selectItem(opt.sku);
              }}
            >
              <span className="text-xs font-mono font-medium truncate">{opt.sku}</span>
              {opt.name && (
                <span className="text-[10px] ml-2 truncate" style={{ color: colors.textTertiary, maxWidth: 120 }}>
                  {opt.name}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
