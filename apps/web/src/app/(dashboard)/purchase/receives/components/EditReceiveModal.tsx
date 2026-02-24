'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useMutation } from '@tanstack/react-query';
import { purchaseApi, type ReceiveManagementDetail, type EditReceiveItemInput, type ReceiveDetailItem } from '@/lib/api';
import { SecurityCodeDialog } from '@/components/ui/security-code-dialog';
import { useSecurityAction } from '@/hooks/useSecurityAction';
import ModalShell from '../../../purchase/components/ModalShell';

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

  const editMutation = useMutation({
    mutationFn: () =>
      purchaseApi.editReceive(logisticNum, {
        note: note || undefined,
        items: items.map(({ poNum, sku, receiveQuantity }) => ({ poNum, sku, receiveQuantity })),
      }),
    onSuccess: () => {
      editSecurity.onCancel();
      onSuccess();
    },
    onError: () => {
      editSecurity.setError(tCommon('securityCode.invalid'));
    },
  });

  const editSecurity = useSecurityAction({
    actionKey: 'btn_receive_edit',
    level: 'L3',
    onExecute: () => editMutation.mutate(),
  });

  const handleQtyChange = (idx: number, value: string) => {
    const num = Math.max(0, parseInt(value, 10) || 0);
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, receiveQuantity: num } : item));
  };

  const handleSubmit = () => {
    editSecurity.trigger();
  };

  if (!isOpen) return null;

  return (
    <>
      <ModalShell
        isOpen={isOpen}
        onClose={onClose}
        title={t('receives.edit.title')}
        subtitle={logisticNum}
        footerRight={
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="h-9 px-4 text-sm font-medium rounded-lg transition-opacity hover:opacity-80"
              style={{ backgroundColor: colors.bgTertiary, color: colors.textSecondary }}
            >
              {tCommon('cancel')}
            </button>
            <button
              onClick={handleSubmit}
              className="h-9 px-5 text-sm font-medium rounded-lg transition-all hover:opacity-90 text-white"
              style={{ backgroundColor: colors.green }}
            >
              {t('receives.edit.submit')}
            </button>
          </div>
        }
      >
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
      </ModalShell>

      {/* Security Dialog */}
      <SecurityCodeDialog
        isOpen={editSecurity.isOpen}
        level={editSecurity.level}
        title={t('receives.edit.title')}
        description={t('receives.edit.securityDescription')}
        onConfirm={() => editMutation.mutate()}
        onCancel={editSecurity.onCancel}
        isLoading={editMutation.isPending}
        error={editSecurity.error}
      />
    </>
  );
}
