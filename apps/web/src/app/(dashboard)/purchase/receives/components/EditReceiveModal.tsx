'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useMutation } from '@tanstack/react-query';
import { purchaseApi, type ReceiveManagementDetail, type EditReceiveDto, type EditReceiveItemInput, type ReceiveDetailItem } from '@/lib/api';
import { SecurityCodeDialog } from '@/components/ui/security-code-dialog';

interface EditReceiveModalProps {
  isOpen: boolean;
  logisticNum: string;
  detail: ReceiveManagementDetail;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EditReceiveModal({ isOpen, logisticNum, detail, onClose, onSuccess }: EditReceiveModalProps) {
  const t = useTranslations('purchase');
  const tCommon = useTranslations('common');
  const { theme } = useTheme();
  const colors = themeColors[theme];

  // Editable items state (receive_quantity per row)
  const [items, setItems] = useState<(EditReceiveItemInput & { sentQuantity: number })[]>(
    detail.items.map((item: ReceiveDetailItem) => ({
      poNum: item.poNum,
      sku: item.sku,
      receiveQuantity: item.receiveQuantity,
      sentQuantity: item.sentQuantity,
    }))
  );
  const [note, setNote] = useState('');

  // Security
  const [showSecurity, setShowSecurity] = useState(false);
  const [securityError, setSecurityError] = useState<string | undefined>();

  const editMutation = useMutation({
    mutationFn: () =>
      purchaseApi.editReceive(logisticNum, {
        note: note || undefined,
        items: items.map(({ poNum, sku, receiveQuantity }) => ({ poNum, sku, receiveQuantity })),
      }),
    onSuccess: () => {
      setShowSecurity(false);
      onSuccess();
    },
    onError: () => {
      setSecurityError(tCommon('securityCode.invalid'));
    },
  });

  const handleQtyChange = (idx: number, value: string) => {
    const num = Math.max(0, parseInt(value, 10) || 0);
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, receiveQuantity: num } : item));
  };

  const handleSubmit = () => {
    setSecurityError(undefined);
    setShowSecurity(true);
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
        <div
          className="relative w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden"
          style={{ backgroundColor: colors.bg, border: `1px solid ${colors.border}` }}
        >
          {/* Header */}
          <div className="px-6 py-5" style={{ borderBottom: `1px solid ${colors.border}` }}>
            <h2 className="text-lg font-semibold" style={{ color: colors.text }}>
              {t('receives.edit.title')}
            </h2>
            <p className="text-sm mt-0.5" style={{ color: colors.textSecondary }}>
              {logisticNum}
            </p>
          </div>

          {/* Body */}
          <div className="px-6 py-5 max-h-[60vh] overflow-y-auto">
            {/* Note */}
            <div className="mb-4">
              <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>
                {t('receives.edit.note')}
              </label>
              <input
                type="text"
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder={t('receives.edit.notePlaceholder')}
                className="w-full h-9 px-3 border rounded-lg text-sm focus:outline-none"
                style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.text }}
              />
            </div>

            {/* Items table */}
            <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${colors.border}` }}>
              <table className="w-full">
                <thead>
                  <tr style={{ backgroundColor: colors.bgSecondary, borderBottom: `1px solid ${colors.border}` }}>
                    {['poNum', 'sku', 'sent', 'receive'].map(col => (
                      <th key={col} className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: colors.textTertiary }}>
                        {t(`receives.edit.col_${col}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((row, idx) => (
                    <tr key={idx} style={{ borderBottom: idx < items.length - 1 ? `1px solid ${colors.border}` : undefined }}>
                      <td className="px-3 py-2.5 text-sm" style={{ color: colors.textSecondary }}>{row.poNum}</td>
                      <td className="px-3 py-2.5 text-sm font-mono font-medium" style={{ color: colors.text }}>{row.sku}</td>
                      <td className="px-3 py-2.5 text-sm text-right" style={{ color: colors.textSecondary }}>{row.sentQuantity}</td>
                      <td className="px-3 py-2.5">
                        <input
                          type="number"
                          min={0}
                          value={row.receiveQuantity}
                          onChange={e => handleQtyChange(idx, e.target.value)}
                          className="w-20 h-8 px-2 border rounded text-sm text-right focus:outline-none focus:ring-1"
                          style={{
                            backgroundColor: colors.bgTertiary,
                            borderColor: row.receiveQuantity !== row.sentQuantity ? '#ff453a' : colors.border,
                            color: colors.text,
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer */}
          <div
            className="flex items-center justify-end gap-3 px-6 py-4"
            style={{ borderTop: `1px solid ${colors.border}` }}
          >
            <button
              onClick={onClose}
              className="h-9 px-4 text-sm font-medium rounded-lg transition-opacity hover:opacity-80"
              style={{ backgroundColor: colors.bgTertiary, color: colors.textSecondary }}
            >
              {tCommon('cancel')}
            </button>
            <button
              onClick={handleSubmit}
              className="h-9 px-5 text-sm font-medium rounded-lg transition-all hover:opacity-90"
              style={{ backgroundColor: '#30d158', color: '#ffffff' }}
            >
              {t('receives.edit.submit')}
            </button>
          </div>
        </div>
      </div>

      {/* Security Dialog */}
      <SecurityCodeDialog
        isOpen={showSecurity}
        level="L3"
        title={t('receives.edit.title')}
        description={t('receives.edit.securityDescription')}
        onConfirm={() => editMutation.mutate()}
        onCancel={() => { setShowSecurity(false); setSecurityError(undefined); }}
        isLoading={editMutation.isPending}
        error={securityError}
      />
    </>
  );
}
