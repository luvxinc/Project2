'use client';

import type { ClinicalCase, CompletionItem } from './types';

interface ConfirmCompletionModalProps {
  selectedCase: ClinicalCase | null;
  completionItems: CompletionItem[];
  completing: boolean;
  colors: Record<string, string>;
  onClose: () => void;
  onConfirm: () => void;
}

export function ConfirmCompletionModal({
  selectedCase, completionItems, completing, colors, onClose, onConfirm,
}: ConfirmCompletionModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={() => !completing && onClose()}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl p-6 shadow-2xl"
        style={{ backgroundColor: colors.bgSecondary }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(52,199,89,0.15)' }}>
            <svg className="w-5 h-5" fill="none" stroke="#34C759" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold" style={{ color: colors.text }}>Confirm Case Completion</h3>
        </div>
        <p className="text-sm mb-1" style={{ color: colors.textSecondary }}>
          This will finalize <span className="font-mono font-semibold" style={{ color: colors.text }}>{selectedCase?.caseId}</span> and update inventory:
        </p>
        <ul className="text-xs mb-5 space-y-1 ml-4" style={{ color: colors.textSecondary }}>
          <li>• <strong>{completionItems.filter(i => !i.returned).length}</strong> item(s) marked as <span style={{ color: '#FF9F0A' }}>Used (consumed)</span></li>
          <li>• <strong>{completionItems.filter(i => i.returned && i.accepted).length}</strong> item(s) <span style={{ color: '#34C759' }}>Returned (All OK)</span></li>
          <li>• <strong>{completionItems.filter(i => i.returned && !i.accepted).length}</strong> item(s) <span style={{ color: '#FF3B30' }}>Returned → Demo/Sample</span></li>
        </ul>
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={completing}
            className="px-4 py-2 rounded-xl text-sm font-medium hover:opacity-70 transition"
            style={{ color: colors.textSecondary }}
          >Cancel</button>
          <button
            onClick={onConfirm}
            disabled={completing}
            className="px-5 py-2 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition disabled:opacity-50"
            style={{ backgroundColor: '#34C759' }}
          >{completing ? 'Processing...' : 'Confirm'}</button>
        </div>
      </div>
    </div>
  );
}

interface ReverseCompletionModalProps {
  selectedCase: ClinicalCase | null;
  reversing: boolean;
  colors: Record<string, string>;
  onClose: () => void;
  onReverse: () => void;
}

export function ReverseCompletionModal({
  selectedCase, reversing, colors, onClose, onReverse,
}: ReverseCompletionModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={() => !reversing && onClose()}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl p-6 shadow-2xl"
        style={{ backgroundColor: colors.bgSecondary }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(255,159,10,0.15)' }}>
            <svg className="w-5 h-5" fill="none" stroke="#FF9F0A" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold" style={{ color: colors.text }}>Reverse Completion</h3>
        </div>
        <p className="text-sm mb-5" style={{ color: colors.textSecondary }}>
          This will undo the completion of <span className="font-mono font-semibold" style={{ color: colors.text }}>{selectedCase?.caseId}</span>.
          All inventory changes from the completion will be reversed, and the case will return to <strong>In Progress</strong> status.
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={reversing}
            className="px-4 py-2 rounded-xl text-sm font-medium hover:opacity-70 transition"
            style={{ color: colors.textSecondary }}
          >Cancel</button>
          <button
            onClick={onReverse}
            disabled={reversing}
            className="px-5 py-2 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition disabled:opacity-50"
            style={{ backgroundColor: '#FF9F0A' }}
          >{reversing ? 'Reversing...' : 'Reverse'}</button>
        </div>
      </div>
    </div>
  );
}
