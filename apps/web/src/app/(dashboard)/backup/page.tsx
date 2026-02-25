'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { toast } from 'sonner';
import { animate, stagger } from 'animejs';
import {
  listBackups,
  getBackupDetail,
  createBackup,
  restoreBackup,
  deleteBackup,
  type BackupListItem,
  type BackupDetail,
} from '@/lib/api/backup';

// ── Types ────────────────────────────────────────────────

type ModalType = 'create' | 'delete' | 'restore' | null;

// ── Main Page Component ──────────────────────────────────

export default function BackupPage() {
  const t = useTranslations('backup');
  const { theme } = useTheme();
  const colors = themeColors[theme];

  // State
  const [backups, setBackups] = useState<BackupListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBackup, setSelectedBackup] = useState<BackupDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [modalType, setModalType] = useState<ModalType>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [tag, setTag] = useState('');
  const [securityCode, setSecurityCode] = useState('');

  // ── Data fetching ───────────────────────────────────────

  const fetchBackups = useCallback(async () => {
    try {
      setLoading(true);
      const data = await listBackups();
      setBackups(data);
    } catch {
      toast.error(t('toast.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchBackups();
  }, [fetchBackups]);

  // Animate list items on load
  useEffect(() => {
    if (!loading && backups.length > 0) {
      const items = document.querySelectorAll('.backup-item');
      if (items.length > 0) {
        animate(items, {
          opacity: [0, 1],
          translateY: [20, 0],
          delay: stagger(60),
          duration: 500,
          ease: 'out(3)',
        });
      }
    }
  }, [loading, backups]);

  // ── Slide-in detail ─────────────────────────────────────

  const openDetail = async (backup: BackupListItem) => {
    setDetailLoading(true);
    setSelectedBackup(null); // trigger slide-in with loading
    try {
      const detail = await getBackupDetail(backup.id);
      setSelectedBackup(detail);
    } catch {
      toast.error(t('toast.loadError'));
      setSelectedBackup(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setSelectedBackup(null);
    setDetailLoading(false);
  };

  const isDetailOpen = selectedBackup !== null || detailLoading;

  // ── Modal handlers ──────────────────────────────────────

  const openModal = (type: ModalType) => {
    setSecurityCode('');
    setTag('');
    setModalType(type);
  };

  const closeModal = () => {
    setModalType(null);
    setSecurityCode('');
    setTag('');
  };

  const handleCreate = async () => {
    setActionLoading(true);
    try {
      await createBackup(tag, { sec_code_l3: securityCode });
      toast.success(t('toast.createSuccess'));
      closeModal();
      await fetchBackups();
    } catch (err: any) {
      toast.error(err?.message || t('toast.createError'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedBackup) return;
    setActionLoading(true);
    try {
      await deleteBackup(selectedBackup.id, { sec_code_l3: securityCode });
      toast.success(t('toast.deleteSuccess'));
      closeModal();
      closeDetail();
      await fetchBackups();
    } catch (err: any) {
      toast.error(err?.message || t('toast.deleteError'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleRestore = async () => {
    if (!selectedBackup) return;
    setActionLoading(true);
    try {
      await restoreBackup(selectedBackup.id, { sec_code_l4: securityCode });
      toast.success(t('toast.restoreSuccess'));
      closeModal();
      closeDetail();
    } catch (err: any) {
      toast.error(err?.message || t('toast.restoreError'));
    } finally {
      setActionLoading(false);
    }
  };

  // ── Render ─────────────────────────────────────────────

  return (
    <div style={{ backgroundColor: colors.bg }} className="min-h-screen relative">
      {/* ── Header ─────────────────────────────────────── */}
      <section className="max-w-[1000px] mx-auto px-6 pt-16 pb-4">
        <div className="flex items-end justify-between">
          <div>
            <h1
              style={{ color: colors.text }}
              className="text-[42px] font-semibold tracking-tight leading-none mb-2"
            >
              {t('title')}
            </h1>
            <p style={{ color: colors.textSecondary }} className="text-[17px]">
              {t('description')}
            </p>
          </div>

          {/* Create Backup Button */}
          <button
            id="btn-create-backup"
            onClick={() => openModal('create')}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full text-[15px] font-medium transition-all hover:opacity-90 active:scale-[0.97]"
            style={{ backgroundColor: colors.blue, color: colors.white }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            {t('actions.createBackup')}
          </button>
        </div>

        {/* Info bar */}
        <div
          className="mt-6 flex items-center gap-6 text-xs rounded-xl px-4 py-3"
          style={{ backgroundColor: colors.bgSecondary, border: `1px solid ${colors.border}` }}
        >
          <div className="flex items-center gap-1.5" style={{ color: colors.textTertiary }}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
            </svg>
            <span>{t('info.maxBackups')}</span>
          </div>
          <div className="flex items-center gap-1.5" style={{ color: colors.textTertiary }}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{t('info.autoBackup')}</span>
          </div>
        </div>
      </section>

      {/* ── Backup List ──────────────────────────────────── */}
      <section className="max-w-[1000px] mx-auto px-6 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div
              className="w-6 h-6 border-2 rounded-full animate-spin"
              style={{ borderColor: colors.border, borderTopColor: colors.blue }}
            />
          </div>
        ) : backups.length === 0 ? (
          /* Empty state */
          <div className="text-center py-20">
            <svg
              className="w-16 h-16 mx-auto mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={0.8}
              style={{ color: colors.textTertiary }}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
            </svg>
            <h3 className="text-lg font-medium mb-1" style={{ color: colors.text }}>
              {t('list.empty')}
            </h3>
            <p className="text-sm" style={{ color: colors.textTertiary }}>
              {t('list.emptyDescription')}
            </p>
          </div>
        ) : (
          /* Backup list */
          <div
            className="rounded-xl overflow-hidden"
            style={{ border: `1px solid ${colors.border}` }}
          >
            {/* Header */}
            <div
              className="grid grid-cols-[1fr_1fr_auto] gap-4 px-5 py-3 text-xs font-semibold uppercase tracking-wider"
              style={{ backgroundColor: colors.bgSecondary, color: colors.textTertiary, borderBottom: `1px solid ${colors.border}` }}
            >
              <span>{t('list.date')}</span>
              <span>{t('list.tag')}</span>
              <span className="text-right">{t('list.size')}</span>
            </div>

            {/* Rows */}
            {backups.map((backup, idx) => (
              <button
                key={backup.id}
                id={`backup-row-${idx}`}
                onClick={() => openDetail(backup)}
                className="backup-item grid grid-cols-[1fr_1fr_auto] gap-4 px-5 py-4 w-full text-left transition-colors duration-150 opacity-0"
                style={{
                  borderTop: idx > 0 ? `1px solid ${colors.border}` : undefined,
                  backgroundColor: selectedBackup?.id === backup.id ? colors.bgSecondary : 'transparent',
                }}
                onMouseEnter={(e) => {
                  if (selectedBackup?.id !== backup.id) {
                    e.currentTarget.style.backgroundColor = colors.bgSecondary;
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedBackup?.id !== backup.id) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                {/* Backup date */}
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${colors.blue}12` }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} style={{ color: colors.blue }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                    </svg>
                  </div>
                  <span className="text-sm font-mono font-medium" style={{ color: colors.text }}>
                    {backup.displayDate}
                  </span>
                </div>

                {/* Tag */}
                <div className="flex items-center">
                  <span className="text-sm" style={{ color: backup.tag ? colors.textSecondary : colors.textTertiary }}>
                    {backup.tag || t('list.noTag')}
                  </span>
                </div>

                {/* Size + chevron */}
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono" style={{ color: colors.textTertiary }}>
                    {backup.size}
                  </span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} style={{ color: colors.textTertiary }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* ── Slide-in Detail Panel ──────────────────────────── */}
      {isDetailOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 transition-opacity duration-300"
            style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}
            onClick={closeDetail}
          />

          {/* Panel */}
          <div
            className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-[480px] overflow-y-auto shadow-2xl transition-transform duration-300"
            style={{
              backgroundColor: colors.bg,
              borderLeft: `1px solid ${colors.border}`,
              transform: 'translateX(0)',
            }}
          >
            {detailLoading || !selectedBackup ? (
              <div className="flex items-center justify-center h-full">
                <div
                  className="w-6 h-6 border-2 rounded-full animate-spin"
                  style={{ borderColor: colors.border, borderTopColor: colors.blue }}
                />
              </div>
            ) : (
              <div className="p-6">
                {/* Detail header: Back + Actions */}
                <div className="flex items-center justify-between mb-8">
                  <button
                    onClick={closeDetail}
                    className="flex items-center gap-2 text-sm font-medium transition-opacity hover:opacity-70"
                    style={{ color: colors.blue }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                    {t('actions.back')}
                  </button>

                  <div className="flex items-center gap-2">
                    {/* Delete */}
                    <button
                      id="btn-delete-backup"
                      onClick={() => openModal('delete')}
                      className="px-4 py-2 text-sm font-medium rounded-lg transition-all hover:opacity-90"
                      style={{ backgroundColor: `${colors.red}12`, color: colors.red }}
                    >
                      {t('actions.delete')}
                    </button>
                    {/* Restore */}
                    <button
                      id="btn-restore-backup"
                      onClick={() => openModal('restore')}
                      className="px-4 py-2 text-sm font-medium rounded-lg transition-all hover:opacity-90"
                      style={{ backgroundColor: `${colors.orange}12`, color: colors.orange }}
                    >
                      {t('actions.restore')}
                    </button>
                  </div>
                </div>

                {/* Detail title */}
                <h2 className="text-2xl font-semibold mb-6" style={{ color: colors.text }}>
                  {t('detail.title')}
                </h2>

                {/* Detail cards */}
                <div className="space-y-4">
                  <DetailRow label={t('detail.backupDate')} value={selectedBackup.displayDate} colors={colors} mono />
                  <DetailRow label={t('detail.backupTime')} value={selectedBackup.detailDate} colors={colors} mono />
                  <DetailRow
                    label={t('detail.note')}
                    value={selectedBackup.tag || t('detail.noNote')}
                    colors={colors}
                    muted={!selectedBackup.tag}
                  />
                  <DetailRow label={t('detail.fileSize')} value={selectedBackup.size} colors={colors} mono />

                  {/* Databases */}
                  <div
                    className="rounded-xl p-4"
                    style={{ backgroundColor: colors.bgSecondary, border: `1px solid ${colors.border}` }}
                  >
                    <p className="text-xs font-medium mb-3" style={{ color: colors.textTertiary }}>
                      {t('detail.databases')}
                    </p>
                    <div className="space-y-2">
                      {selectedBackup.databases.map((db) => (
                        <div
                          key={db}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
                          style={{ backgroundColor: colors.bgTertiary }}
                        >
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: colors.green }}
                          />
                          <span className="font-mono text-xs" style={{ color: colors.text }}>{db}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Info footer */}
                <div className="mt-8 pt-4" style={{ borderTop: `1px solid ${colors.border}` }}>
                  <p className="text-xs" style={{ color: colors.textTertiary }}>
                    {t('info.fileFormat')}
                  </p>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Modals ────────────────────────────────────────── */}
      {modalType && (
        <>
          {/* Modal Backdrop */}
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
            onClick={closeModal}
          >
            {/* Modal Content */}
            <div
              className="relative w-[440px] max-w-[90vw] rounded-2xl p-6 shadow-xl"
              style={{ backgroundColor: colors.bg, border: `1px solid ${colors.border}` }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* ── Create Backup Modal ── */}
              {modalType === 'create' && (
                <>
                  <h3 className="text-lg font-semibold mb-1" style={{ color: colors.text }}>
                    {t('createModal.title')}
                  </h3>
                  <p className="text-sm mb-6" style={{ color: colors.textSecondary }}>
                    {t('createModal.description')}
                  </p>

                  {/* Tag input */}
                  <div className="mb-4">
                    <label className="block text-xs font-medium mb-2" style={{ color: colors.textSecondary }}>
                      {t('createModal.tagLabel')}
                    </label>
                    <input
                      id="input-backup-tag"
                      type="text"
                      value={tag}
                      onChange={(e) => setTag(e.target.value)}
                      placeholder={t('createModal.tagPlaceholder')}
                      maxLength={100}
                      className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all"
                      style={{
                        backgroundColor: colors.bgSecondary,
                        border: `1px solid ${colors.border}`,
                        color: colors.text,
                      }}
                      onFocus={(e) => e.currentTarget.style.borderColor = colors.blue}
                      onBlur={(e) => e.currentTarget.style.borderColor = colors.border}
                    />
                    <p className="mt-1 text-xs" style={{ color: colors.textTertiary }}>
                      {t('createModal.tagHint')}
                    </p>
                  </div>

                  {/* Security code */}
                  <div className="mb-6">
                    <label className="block text-xs font-medium mb-2" style={{ color: colors.textSecondary }}>
                      {t('createModal.securityCode')}
                    </label>
                    <input
                      id="input-security-code-create"
                      type="password"
                      value={securityCode}
                      onChange={(e) => setSecurityCode(e.target.value)}
                      placeholder={t('createModal.securityCodePlaceholder')}
                      className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all"
                      style={{
                        backgroundColor: colors.bgSecondary,
                        border: `1px solid ${colors.border}`,
                        color: colors.text,
                      }}
                      onFocus={(e) => e.currentTarget.style.borderColor = colors.blue}
                      onBlur={(e) => e.currentTarget.style.borderColor = colors.border}
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={closeModal}
                      className="px-4 py-2 text-sm font-medium rounded-lg transition-opacity hover:opacity-80"
                      style={{ color: colors.textSecondary }}
                    >
                      {t('actions.cancel')}
                    </button>
                    <button
                      id="btn-confirm-create"
                      onClick={handleCreate}
                      disabled={actionLoading}
                      className="px-5 py-2 text-sm font-medium rounded-lg transition-all hover:opacity-90 disabled:opacity-50"
                      style={{ backgroundColor: colors.blue, color: colors.white }}
                    >
                      {actionLoading ? t('actions.creating') : t('createModal.submit')}
                    </button>
                  </div>
                </>
              )}

              {/* ── Delete Backup Modal ── */}
              {modalType === 'delete' && selectedBackup && (
                <>
                  <h3 className="text-lg font-semibold mb-1" style={{ color: colors.text }}>
                    {t('deleteModal.title')}
                  </h3>
                  <p className="text-sm mb-2" style={{ color: colors.textSecondary }}>
                    {t('deleteModal.description')}
                  </p>

                  {/* Warning */}
                  <div
                    className="mb-4 px-4 py-3 rounded-xl text-xs"
                    style={{ backgroundColor: `${colors.red}08`, color: colors.red, border: `1px solid ${colors.red}20` }}
                  >
                    {t('deleteModal.warning')}
                  </div>

                  {/* Backup info */}
                  <div className="mb-4 p-3 rounded-lg" style={{ backgroundColor: colors.bgSecondary }}>
                    <p className="text-sm font-mono" style={{ color: colors.text }}>
                      {selectedBackup.displayDate}
                      {selectedBackup.tag && (
                        <span className="ml-2" style={{ color: colors.textTertiary }}>| {selectedBackup.tag}</span>
                      )}
                    </p>
                  </div>

                  {/* Security code */}
                  <div className="mb-6">
                    <label className="block text-xs font-medium mb-2" style={{ color: colors.textSecondary }}>
                      {t('deleteModal.securityCode')}
                    </label>
                    <input
                      id="input-security-code-delete"
                      type="password"
                      value={securityCode}
                      onChange={(e) => setSecurityCode(e.target.value)}
                      placeholder={t('deleteModal.securityCodePlaceholder')}
                      className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all"
                      style={{
                        backgroundColor: colors.bgSecondary,
                        border: `1px solid ${colors.border}`,
                        color: colors.text,
                      }}
                      onFocus={(e) => e.currentTarget.style.borderColor = colors.red}
                      onBlur={(e) => e.currentTarget.style.borderColor = colors.border}
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={closeModal}
                      className="px-4 py-2 text-sm font-medium rounded-lg transition-opacity hover:opacity-80"
                      style={{ color: colors.textSecondary }}
                    >
                      {t('actions.cancel')}
                    </button>
                    <button
                      id="btn-confirm-delete"
                      onClick={handleDelete}
                      disabled={actionLoading}
                      className="px-5 py-2 text-sm font-medium rounded-lg transition-all hover:opacity-90 disabled:opacity-50"
                      style={{ backgroundColor: colors.red, color: colors.white }}
                    >
                      {actionLoading ? t('actions.deleting') : t('deleteModal.confirm')}
                    </button>
                  </div>
                </>
              )}

              {/* ── Restore Backup Modal ── */}
              {modalType === 'restore' && selectedBackup && (
                <>
                  <h3 className="text-lg font-semibold mb-1" style={{ color: colors.text }}>
                    {t('restoreModal.title')}
                  </h3>
                  <p className="text-sm mb-2" style={{ color: colors.textSecondary }}>
                    {t('restoreModal.description')}
                  </p>

                  {/* Warning */}
                  <div
                    className="mb-4 px-4 py-3 rounded-xl text-xs font-medium"
                    style={{ backgroundColor: `${colors.orange}08`, color: colors.orange, border: `1px solid ${colors.orange}20` }}
                  >
                    {t('restoreModal.warning')}
                  </div>

                  {/* Backup info */}
                  <div className="mb-1">
                    <p className="text-xs mb-2" style={{ color: colors.textTertiary }}>
                      {t('restoreModal.backupInfo')}
                    </p>
                    <div className="p-3 rounded-lg" style={{ backgroundColor: colors.bgSecondary }}>
                      <p className="text-sm font-mono" style={{ color: colors.text }}>
                        {selectedBackup.displayDate}
                        {selectedBackup.tag && (
                          <span className="ml-2" style={{ color: colors.textTertiary }}>| {selectedBackup.tag}</span>
                        )}
                      </p>
                      <p className="text-xs mt-1" style={{ color: colors.textTertiary }}>
                        {selectedBackup.size}
                      </p>
                    </div>
                  </div>

                  {/* Security code */}
                  <div className="mt-4 mb-6">
                    <label className="block text-xs font-medium mb-2" style={{ color: colors.textSecondary }}>
                      {t('restoreModal.securityCode')}
                    </label>
                    <input
                      id="input-security-code-restore"
                      type="password"
                      value={securityCode}
                      onChange={(e) => setSecurityCode(e.target.value)}
                      placeholder={t('restoreModal.securityCodePlaceholder')}
                      className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all"
                      style={{
                        backgroundColor: colors.bgSecondary,
                        border: `1px solid ${colors.border}`,
                        color: colors.text,
                      }}
                      onFocus={(e) => e.currentTarget.style.borderColor = colors.orange}
                      onBlur={(e) => e.currentTarget.style.borderColor = colors.border}
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={closeModal}
                      className="px-4 py-2 text-sm font-medium rounded-lg transition-opacity hover:opacity-80"
                      style={{ color: colors.textSecondary }}
                    >
                      {t('actions.cancel')}
                    </button>
                    <button
                      id="btn-confirm-restore"
                      onClick={handleRestore}
                      disabled={actionLoading}
                      className="px-5 py-2 text-sm font-medium rounded-lg transition-all hover:opacity-90 disabled:opacity-50"
                      style={{ backgroundColor: colors.orange, color: colors.white }}
                    >
                      {actionLoading ? t('actions.restoring') : t('restoreModal.confirm')}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Detail Row Component ────────────────────────────────

function DetailRow({
  label,
  value,
  colors,
  mono = false,
  muted = false,
}: {
  label: string;
  value: string;
  colors: any;
  mono?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className="rounded-xl px-4 py-3"
      style={{ backgroundColor: colors.bgSecondary, border: `1px solid ${colors.border}` }}
    >
      <p className="text-xs font-medium mb-1" style={{ color: colors.textTertiary }}>
        {label}
      </p>
      <p
        className={`text-sm ${mono ? 'font-mono' : ''}`}
        style={{ color: muted ? colors.textTertiary : colors.text }}
      >
        {value}
      </p>
    </div>
  );
}
