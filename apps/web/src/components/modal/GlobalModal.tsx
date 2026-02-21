'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { useTheme, themeColors } from '@/contexts/ThemeContext';

// ========== Types ==========

export type ModalType = 'custom' | 'confirm' | 'success' | 'error' | 'password';

export interface ModalOptions {
  type?: ModalType;
  title?: string;
  message?: string | ReactNode;
  content?: ReactNode;
  
  // Button configuration
  confirmText?: string;
  cancelText?: string;
  showCancel?: boolean;
  
  // Styling
  borderColor?: string;
  confirmClass?: string;  // 'primary' | 'danger' | 'success'
  
  // Callbacks
  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void;
  
  // Password modal specific
  requiredCodes?: string[];  // ['l1', 'l2', 'l3']
  onPasswordSubmit?: (passwords: Record<string, string>) => void | Promise<void>;
}

interface ModalContextValue {
  isOpen: boolean;
  options: ModalOptions | null;
  show: (options: ModalOptions) => void;
  hide: () => void;
  
  // Convenience methods
  showConfirm: (options: Omit<ModalOptions, 'type'>) => void;
  showSuccess: (options: Omit<ModalOptions, 'type'>) => void;
  showError: (options: Omit<ModalOptions, 'type'>) => void;
  showPassword: (options: Omit<ModalOptions, 'type'>) => void;
}

// ========== Context ==========

const ModalContext = createContext<ModalContextValue | null>(null);

export function useModal() {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return context;
}

// ========== Provider ==========

interface ModalProviderProps {
  children: ReactNode;
}

export function ModalProvider({ children }: ModalProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<ModalOptions | null>(null);

  const show = useCallback((opts: ModalOptions) => {
    setOptions(opts);
    setIsOpen(true);
  }, []);

  const hide = useCallback(() => {
    setIsOpen(false);
    // Delay clearing options to allow close animation
    setTimeout(() => setOptions(null), 200);
  }, []);

  const showConfirm = useCallback((opts: Omit<ModalOptions, 'type'>) => {
    show({ ...opts, type: 'confirm' });
  }, [show]);

  const showSuccess = useCallback((opts: Omit<ModalOptions, 'type'>) => {
    show({ ...opts, type: 'success' });
  }, [show]);

  const showError = useCallback((opts: Omit<ModalOptions, 'type'>) => {
    show({ ...opts, type: 'error' });
  }, [show]);

  const showPassword = useCallback((opts: Omit<ModalOptions, 'type'>) => {
    show({ ...opts, type: 'password' });
  }, [show]);

  const value: ModalContextValue = {
    isOpen,
    options,
    show,
    hide,
    showConfirm,
    showSuccess,
    showError,
    showPassword,
  };

  return (
    <ModalContext.Provider value={value}>
      {children}
      <GlobalModal />
    </ModalContext.Provider>
  );
}

// ========== Modal Component ==========

