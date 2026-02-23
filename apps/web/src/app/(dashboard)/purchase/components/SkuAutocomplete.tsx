'use client';

import { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTheme, themeColors } from '@/contexts/ThemeContext';

/**
 * SkuAutocomplete — Custom autocomplete replacing native <datalist>.
 * Shows max 5 items at a time with scroll + keyboard navigation.
 * Uses React Portal to escape overflow:hidden/auto parent containers
 * (e.g. ModalShell), rendering the dropdown on document.body.
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
const DROPDOWN_GAP = 4; // gap between input and dropdown

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
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);

  // Filter options based on current input
  const filtered = value.trim()
    ? options.filter(
        (o) =>
          o.sku.toUpperCase().includes(value.toUpperCase()) ||
          (o.name && o.name.toUpperCase().includes(value.toUpperCase()))
      )
    : options;

  // Calculate dropdown position based on input bounding rect
  const updatePosition = useCallback(() => {
    if (!inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    setDropdownPos({
      top: rect.bottom + DROPDOWN_GAP,
      left: rect.left,
      width: rect.width,
    });
  }, []);

  // Reposition on scroll / resize (including modal scroll)
  useLayoutEffect(() => {
    if (!isOpen) return;
    updatePosition();

    // Listen for scroll on all ancestors (to catch modal scroll container)
    const handleReposition = () => updatePosition();
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true); // useCapture to catch all scroll events
    return () => {
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [isOpen, updatePosition]);

  // Close on outside click — check both container and portal dropdown
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        listRef.current && !listRef.current.contains(target)
      ) {
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

  // Portal dropdown rendered on document.body
  const dropdown =
    isOpen && filtered.length > 0 && !disabled && dropdownPos
      ? createPortal(
          <div
            ref={listRef}
            className="rounded-lg border shadow-lg overflow-y-auto"
            style={{
              position: 'fixed',
              top: dropdownPos.top,
              left: dropdownPos.left,
              width: dropdownPos.width,
              maxHeight: dropdownMaxHeight,
              backgroundColor: colors.bgSecondary,
              borderColor: colors.border,
              zIndex: 99999, // above everything including modals
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
          </div>,
          document.body
        )
      : null;

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
        onFocus={() => {
          updatePosition();
          setIsOpen(true);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
        style={{
          ...style,
          borderColor: hasError ? colors.red : (style?.borderColor || colors.border),
        }}
      />
      {dropdown}
    </div>
  );
}
