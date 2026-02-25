'use client';

import type { ClinicalCase, CompletionItem } from './types';
import { useTranslations } from 'next-intl';
import type { ThemeColorSet } from '@/contexts/ThemeContext';

interface ConfirmCompletionModalProps {
  selectedCase: ClinicalCase | null;
  completionItems: CompletionItem[];
  completing: boolean;
  colors: ThemeColorSet;
  onClose: () => void;
  onConfirm: () => void;
}

export function ConfirmCompletionModal({
  selectedCase, completionItems, completing, colors, onClose, onConfirm,
}: ConfirmCompletionModalProps) {
  const t = useTranslations('vma');
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: `${colors.bg}80`, backdropFilter: 'blur(4px)' }}
      onClick={() => !completing && onClose()}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl p-6 shadow-2xl"
        style={{ backgroundColor: colors.bgSecondary }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: `${colors.green}26` }}>
            <svg className="w-5 h-5" fill="none" stroke={colors.green} viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold" style={{ color: colors.text }}>{t('p_valve.clinicalCase.confirmModal.title')}</h3>
        </div>
        <p className="text-sm mb-1" style={{ color: colors.textSecondary }}>
          {t('p_valve.clinicalCase.confirmModal.description', { caseId: selectedCase?.caseId || '' })}
        </p>
        <ul className="text-xs mb-5 space-y-1 ml-4" style={{ color: colors.textSecondary }}>
          <li>• <strong>{completionItems.filter(i => !i.returned).length}</strong> {t('p_valve.clinicalCase.confirmModal.usedItems', { count: completionItems.filter(i => !i.returned).length })}</li>
          <li>• <strong>{completionItems.filter(i => i.returned && i.accepted).length}</strong> {t('p_valve.clinicalCase.confirmModal.returnedOk', { count: completionItems.filter(i => i.returned && i.accepted).length })}</li>
          <li>• <strong>{completionItems.filter(i => i.returned && !i.accepted).length}</strong> {t('p_valve.clinicalCase.confirmModal.returnedDemo', { count: completionItems.filter(i => i.returned && !i.accepted).length })}</li>
        </ul>
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={completing}
            className="px-4 py-2 rounded-xl text-sm font-medium hover:opacity-70 transition"
            style={{ color: colors.textSecondary }}
          >{t('p_valve.clinicalCase.confirmModal.cancel')}</button>
          <button
            onClick={onConfirm}
            disabled={completing}
            className="px-5 py-2 rounded-xl text-sm font-semibold hover:opacity-90 transition disabled:opacity-50"
            style={{ backgroundColor: colors.green, color: colors.white }}
          >{completing ? t('p_valve.clinicalCase.confirmModal.processing') : t('p_valve.clinicalCase.confirmModal.confirm')}</button>
        </div>
      </div>
    </div>
  );
}

interface ReverseCompletionModalProps {
  selectedCase: ClinicalCase | null;
  reversing: boolean;
  colors: ThemeColorSet;
  onClose: () => void;
  onReverse: () => void;
}

export function ReverseCompletionModal({
  selectedCase, reversing, colors, onClose, onReverse,
}: ReverseCompletionModalProps) {
  const t = useTranslations('vma');
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: `${colors.bg}80`, backdropFilter: 'blur(4px)' }}
      onClick={() => !reversing && onClose()}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl p-6 shadow-2xl"
        style={{ backgroundColor: colors.bgSecondary }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: `${colors.orange}26` }}>
            <svg className="w-5 h-5" fill="none" stroke={colors.orange} viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold" style={{ color: colors.text }}>{t('p_valve.clinicalCase.reverseModal.title')}</h3>
        </div>
        <p className="text-sm mb-5" style={{ color: colors.textSecondary }}>
          {t('p_valve.clinicalCase.reverseModal.description', { caseId: selectedCase?.caseId || '' })}
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={reversing}
            className="px-4 py-2 rounded-xl text-sm font-medium hover:opacity-70 transition"
            style={{ color: colors.textSecondary }}
          >{t('p_valve.clinicalCase.reverseModal.cancel')}</button>
          <button
            onClick={onReverse}
            disabled={reversing}
            className="px-5 py-2 rounded-xl text-sm font-semibold hover:opacity-90 transition disabled:opacity-50"
            style={{ backgroundColor: colors.orange, color: colors.white }}
          >{reversing ? t('p_valve.clinicalCase.reverseModal.reversing') : t('p_valve.clinicalCase.reverseModal.reverse')}</button>
        </div>
      </div>
    </div>
  );
}
