'use client';

import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useEffect, useState, useCallback, useRef } from 'react';
import { animate } from 'animejs';
import { useRouter } from 'next/navigation';
import VmaTabSelector from '../components/VmaTabSelector';
import { getAuthHeaders } from '@/lib/vma-api';
import { getApiBaseUrlCached } from '@/lib/api-url';
import TrainingMatrixRoadmap from './_TrainingMatrixRoadmap';

const API = getApiBaseUrlCached();

// ================================
// Types
// ================================
interface TrainingRecord {
  id: string;
  employeeNo: string;
  sopNo: string;
  sopVersion: string;
  trainingDate: string;
  trainingNo: string;
  completedAt: string | null;
  trainerId: string | null;
  trainingLocation: string | null;
  trainingDuration: number | null;
}

interface TrainingSession {
  id: string;
  trainingNo: string;
  trainingDate: string;
  trainingSubject: string;
  trainingObjective: string;
  evaluationMethod: string;
  lecturerNo: string;
  lecturerName: string;
  trainingTimeStart: string | null;
  trainingTimeEnd: string | null;
  trainingPlace: string;
  attendCount: number;
  passCount: number;
  pdfUrl: string | null;
  records: TrainingRecord[];
}

// ================================
// Page
// ================================
export default function TrainingRecordsPage() {
  const t = useTranslations('vma');
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const router = useRouter();

  // State
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState<TrainingSession | null>(null);
  const [isFlipped, setIsFlipped] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'sessions' | 'roadmap'>('sessions');

  // Refs for slide animation (matches training page)
  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);

  // API helper (same as training page)
  const api = useCallback(async (path: string, options?: RequestInit) => {
    const res = await fetch(`${API}${path}`, {
      headers: getAuthHeaders(),
      ...options,
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  }, []);

  // Fetch sessions
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api('/vma/training-sessions');
      setSessions(data);
    } catch (err) {
      console.error('Failed to fetch sessions', err);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    loadData();
  }, [loadData]);



  // Click row → slide to detail (matches training page animation exactly)
  const handleSessionClick = useCallback((session: TrainingSession) => {
    setSelectedSession(session);

    const slideOut = frontRef.current
      ? frontRef.current.getBoundingClientRect().right
      : window.innerWidth;

    if (frontRef.current) {
      animate(frontRef.current, {
        translateX: [0, -slideOut],
        duration: 450,
        ease: 'inOut(3)',
      });
    }

    setTimeout(() => {
      setIsFlipped(true);
      setEditMode(false);
      requestAnimationFrame(() => {
        if (backRef.current) {
          const slideIn = window.innerWidth;
          animate(backRef.current, {
            translateX: [slideIn, 0],
            duration: 450,
            ease: 'inOut(3)',
          });
        }
      });
    }, 400);
  }, []);

  // Back button (matches training page animation exactly)
  const handleBack = useCallback(() => {
    const slideOut = backRef.current
      ? window.innerWidth - backRef.current.getBoundingClientRect().left
      : window.innerWidth;

    if (backRef.current) {
      animate(backRef.current, {
        translateX: [0, slideOut],
        duration: 450,
        ease: 'inOut(3)',
      });
    }

    setTimeout(() => {
      setIsFlipped(false);
      setSelectedSession(null);
      setEditMode(false);
      requestAnimationFrame(() => {
        if (frontRef.current) {
          const slideIn = window.innerWidth;
          animate(frontRef.current, {
            translateX: [-slideIn, 0],
            duration: 450,
            ease: 'inOut(3)',
          });
        }
      });
    }, 400);
  }, []);

  // Delete session
  const handleDeleteSession = useCallback(async (sessionId: string) => {
    try {
      await api(`/vma/training-sessions/${sessionId}`, { method: 'DELETE' });
      setDeleteConfirm(null);
      handleBack();
      setTimeout(() => loadData(), 500);
    } catch (err) {
      console.error('Failed to delete session', err);
    }
  }, [api, handleBack, loadData]);

  // Remove record from session
  const handleRemoveRecord = useCallback(async (sessionId: string, recordId: string) => {
    try {
      await api(`/vma/training-sessions/${sessionId}/records/${recordId}`, { method: 'DELETE' });
      setSelectedSession(prev => {
        if (!prev) return prev;
        const newRecords = prev.records.filter(r => r.id !== recordId);
        return {
          ...prev,
          records: newRecords,
          attendCount: new Set(newRecords.map(r => r.employeeNo)).size,
          passCount: new Set(newRecords.map(r => r.employeeNo)).size,
        };
      });
      setSessions(prev => prev.map(s => {
        if (s.id !== sessionId) return s;
        return { ...s, records: s.records.filter(r => r.id !== recordId) };
      }));
    } catch (err) {
      console.error('Failed to remove record', err);
    }
  }, [api]);

  // Download PDF
  const handleDownload = useCallback(async (session: TrainingSession) => {
    const url = `${API}/vma/training-sessions/${session.trainingNo}/pdf`;
    try {
      const headers = getAuthHeaders();
      // Remove Content-Type for download requests (not sending JSON body)
      delete headers['Content-Type'];
      const res = await fetch(url, { headers });
      if (!res.ok) {
        console.error(`Download failed: ${res.status}`);
        return;
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = blobUrl;
      a.download = `training_${session.trainingNo}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error('Download failed', err);
    }
  }, []);

  // Format date
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      month: 'short', day: '2-digit', year: 'numeric', timeZone: 'America/Los_Angeles',
    });
  };

  // Group records for detail view
  const groupedByEmployee = selectedSession
    ? Object.values(
        selectedSession.records.reduce((acc, r) => {
          if (!acc[r.employeeNo]) acc[r.employeeNo] = { employeeNo: r.employeeNo, sops: [] };
          acc[r.employeeNo].sops.push(r);
          return acc;
        }, {} as Record<string, { employeeNo: string; sops: TrainingRecord[] }>)
      )
    : [];

  const groupedBySop = selectedSession
    ? Object.values(
        selectedSession.records.reduce((acc, r) => {
          const key = `${r.sopNo}|${r.sopVersion}`;
          if (!acc[key]) acc[key] = { sopNo: r.sopNo, sopVersion: r.sopVersion, employees: [] };
          acc[key].employees.push(r);
          return acc;
        }, {} as Record<string, { sopNo: string; sopVersion: string; employees: TrainingRecord[] }>)
      )
    : [];

  const uniqueEmployees = selectedSession
    ? [...new Set(selectedSession.records.map(r => r.employeeNo))]
    : [];

  return (
    <div style={{ backgroundColor: colors.bg }} className="min-h-screen pb-20 overflow-x-hidden">
      {/* Tab Selector - matches training page layout */}
      <section className="pt-12 pb-6 px-6">
        <div className="max-w-[1200px] mx-auto">
          <VmaTabSelector />
        </div>
      </section>

      <div className="max-w-[1400px] mx-auto px-6">
        {/* Header - matches training page layout */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 style={{ color: colors.text }} className="text-xl font-semibold mb-1">
                {viewMode === 'sessions' ? t('trainingRecords.title') : (t('training.roadmap.title') || 'Compliance Roadmap')}
              </h2>
              <p style={{ color: colors.textSecondary }} className="text-sm">
                {viewMode === 'sessions'
                  ? `${t('trainingRecords.stats.sessions', { count: sessions.length })} · ${t('trainingRecords.stats.trainees', { count: sessions.reduce((s, sess) => s + new Set(sess.records.map(r => r.employeeNo)).size, 0) })}`
                  : (t('training.roadmap.subtitle') || 'Training compliance snapshots at each SOP change event')
                }
              </p>
            </div>
            {/* View Mode Toggle */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewMode('sessions')}
                className="px-3 py-1.5 rounded-lg text-sm font-medium transition"
                style={{
                  backgroundColor: viewMode === 'sessions' ? colors.controlAccent : 'transparent',
                  color: viewMode === 'sessions' ? colors.white : colors.textSecondary,
                }}
              >
                {t('trainingRecords.sessions') || 'Sessions'}
              </button>
              <button
                onClick={() => setViewMode('roadmap')}
                className="px-3 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1.5"
                style={{
                  backgroundColor: viewMode === 'roadmap' ? colors.indigo : 'transparent',
                  color: viewMode === 'roadmap' ? colors.white : colors.textSecondary,
                }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
                </svg>
                {t('training.roadmap.title') || 'Roadmap'}
              </button>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        {viewMode === 'roadmap' ? (
          <TrainingMatrixRoadmap colors={colors} theme={theme} t={t} onClose={() => setViewMode('sessions')} />
        ) : loading ? (
          <div className="flex justify-center py-20">
            <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Click-outside overlay when flipped */}
            {isFlipped && (
              <div className="fixed inset-0 z-10" onClick={handleBack} />
            )}
            <div className="relative z-20">
              {/* === FRONT: Session List === */}
              {!isFlipped && (
                <div
                  ref={frontRef}
                  style={{
                    backgroundColor: colors.bgSecondary,
                    borderColor: colors.border,
                  }}
                  className="rounded-2xl border overflow-hidden"
                >
                    <table className="w-full">
                      <thead>
                        <tr style={{ borderColor: colors.border }} className="border-b">
                          <th className="text-left px-5 py-3.5 text-xs font-semibold uppercase tracking-wider" style={{ color: colors.textTertiary }}>
                            {t('trainingRecords.fields.trainingNo')}
                          </th>
                          <th className="text-left px-5 py-3.5 text-xs font-semibold uppercase tracking-wider" style={{ color: colors.textTertiary }}>
                            {t('trainingRecords.fields.trainingDate')}
                          </th>
                          <th className="text-left px-5 py-3.5 text-xs font-semibold uppercase tracking-wider" style={{ color: colors.textTertiary }}>
                            {t('trainingRecords.fields.subject')}
                          </th>
                          <th className="text-left px-5 py-3.5 text-xs font-semibold uppercase tracking-wider" style={{ color: colors.textTertiary }}>
                            {t('trainingRecords.fields.lecturer')}
                          </th>
                          <th className="text-left px-5 py-3.5 text-xs font-semibold uppercase tracking-wider" style={{ color: colors.textTertiary }}>
                            {t('trainingRecords.fields.employees')}
                          </th>
                          <th className="text-left px-5 py-3.5 text-xs font-semibold uppercase tracking-wider" style={{ color: colors.textTertiary }}>
                            {t('trainingRecords.fields.sops')}
                          </th>
                          <th className="text-left px-5 py-3.5 text-xs font-semibold uppercase tracking-wider" style={{ color: colors.textTertiary }}>
                            {t('trainingRecords.fields.download')}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {sessions.map((session) => {
                          const uniqueEmps = new Set(session.records.map(r => r.employeeNo)).size;
                          const uniqueSops = new Set(session.records.map(r => `${r.sopNo}|${r.sopVersion}`)).size;
                          return (
                            <tr
                              key={session.id}
                              onClick={() => handleSessionClick(session)}
                              style={{ borderColor: colors.border }}
                              className="border-b last:border-b-0 transition-colors cursor-pointer hover:opacity-80"
                            >
                              <td className="px-5 py-3.5 text-sm font-mono font-semibold" style={{ color: colors.blue }}>
                                {session.trainingNo}
                              </td>
                              <td className="px-5 py-3.5 text-sm" style={{ color: colors.text }}>
                                {formatDate(session.trainingDate)}
                              </td>
                              <td className="px-5 py-3.5">
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium" style={{
                                  backgroundColor: session.trainingSubject.includes('New Employee')
                                    ? (theme === 'dark' ? `${colors.green}26` : `${colors.green}1a`)
                                    : session.trainingSubject.includes('New SOP')
                                      ? (theme === 'dark' ? `${colors.blue}26` : `${colors.blue}1a`)
                                      : (theme === 'dark' ? `${colors.orange}26` : `${colors.orange}1a`),
                                  color: session.trainingSubject.includes('New Employee')
                                    ? colors.green
                                    : session.trainingSubject.includes('New SOP')
                                      ? colors.blue
                                      : colors.orange,
                                }}>
                                  {session.trainingSubject}
                                </span>
                              </td>
                              <td className="px-5 py-3.5 text-sm" style={{ color: colors.text }}>
                                {session.lecturerName}
                              </td>
                              <td className="px-5 py-3.5 text-sm font-mono" style={{ color: colors.textSecondary }}>
                                {uniqueEmps}
                              </td>
                              <td className="px-5 py-3.5 text-sm font-mono" style={{ color: colors.textSecondary }}>
                                {uniqueSops}
                              </td>
                              <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => handleDownload(session)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:scale-105 active:scale-95"
                                  style={{
                                    backgroundColor: theme === 'dark' ? `${colors.blue}26` : `${colors.blue}1a`,
                                    color: colors.blue,
                                  }}
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                  </svg>
                                  {t('trainingRecords.actions.pdf')}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                        {sessions.length === 0 && (
                          <tr>
                            <td colSpan={7} className="px-5 py-16 text-center text-sm" style={{ color: colors.textSecondary }}>
                              {t('trainingRecords.empty')}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                </div>
              )}

              {/* === BACK: Detail View === */}
              {isFlipped && selectedSession && (
                <div ref={backRef}>
                  {/* Session info header - matches training page employee header */}
                  <div
                    className="flex items-center gap-4 px-5 py-4 rounded-t-2xl border border-b-0"
                    style={{
                      backgroundColor: colors.bgSecondary,
                      borderColor: colors.border,
                    }}
                  >
                    <div className="flex-1">
                      <h3 style={{ color: colors.text }} className="text-base font-semibold">
                        {selectedSession.trainingSubject}
                        <span className="ml-2 font-mono text-sm" style={{ color: colors.textSecondary }}>
                          #{selectedSession.trainingNo}
                        </span>
                      </h3>
                      <p style={{ color: colors.textSecondary }} className="text-xs mt-0.5">
                        {formatDate(selectedSession.trainingDate)} · {selectedSession.trainingTimeStart} – {selectedSession.trainingTimeEnd} · {selectedSession.lecturerName} · {t('trainingRecords.fields.employees')}: {uniqueEmployees.length} · {t('trainingRecords.fields.sops')}: {groupedBySop.length}
                      </p>
                    </div>
                    <span
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium"
                      style={{
                        backgroundColor: selectedSession.evaluationMethod === 'self_training'
                          ? (theme === 'dark' ? `${colors.indigo}26` : `${colors.indigo}1a`)
                          : (theme === 'dark' ? `${colors.blue}26` : `${colors.blue}1a`),
                        color: selectedSession.evaluationMethod === 'self_training' ? colors.indigo : colors.blue,
                      }}
                    >
                      {selectedSession.evaluationMethod === 'self_training' ? t('trainingRecords.evaluation.selfTraining') : t('trainingRecords.evaluation.oralQA')}
                    </span>
                  </div>

                  {/* Two columns - matches training page layout */}
                  <div className="flex gap-4">
                    {/* LEFT: SOPs */}
                    <div
                      className="flex-1 rounded-bl-2xl border overflow-hidden"
                      style={{
                        backgroundColor: colors.bgSecondary,
                        borderColor: colors.border,
                      }}
                    >
                      <div
                        className="px-4 py-2.5 border-b text-xs font-semibold uppercase tracking-wider"
                        style={{ color: colors.textTertiary, borderColor: colors.border, backgroundColor: theme === 'dark' ? 'rgba(59,130,246,0.06)' : 'rgba(59,130,246,0.04)' }}
                      >
                        {t('trainingRecords.detail.sops', { count: groupedBySop.length })}
                      </div>
                      <table className="w-full">
                        <thead>
                          <tr style={{ borderColor: colors.border }} className="border-b">
                            <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ color: colors.textTertiary }}>{t('trainingRecords.detail.columns.sopNo')}</th>
                            <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ color: colors.textTertiary }}>{t('trainingRecords.detail.columns.version')}</th>
                            <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ color: colors.textTertiary }}>{t('trainingRecords.detail.columns.trainees')}</th>
                            {editMode && (
                              <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ color: colors.red }}>{t('trainingRecords.detail.columns.remove')}</th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {groupedBySop.map(sop => (
                            <tr key={`${sop.sopNo}|${sop.sopVersion}`} style={{ borderColor: colors.border }} className="border-b last:border-b-0">
                              <td className="px-4 py-2.5 text-sm font-mono" style={{ color: colors.text }}>{sop.sopNo}</td>
                              <td className="px-4 py-2.5 text-sm" style={{ color: colors.textSecondary }}>{sop.sopVersion}</td>
                              <td className="px-4 py-2.5 text-sm" style={{ color: colors.textSecondary }}>{sop.employees.length}</td>
                              {editMode && (
                                <td className="px-4 py-2.5">
                                  <button
                                    onClick={() => sop.employees.forEach(r => handleRemoveRecord(selectedSession.id, r.id))}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold"
                                    style={{ backgroundColor: colors.red, color: colors.white }}
                                  >
                                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                    </svg>
                                    {t('trainingRecords.actions.remove')}
                                  </button>
                                </td>
                              )}
                            </tr>
                          ))}
                          {groupedBySop.length === 0 && (
                            <tr>
                              <td colSpan={editMode ? 4 : 3} className="px-4 py-8 text-center text-sm" style={{ color: colors.textSecondary }}>
                                {t('trainingRecords.detail.noSops')}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* RIGHT: Employees */}
                    <div
                      className="flex-1 rounded-br-2xl border overflow-hidden"
                      style={{
                        backgroundColor: colors.bgSecondary,
                        borderColor: colors.border,
                      }}
                    >
                      <div
                        className="px-4 py-2.5 border-b text-xs font-semibold uppercase tracking-wider flex items-center justify-between"
                        style={{ color: colors.textTertiary, borderColor: colors.border, backgroundColor: theme === 'dark' ? 'rgba(34,197,94,0.06)' : 'rgba(34,197,94,0.04)' }}
                      >
                        <span>{t('trainingRecords.detail.employees', { count: groupedByEmployee.length })}</span>
                        <div className="flex items-center gap-2">
                          {/* Edit button */}
                          <button
                            onClick={() => setEditMode(!editMode)}
                            className="px-2.5 py-1 rounded-md text-xs font-medium transition-all"
                            style={{
                              backgroundColor: editMode ? `${colors.red}26` : (theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'),
                              color: editMode ? colors.red : colors.textSecondary,
                            }}
                          >
                            {editMode ? t('trainingRecords.actions.done') : t('trainingRecords.actions.edit')}
                          </button>
                          {/* Delete session */}
                          <button
                            onClick={() => setDeleteConfirm(selectedSession.id)}
                            className="px-2.5 py-1 rounded-md text-xs font-medium transition-all"
                            style={{ backgroundColor: `${colors.red}1a`, color: colors.red }}
                          >
                            🗑
                          </button>
                        </div>
                      </div>
                      <table className="w-full">
                        <thead>
                          <tr style={{ borderColor: colors.border }} className="border-b">
                            <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ color: colors.textTertiary }}>{t('trainingRecords.detail.columns.employeeNo')}</th>
                            <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ color: colors.textTertiary }}>{t('trainingRecords.detail.columns.sopsCol')}</th>
                            {editMode && (
                              <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ color: colors.red }}>{t('trainingRecords.detail.columns.remove')}</th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {groupedByEmployee.map(emp => (
                            <tr key={emp.employeeNo} style={{ borderColor: colors.border }} className="border-b last:border-b-0">
                              <td className="px-4 py-2.5 text-sm font-mono" style={{ color: colors.text }}>{emp.employeeNo}</td>
                              <td className="px-4 py-2.5 text-xs" style={{ color: colors.textSecondary }}>
                                {emp.sops.map(s => `${s.sopNo} ${s.sopVersion}`).join(', ')}
                              </td>
                              {editMode && (
                                <td className="px-4 py-2.5">
                                  <button
                                    onClick={() => emp.sops.forEach(r => handleRemoveRecord(selectedSession.id, r.id))}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold"
                                    style={{ backgroundColor: colors.red, color: colors.white }}
                                  >
                                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                    </svg>
                                    {t('trainingRecords.actions.remove')}
                                  </button>
                                </td>
                              )}
                            </tr>
                          ))}
                          {groupedByEmployee.length === 0 && (
                            <tr>
                              <td colSpan={editMode ? 3 : 2} className="px-4 py-8 text-center text-sm" style={{ color: colors.textSecondary }}>
                                {t('trainingRecords.detail.noEmployees')}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Delete confirmation modal */}
      {deleteConfirm && selectedSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDeleteConfirm(null)} />
          <div
            className="relative z-10 rounded-2xl p-6 max-w-sm w-full mx-4 border"
            style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
          >
            <h3 className="text-lg font-semibold mb-2" style={{ color: colors.text }}>{t('trainingRecords.delete.title')}</h3>
            <p className="text-sm mb-4" style={{ color: colors.textSecondary }}>
              {t('trainingRecords.delete.message', { trainingNo: selectedSession.trainingNo, count: selectedSession.records.length })}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.1)' : colors.gray5, color: colors.text }}
              >
                {t('trainingRecords.delete.cancel')}
              </button>
              <button
                onClick={() => handleDeleteSession(deleteConfirm)}
                className="px-4 py-2 rounded-lg text-sm font-semibold"
                style={{ backgroundColor: colors.red, color: colors.white }}
              >
                {t('trainingRecords.delete.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