function GlobalModal() {
  const { isOpen, options, hide } = useModal();
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [passwords, setPasswords] = useState<Record<string, string>>({});

  if (!isOpen || !options) return null;

  const {
    type = 'custom',
    title,
    message,
    content,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    showCancel = true,
    borderColor,
    confirmClass = 'primary',
    onConfirm,
    onCancel,
    requiredCodes = [],
    onPasswordSubmit,
  } = options;

  // Type-based styling
  const typeStyles: Record<ModalType, { border: string; icon: ReactNode }> = {
    custom: { border: borderColor || '#424245', icon: null },
    confirm: { 
      border: '#0071e3', 
      icon: (
        <svg className="w-12 h-12 text-[#0071e3]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z"/>
        </svg>
      )
    },
    success: { 
      border: '#30d158', 
      icon: (
        <svg className="w-12 h-12 text-[#30d158]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
      )
    },
    error: { 
      border: '#ff453a', 
      icon: (
        <svg className="w-12 h-12 text-[#ff453a]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/>
        </svg>
      )
    },
    password: { 
      border: '#ff9f0a', 
      icon: (
        <svg className="w-12 h-12 text-[#ff9f0a]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"/>
        </svg>
      )
    },
  };

  const style = typeStyles[type];
  const buttonColorClass = {
    primary: 'bg-[#0071e3] hover:bg-[#0077ed]',
    danger: 'bg-[#ff453a] hover:bg-[#ff5c52]',
    success: 'bg-[#30d158] hover:bg-[#34d860]',
  }[confirmClass] || 'bg-[#0071e3] hover:bg-[#0077ed]';

  const handleConfirm = async () => {
    setLoading(true);
    setError('');

    try {
      if (type === 'password' && onPasswordSubmit) {
        await onPasswordSubmit(passwords);
      } else if (onConfirm) {
        await onConfirm();
      }
      setPasswords({});
      hide();
    } catch (err) {
      const msg = err instanceof Error
        ? err.message
        : (typeof err === 'object' && err !== null && 'message' in err)
          ? (err as { message: string }).message
          : 'Operation failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setError('');
    setPasswords({});
    onCancel?.();
    hide();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    // Only close if clicking the backdrop itself, not the modal content
    if (e.target === e.currentTarget) {
      handleCancel();
    }
  };

  // Password slot labels
  const slotLabels: Record<string, string> = {
    'l0': 'User Password',
    'l1': 'L1 Authorization',
    'l2': 'L2 Authorization',
    'l3': 'L3 Authorization',
    'l4': 'L4 Authorization',
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.7)' }}
      onClick={handleBackdropClick}
    >
      {/* Backdrop blur */}
      <div className="absolute inset-0 backdrop-blur-md" />
      
      {/* Modal */}
      <div 
        style={{ 
          backgroundColor: colors.bgSecondary, 
          borderColor: style.border, 
          borderWidth: '2px', 
          borderStyle: 'solid' 
        }}
        className="relative rounded-2xl shadow-2xl w-full max-w-[380px] mx-4 overflow-hidden animate-[modalIn_0.2s_ease-out]"
      >
        {/* Close Button */}
        <button
          onClick={handleCancel}
          style={{ color: colors.textSecondary }}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full hover:opacity-70 transition-colors z-10"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="p-8">
          {/* Icon */}
          {style.icon && (
            <div className="flex justify-center mb-4">
              {style.icon}
            </div>
          )}

          {/* Title */}
          {title && (
            <h2 style={{ color: colors.text }} className="text-[20px] font-medium text-center mb-2">
              {title}
            </h2>
          )}

          {/* Message */}
          {message && (
            <p style={{ color: colors.textSecondary }} className="text-[14px] text-center mb-6">
              {message}
            </p>
          )}

          {/* Custom Content */}
          {content && (
            <div className="mb-6">
              {content}
            </div>
          )}

          {/* Password Inputs */}
          {type === 'password' && requiredCodes.length > 0 && (
            <div className="space-y-4 mb-6">
              {requiredCodes.map((code) => (
                <div key={code}>
                  <label style={{ color: colors.textSecondary }} className="block text-[12px] mb-1.5">
                    {slotLabels[code] || 'Password'}
                  </label>
                  <input
                    type="password"
                    value={passwords[code] || ''}
                    onChange={(e) => setPasswords({ ...passwords, [code]: e.target.value })}
                    placeholder="Enter password"
                    style={{ 
                      backgroundColor: colors.bgTertiary, 
                      borderColor: colors.border,
                      color: colors.text 
                    }}
                    className="w-full h-[44px] px-4 border rounded-xl text-[15px] focus:outline-none focus:border-[#0071e3] focus:ring-1 focus:ring-[#0071e3] transition-all"
                  />
                </div>
              ))}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-[#ff3b30]/10 border border-[#ff3b30]/30 rounded-xl px-4 py-3 mb-4">
              <p className="text-[13px] text-[#ff453a] text-center">{error}</p>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3">
            {showCancel && (
              <button
                onClick={handleCancel}
                disabled={loading}
                style={{ backgroundColor: colors.bgTertiary, color: colors.text }}
                className="flex-1 h-[44px] hover:opacity-80 disabled:opacity-50 text-[15px] font-medium rounded-xl transition-colors"
              >
                {cancelText}
              </button>
            )}
            <button
              onClick={handleConfirm}
              disabled={loading}
              className={`flex-1 h-[44px] ${buttonColorClass} disabled:opacity-50 text-white text-[15px] font-medium rounded-xl transition-colors flex items-center justify-center`}
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                confirmText
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Animation Styles */}
      <style>{`
        @keyframes modalIn {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(10px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

export default GlobalModal;
