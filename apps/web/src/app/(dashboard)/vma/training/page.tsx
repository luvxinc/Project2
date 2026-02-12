'use client';

import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useEffect, useState, useCallback, useRef } from 'react';
import { animate, stagger } from 'animejs';
import { useModal } from '@/components/modal/GlobalModal';
import VmaTabSelector from '../components/VmaTabSelector';

const API = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/v1`;

// ================================
// Types
// ================================
interface MissingSopDetail {
  sopNo: string;
  name: string;
  version: string;
  daNo: string;
  effectiveDate: string;
}

interface EmployeeTrainingStatus {
  employeeNo: string;
  lastName: string;
  firstName: string;
  hireDate: string;
  totalRequired: number;
  completedCount: number;
  missingCount: number;
  missingSops: MissingSopDetail[];
  status: 'COMPLETE' | 'MISSING';
}

interface TrainingRecord {
  id: string;
  employeeNo: string;
  sopNo: string;
  sopVersion: string;
  completedAt: string | null;
  trainerId: string | null;
  trainingDate: string;
  trainingNo: string | null;
  trainingLocation: string | null;
  trainingDuration: number | null;
}

interface SimpleEmployee {
  id: string;
  employeeNo: string;
  firstName: string;
  lastName: string;
}

// ================================
// Roadmap Types
// ================================
interface RoadmapChange {
  changeType: string;
  sopNo: string;
  departmentId: string;
}
interface RoadmapSummary {
  totalEmployees: number;
  compliant: number;
  nonCompliant: number;
  totalRequired: number;
  totalCompleted: number;
  completionRate: number;
}
interface RoadmapNonCompliant {
  employeeNo: string;
  name: string;
  required: number;
  completed: number;
  missing: number;
  compliant: boolean;
}
interface RoadmapMilestone {
  date: string;
  changeType: 'INITIAL' | 'CHANGE';
  changes: RoadmapChange[];
  summary: RoadmapSummary;
  topNonCompliant: RoadmapNonCompliant[];
}

export default function TrainingPage() {
  const t = useTranslations('vma');
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const { showConfirm } = useModal();
  const [employees, setEmployees] = useState<EmployeeTrainingStatus[]>([]);
  const [loading, setLoading] = useState(true);

  // Detail view state
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeTrainingStatus | null>(null);
  const [records, setRecords] = useState<TrainingRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);

  // Smart Fill modal state
  const [showModal, setShowModal] = useState(false);
  const [allEmployees, setAllEmployees] = useState<SimpleEmployee[]>([]);
  const [trainingDate, setTrainingDate] = useState(() => {
    const now = new Date();
    return now.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  });
  const [lecturerNo, setLecturerNo] = useState('');
  const [smartFillRunning, setSmartFillRunning] = useState(false);
  const [smartFillResult, setSmartFillResult] = useState<{ message: string; downloadUrl?: string } | null>(null);

  // Roadmap state
  const [showRoadmap, setShowRoadmap] = useState(false);
  const [roadmapData, setRoadmapData] = useState<RoadmapMilestone[]>([]);
  const [roadmapLoading, setRoadmapLoading] = useState(false);

  const api = useCallback(async (path: string) => {
    const token = document.cookie.match(/auth_session=([^;]+)/)?.[1];
    const res = await fetch(`${API}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  }, []);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api('/vma/training-records/status');
      setEmployees(data);
    } catch (err) {
      console.error('Failed to load training status:', err);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { loadData(); }, [loadData]);

  // Load employees for lecturer dropdown
  const loadEmployees = useCallback(async () => {
    try {
      const res = await api('/vma/employees');
      const employees = res.data || res;
      setAllEmployees(employees);
      // Default lecturer: Pham, Phuoc
      const phuoc = employees.find((e: SimpleEmployee) => e.lastName === 'Pham' && e.firstName === 'Phuoc');
      if (phuoc) setLecturerNo(phuoc.employeeNo);
    } catch (err) {
      console.error('Failed to load employees:', err);
    }
  }, [api]);

  const openModal = useCallback(() => {
    setShowModal(true);
    setSmartFillResult(null);
    loadEmployees();
  }, [loadEmployees]);

  const handleSmartFill = useCallback(async () => {
    setSmartFillRunning(true);
    setSmartFillResult(null);
    try {
      const token = document.cookie.match(/auth_session=([^;]+)/)?.[1];
      const res = await fetch(`${API}/vma/training-records/smart-fill`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ cutoffDate: trainingDate, lecturerNo }),
      });
      const result = await res.json();
      if (res.ok) {
        setSmartFillResult({ message: result.message || 'Training records generated!', downloadUrl: result.downloadUrl });
        loadData();
      } else {
        setSmartFillResult({ message: 'Error: ' + (result.message || 'Unknown error') });
      }
    } catch (err) {
      console.error('Smart fill failed:', err);
      setSmartFillResult({ message: 'Network error' });
    } finally {
      setSmartFillRunning(false);
    }
  }, [trainingDate, lecturerNo, loadData]);

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });

  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);

  // Slide: list dashes left, detail dashes in from right
  const handleEmployeeClick = useCallback(async (emp: EmployeeTrainingStatus) => {
    setSelectedEmployee(emp);
    setLoadingRecords(true);

    // Calculate distance to left/right screen edge
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

    try {
      const data = await api(`/vma/training-records/employee/${emp.employeeNo}`);
      setRecords(data);
    } catch (err) {
      console.error('Failed to load records:', err);
      setRecords([]);
    } finally {
      setLoadingRecords(false);
    }
  }, [api]);

  // Slide back: detail dashes right, list dashes in from left
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
      setSelectedEmployee(null);
      setRecords([]);
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

  return (
    <div style={{ backgroundColor: colors.bg }} className="min-h-screen pb-20 overflow-x-hidden">
      <section className="pt-12 pb-6 px-6">
        <div className="max-w-[1200px] mx-auto">
          <VmaTabSelector />
        </div>
      </section>

      <div className="max-w-[1400px] mx-auto px-6">
        {/* Header */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 style={{ color: colors.text }} className="text-xl font-semibold mb-1">
                {t('training.title')}
              </h2>
              <p style={{ color: colors.textSecondary }} className="text-sm">
                {t('training.stats.employees', { count: employees.length })} ·{' '}
                {t('training.stats.complete', { count: employees.filter(e => e.status === 'COMPLETE').length })} ·{' '}
                <span style={{ color: '#EF4444' }}>
                  {t('training.stats.missing', { count: employees.filter(e => e.status === 'MISSING').length })}
                </span>
              </p>
            </div>
            <button
              onClick={openModal}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:scale-105 active:scale-95"
              style={{
                backgroundColor: theme === 'dark' ? '#3B82F6' : '#2563EB',
                color: '#FFFFFF',
              }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {t('training.actions.smartFill')}
            </button>
          </div>
        </div>

        {/* Flip Card Container */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Click-outside overlay when flipped */}
            {isFlipped && (
              <div
                className="fixed inset-0 z-10"
                onClick={handleBack}
              />
            )}
            <div className="relative z-20">
              {/* === FRONT: Employee List === */}
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
                            {t('training.fields.employeeId')}
                          </th>
                          <th className="text-left px-5 py-3.5 text-xs font-semibold uppercase tracking-wider" style={{ color: colors.textTertiary }}>
                            {t('training.fields.employeeName')}
                          </th>
                          <th className="text-left px-5 py-3.5 text-xs font-semibold uppercase tracking-wider" style={{ color: colors.textTertiary }}>
                            {t('training.fields.hireDate')}
                          </th>
                          <th className="text-left px-5 py-3.5 text-xs font-semibold uppercase tracking-wider" style={{ color: colors.textTertiary }}>
                            {t('training.fields.required')}
                          </th>
                          <th className="text-left px-5 py-3.5 text-xs font-semibold uppercase tracking-wider" style={{ color: colors.textTertiary }}>
                            {t('training.fields.status')}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {employees.map((emp) => (
                          <tr
                            key={emp.employeeNo}
                            onClick={() => handleEmployeeClick(emp)}
                            style={{ borderColor: colors.border }}
                            className="border-b last:border-b-0 transition-colors cursor-pointer hover:opacity-80"
                          >
                            <td className="px-5 py-3.5 text-sm font-mono" style={{ color: colors.text }}>
                              {emp.employeeNo}
                            </td>
                            <td className="px-5 py-3.5 text-sm font-medium" style={{ color: colors.text }}>
                              {emp.lastName}, {emp.firstName}
                            </td>
                            <td className="px-5 py-3.5 text-sm" style={{ color: colors.textSecondary }}>
                              {formatDate(emp.hireDate)}
                            </td>
                            <td className="px-5 py-3.5 text-sm" style={{ color: colors.textSecondary }}>
                              {emp.totalRequired}
                            </td>
                            <td className="px-5 py-3.5">
                              {emp.status === 'COMPLETE' ? (
                                <span
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
                                  style={{
                                    backgroundColor: theme === 'dark' ? 'rgba(34,197,94,0.15)' : 'rgba(34,197,94,0.1)',
                                    color: '#22C55E',
                                  }}
                                >
                                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                  </svg>
                                  {t('training.status.complete')}
                                </span>
                              ) : (
                                <span
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold"
                                  style={{ backgroundColor: '#EF4444', color: '#FFFFFF' }}
                                >
                                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                  </svg>
                                  {t('training.status.missing', { count: emp.missingCount })}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                </div>
              )}

              {/* === BACK: Two-column detail (left=records, right=missing) === */}
              {isFlipped && selectedEmployee && (
                <div ref={backRef}>
                    {/* Employee info header */}
                    <div
                      className="flex items-center gap-4 px-5 py-4 rounded-t-2xl border border-b-0"
                      style={{
                        backgroundColor: colors.bgSecondary,
                        borderColor: colors.border,
                      }}
                    >
                      <div className="flex-1">
                        <h3 style={{ color: colors.text }} className="text-base font-semibold">
                          {selectedEmployee.lastName}, {selectedEmployee.firstName}
                          <span className="ml-2 font-mono text-sm" style={{ color: colors.textSecondary }}>
                            #{selectedEmployee.employeeNo}
                          </span>
                        </h3>
                        <p style={{ color: colors.textSecondary }} className="text-xs mt-0.5">
                          {t('training.fields.hireDate')}: {formatDate(selectedEmployee.hireDate)} · {records.length} trained · {selectedEmployee.missingCount} missing
                        </p>
                      </div>
                      {selectedEmployee.status === 'COMPLETE' ? (
                        <span
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium"
                          style={{
                            backgroundColor: theme === 'dark' ? 'rgba(34,197,94,0.15)' : 'rgba(34,197,94,0.1)',
                            color: '#22C55E',
                          }}
                        >
                          ✓ {t('training.status.complete')}
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold"
                          style={{ backgroundColor: '#EF4444', color: '#FFFFFF' }}
                        >
                          {t('training.status.missing', { count: selectedEmployee.missingCount })}
                        </span>
                      )}
                    </div>

                    {/* Two columns */}
                    <div className="flex gap-4">
                      {/* LEFT: Completed training records */}
                      <div
                        className="flex-1 rounded-bl-2xl border overflow-hidden"
                        style={{
                          backgroundColor: colors.bgSecondary,
                          borderColor: colors.border,
                        }}
                      >
                        <div
                          className="px-4 py-2.5 border-b text-xs font-semibold uppercase tracking-wider"
                          style={{ color: colors.textTertiary, borderColor: colors.border, backgroundColor: theme === 'dark' ? 'rgba(34,197,94,0.06)' : 'rgba(34,197,94,0.04)' }}
                        >
                          {t('training.detail.trained', { count: records.length })}
                        </div>
                        {loadingRecords ? (
                          <div className="flex justify-center py-12">
                            <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                          </div>
                        ) : (
                          <table className="w-full">
                            <thead>
                              <tr style={{ borderColor: colors.border }} className="border-b">
                                <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ color: colors.textTertiary }}>{t('training.detail.columns.sopNo')}</th>
                                <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ color: colors.textTertiary }}>{t('training.detail.columns.version')}</th>
                                <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ color: colors.textTertiary }}>{t('training.detail.columns.trainingNo')}</th>
                                <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ color: colors.textTertiary }}>{t('training.detail.columns.date')}</th>
                                <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ color: colors.textTertiary }}>{t('training.detail.columns.trainer')}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {records.length === 0 ? (
                                <tr>
                                  <td colSpan={5} className="text-center py-10 text-sm" style={{ color: colors.textTertiary }}>
                                    {t('training.detail.noRecords')}
                                  </td>
                                </tr>
                              ) : records.map((rec) => (
                                <tr
                                  key={rec.id}
                                  style={{ borderColor: colors.border }}
                                  className="border-b last:border-b-0"
                                >
                                  <td className="px-4 py-2.5 text-sm font-mono" style={{ color: colors.text }}>{rec.sopNo}</td>
                                  <td className="px-4 py-2.5 text-sm" style={{ color: colors.textSecondary }}>{rec.sopVersion}</td>
                                  <td className="px-4 py-2.5 text-sm font-mono" style={{ color: colors.text }}>{rec.trainingNo || '—'}</td>
                                  <td className="px-4 py-2.5 text-sm" style={{ color: colors.textSecondary }}>{formatDate(rec.trainingDate)}</td>
                                  <td className="px-4 py-2.5 text-sm" style={{ color: colors.textSecondary }}>{rec.trainerId || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>

                      {/* RIGHT: Missing SOP details */}
                      <div
                        className="flex-1 min-w-0 rounded-br-2xl border overflow-hidden"
                        style={{
                          backgroundColor: colors.bgSecondary,
                          borderColor: colors.border,
                        }}
                      >
                        <div
                          className="px-4 py-2.5 border-b text-xs font-semibold uppercase tracking-wider"
                          style={{ color: '#EF4444', borderColor: colors.border, backgroundColor: 'rgba(239,68,68,0.06)' }}
                        >
                          {t('training.detail.missingSops', { count: selectedEmployee.missingCount })}
                        </div>
                        {selectedEmployee.missingSops.length === 0 ? (
                          <div className="text-center py-10 text-sm" style={{ color: colors.textTertiary }}>
                            All training complete
                          </div>
                        ) : (
                          <table className="w-full">
                            <thead>
                              <tr style={{ borderColor: colors.border }} className="border-b">
                                <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: colors.textTertiary, width: '120px' }}>{t('training.detail.columns.sopNo')}</th>
                                <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ color: colors.textTertiary }}>{t('training.detail.columns.name')}</th>
                                <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ color: colors.textTertiary, width: '50px' }}>{t('training.detail.columns.version')}</th>
                                <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ color: colors.textTertiary, width: '80px' }}>{t('training.detail.columns.da')}</th>
                                <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: colors.textTertiary, width: '100px' }}>{t('training.detail.columns.effective')}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {selectedEmployee.missingSops.map((sop) => (
                                <tr
                                  key={`${sop.sopNo}-${sop.version}`}
                                  style={{ borderColor: colors.border }}
                                  className="border-b last:border-b-0"
                                >
                                  <td className="px-4 py-2.5 text-sm font-mono font-medium whitespace-nowrap" style={{ color: '#EF4444' }}>{sop.sopNo}</td>
                                  <td className="px-4 py-2.5 text-sm" style={{ color: colors.text, lineHeight: '1.4' }}>{sop.name}</td>
                                  <td className="px-4 py-2.5 text-sm" style={{ color: colors.textSecondary }}>{sop.version.replace(/^Rev\s*/i, '')}</td>
                                  <td className="px-4 py-2.5 text-sm font-mono whitespace-nowrap" style={{ color: colors.textSecondary }}>{sop.daNo === 'DA-2500' ? 'Initial' : sop.daNo}</td>
                                  <td className="px-4 py-2.5 text-sm whitespace-nowrap" style={{ color: colors.textSecondary }}>{formatDate(sop.effectiveDate)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ==================== SMART FILL MODAL ==================== */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => !smartFillRunning && setShowModal(false)}
          />
          {/* Modal */}
          <div
            className="relative w-full max-w-lg rounded-2xl border shadow-2xl p-6"
            style={{
              backgroundColor: colors.bgSecondary,
              borderColor: colors.border,
            }}
          >
            <h3 style={{ color: colors.text }} className="text-lg font-semibold mb-5">
              {t('training.smartFill.title')}
            </h3>

            {/* Date input */}
            <div className="mb-4">
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: colors.textTertiary }}>
                {t('training.smartFill.cutoffDate')}
              </label>
              <div className="relative">
                <input
                  ref={dateRef}
                  type="date"
                  value={trainingDate}
                  onChange={(e) => setTrainingDate(e.target.value)}
                  className="w-full pl-3 pr-10 py-2 rounded-lg border text-sm"
                  style={{
                    backgroundColor: colors.bg,
                    borderColor: colors.border,
                    color: colors.text,
                    colorScheme: theme === 'dark' ? 'dark' : 'light',
                  }}
                />
                <button
                  type="button"
                  onClick={() => dateRef.current?.showPicker?.()}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md transition-colors hover:bg-gray-500/20"
                  style={{ color: colors.textSecondary }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Lecturer dropdown */}
            <div className="mb-6">
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: colors.textTertiary }}>
                {t('training.smartFill.lecturer')}
              </label>
              <select
                value={lecturerNo}
                onChange={(e) => setLecturerNo(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm"
                style={{
                  backgroundColor: colors.bg,
                  borderColor: colors.border,
                  color: colors.text,
                }}
              >
                <option value="">{t('training.smartFill.selectLecturer')}</option>
                {allEmployees.map((emp) => (
                  <option key={emp.employeeNo} value={emp.employeeNo}>
                    {emp.lastName}, {emp.firstName} ({emp.employeeNo})
                  </option>
                ))}
              </select>
            </div>

            {/* Smart Fill button */}
            <button
              onClick={handleSmartFill}
              disabled={smartFillRunning || !lecturerNo}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold transition-all"
              style={{
                backgroundColor: smartFillRunning ? '#6B7280' : '#22C55E',
                color: '#FFFFFF',
                opacity: !lecturerNo ? 0.5 : 1,
              }}
            >
              {smartFillRunning ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {t('training.smartFill.generating')}
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  {t('training.smartFill.button')}
                </>
              )}
            </button>

            {/* Result / Download */}
            {smartFillResult && (
              <div className="mt-4 p-3 rounded-lg text-sm" style={{ backgroundColor: colors.bg, color: colors.text }}>
                <p>{smartFillResult.message}</p>
                {smartFillResult.downloadUrl && (
                  <button
                    onClick={async () => {
                      try {
                        const token = document.cookie.match(/auth_session=([^;]+)/)?.[1];
                        const resp = await fetch(`${API}${smartFillResult.downloadUrl}`, {
                          headers: token ? { Authorization: `Bearer ${token}` } : {},
                        });
                        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                        const blob = await resp.blob();
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = smartFillResult.downloadUrl!.split('/').pop() || 'training.pdf';
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                      } catch (err) {
                        console.error('Download failed:', err);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors hover:opacity-90"
                    style={{ backgroundColor: '#3B82F6', color: '#FFFFFF' }}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    {t('training.smartFill.download')}
                  </button>
                )}
              </div>
            )}

            {/* Close */}
            <button
              onClick={() => setShowModal(false)}
              disabled={smartFillRunning}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full transition-colors hover:bg-gray-500/20"
              style={{ color: colors.textSecondary }}
            >
              ✕
            </button>
          </div>
        </div>
      )}
      {/* ================================ */}
      {/* TRAINING COMPLIANCE ROADMAP MODAL */}
      {/* ================================ */}
      {showRoadmap && (
        <TrainingRoadmapModal
          milestones={roadmapData}
          loading={roadmapLoading}
          colors={colors}
          theme={theme}
          t={t}
          onClose={() => setShowRoadmap(false)}
        />
      )}
    </div>
  );
}

// ================================
// Training Roadmap Modal Component
// ================================
function TrainingRoadmapModal({
  milestones,
  loading,
  colors,
  theme,
  t,
  onClose,
}: {
  milestones: RoadmapMilestone[];
  loading: boolean;
  colors: any;
  theme: string;
  t: any;
  onClose: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const roadRef = useRef<HTMLDivElement>(null);
  const [animated, setAnimated] = useState(false);

  const CARD_W = 220;
  const GAP = 50;
  const totalWidth = Math.max(milestones.length * (CARD_W + GAP) + 80, 600);

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'America/Los_Angeles',
    });

  // ===== Roadmap entrance animation =====
  useEffect(() => {
    if (loading || milestones.length === 0 || animated) return;
    const container = scrollRef.current;
    if (!container) return;
    container.scrollLeft = 0;

    // 1) Road line draws left→right
    if (roadRef.current) {
      animate(roadRef.current, {
        scaleX: [0, 1],
        duration: 800,
        ease: 'out(3)',
      });
    }

    // 2) Nodes pop in
    const nodes = container.querySelectorAll('.rm-node');
    if (nodes.length) {
      animate(nodes, {
        scale: [0, 1],
        opacity: [0, 1],
        delay: stagger(120, { start: 300 }),
        duration: 400,
        ease: 'out(3)',
      });
    }

    // 3) Cards slide in
    const cards = container.querySelectorAll('.rm-card');
    if (cards.length) {
      animate(cards, {
        translateY: ((_el: any, i: number) => [i % 2 === 0 ? -30 : 30, 0]) as any,
        opacity: [0, 1],
        delay: stagger(120, { start: 500 }),
        duration: 500,
        ease: 'out(3)',
      });
    }

    // 4) Date labels
    const dates = container.querySelectorAll('.rm-date');
    if (dates.length) {
      animate(dates, {
        opacity: [0, 1],
        delay: stagger(120, { start: 700 }),
        duration: 400,
        ease: 'out(2)',
      });
    }

    // 5) Stems
    const stems = container.querySelectorAll('.rm-stem');
    if (stems.length) {
      animate(stems, {
        scaleY: [0, 1],
        opacity: [0, 1],
        delay: stagger(120, { start: 450 }),
        duration: 300,
        ease: 'out(2)',
      });
    }

    // Auto-scroll to latest
    const totalDuration = 500 + milestones.length * 120 + 500;
    setTimeout(() => {
      container.scrollTo({ left: container.scrollWidth, behavior: 'smooth' });
    }, totalDuration);

    setAnimated(true);
  }, [loading, milestones.length, animated]);

  // Compliance rate color
  const rateColor = (rate: number) => {
    if (rate >= 90) return '#22C55E';
    if (rate >= 70) return '#F59E0B';
    return '#EF4444';
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="rounded-2xl border shadow-2xl overflow-hidden w-[95vw] max-w-[1400px]"
        style={{
          backgroundColor: colors.bg,
          borderColor: colors.border,
          maxHeight: '85vh',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: colors.border }}
        >
          <div>
            <h3 className="text-lg font-bold" style={{ color: colors.text }}>
              {t('training.roadmap.title') || 'Training Compliance Roadmap'}
            </h3>
            <p className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>
              {t('training.roadmap.description') || 'Training compliance snapshots at each SOP change event'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {!loading && milestones.length > 0 && (
              <span className="text-xs px-3 py-1 rounded-full" style={{
                backgroundColor: theme === 'dark' ? 'rgba(139,92,246,0.2)' : 'rgba(139,92,246,0.1)',
                color: '#8b5cf6',
              }}>
                {milestones.length} {t('training.roadmap.milestones') || 'milestones'}
              </span>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full transition-colors hover:bg-gray-500/20"
              style={{ color: colors.textSecondary }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-6 h-6 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm" style={{ color: colors.textSecondary }}>
              {t('training.roadmap.loading') || 'Computing compliance snapshots...'}
            </span>
          </div>
        ) : milestones.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <span className="text-sm" style={{ color: colors.textSecondary }}>
              {t('training.roadmap.noData') || 'No SOP change events found'}
            </span>
          </div>
        ) : (
          <div
            ref={scrollRef}
            className="overflow-x-auto overflow-y-hidden px-6 py-4"
            style={{ scrollbarWidth: 'thin' }}
          >
            {/* Roadmap container */}
            <div className="relative" style={{ width: totalWidth, height: '380px' }}>

              {/* Horizontal road line */}
              <div
                ref={roadRef}
                className="absolute left-0 right-0"
                style={{
                  top: '185px',
                  height: '3px',
                  background: `linear-gradient(90deg, ${colors.border} 0%, #8b5cf6 30%, #8b5cf6 70%, ${colors.border} 100%)`,
                  transformOrigin: 'left center',
                }}
              />

              {/* Milestone nodes + cards */}
              {milestones.map((ms, gi) => {
                const isLatest = gi === milestones.length - 1;
                const isAbove = gi % 2 === 0;
                const xPos = 40 + gi * (CARD_W + GAP);
                const rate = ms.summary.completionRate;
                const nodeColor = rateColor(rate);

                return (
                  <div key={gi} className="absolute" style={{ left: xPos, width: CARD_W }}>

                    {/* NODE on road */}
                    <div className="rm-node absolute left-1/2 -translate-x-1/2 z-10" style={{ top: '176px' }}>
                      <div
                        className="w-5 h-5 rounded-full border-2 transition-all"
                        style={{
                          borderColor: nodeColor,
                          backgroundColor: isLatest ? nodeColor : colors.bgSecondary,
                          boxShadow: isLatest ? `0 0 14px ${nodeColor}66` : 'none',
                        }}
                      />
                    </div>

                    {/* CARD */}
                    <div
                      className="rm-card absolute w-full"
                      style={{
                        top: isAbove ? 'auto' : '205px',
                        bottom: isAbove ? `${380 - 170}px` : 'auto',
                      }}
                    >
                      {/* Stem */}
                      <div
                        className="rm-stem absolute left-1/2 -translate-x-1/2"
                        style={{
                          width: '1px',
                          backgroundColor: nodeColor,
                          ...(isAbove
                            ? { bottom: '0', height: '14px' }
                            : { top: '0', height: '14px' }),
                        }}
                      />

                      {/* Card body */}
                      <div
                        className="rounded-xl border px-3 py-2.5"
                        style={{
                          backgroundColor: theme === 'dark'
                            ? 'rgba(30,30,40,0.85)'
                            : 'rgba(255,255,255,0.9)',
                          borderColor: isLatest ? nodeColor : colors.border,
                          backdropFilter: 'blur(12px)',
                          boxShadow: isLatest
                            ? `0 4px 20px ${nodeColor}22`
                            : '0 2px 8px rgba(0,0,0,0.08)',
                        }}
                      >
                        {/* Latest badge */}
                        {isLatest && (
                          <div className="flex justify-center mb-1">
                            <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                              style={{ backgroundColor: `${nodeColor}22`, color: nodeColor }}
                            >
                              {t('training.roadmap.latest') || 'Latest'}
                            </span>
                          </div>
                        )}

                        {/* Compliance gauge */}
                        <div className="flex items-center justify-center gap-2 mb-1.5">
                          <div className="relative w-10 h-10">
                            <svg viewBox="0 0 36 36" className="w-10 h-10">
                              <path
                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                fill="none"
                                stroke={theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}
                                strokeWidth="3"
                              />
                              <path
                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                fill="none"
                                stroke={nodeColor}
                                strokeWidth="3"
                                strokeDasharray={`${rate}, 100`}
                                strokeLinecap="round"
                              />
                            </svg>
                            <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold" style={{ color: nodeColor }}>
                              {rate}%
                            </span>
                          </div>
                          <div className="text-left">
                            <div className="text-[10px] font-semibold" style={{ color: colors.text }}>
                              {ms.summary.compliant}/{ms.summary.totalEmployees}
                            </div>
                            <div className="text-[9px]" style={{ color: colors.textTertiary }}>
                              {t('training.roadmap.compliant') || 'compliant'}
                            </div>
                          </div>
                        </div>

                        {/* Changes */}
                        <div className="space-y-0.5">
                          {ms.changes.slice(0, 3).map((c, ci) => (
                            <div key={ci} className="flex items-center gap-1 text-[9px]">
                              <span
                                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                style={{
                                  backgroundColor: c.changeType === 'ADD' || c.changeType === 'INITIAL'
                                    ? '#22C55E' : '#EF4444',
                                }}
                              />
                              <span style={{ color: colors.textSecondary }} className="truncate">
                                {c.changeType === 'INITIAL' ? '⚡' : c.changeType === 'ADD' ? '+' : '−'} {c.sopNo}
                              </span>
                            </div>
                          ))}
                          {ms.changes.length > 3 && (
                            <div className="text-[9px]" style={{ color: colors.textTertiary }}>
                              +{ms.changes.length - 3} more
                            </div>
                          )}
                        </div>

                        {/* Non-compliant employees */}
                        {ms.topNonCompliant.length > 0 && (
                          <div className="mt-1 pt-1 border-t" style={{ borderColor: colors.border }}>
                            <div className="text-[8px] font-semibold uppercase mb-0.5" style={{ color: '#EF4444' }}>
                              ⚠ {t('training.roadmap.nonCompliant') || 'Non-compliant'}
                            </div>
                            {ms.topNonCompliant.slice(0, 3).map((nc, ni) => (
                              <div key={ni} className="text-[8px] truncate" style={{ color: colors.textSecondary }}>
                                {nc.name} ({nc.completed}/{nc.required})
                              </div>
                            ))}
                            {ms.topNonCompliant.length > 3 && (
                              <div className="text-[8px]" style={{ color: colors.textTertiary }}>
                                +{ms.topNonCompliant.length - 3} more
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* DATE LABEL */}
                    <div
                      className="rm-date absolute left-1/2 -translate-x-1/2 text-center whitespace-nowrap"
                      style={{
                        top: isAbove ? '198px' : '168px',
                        transform: isAbove ? 'translateX(-50%)' : 'translateX(-50%) translateY(-100%)',
                      }}
                    >
                      <span className="text-[9px] font-medium" style={{ color: isLatest ? nodeColor : colors.textTertiary }}>
                        {fmtDate(ms.date)}
                      </span>
                      {ms.changeType === 'INITIAL' && (
                        <div className="text-[8px]" style={{ color: '#8b5cf6' }}>
                          {t('training.roadmap.initial') || 'Initial'}
                        </div>
                      )}
                    </div>

                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer */}
        {!loading && milestones.length > 0 && (
          <div
            className="flex items-center justify-between px-6 py-3 border-t text-xs"
            style={{ borderColor: colors.border, color: colors.textTertiary }}
          >
            <span>
              {t('training.roadmap.scrollHint') || 'Scroll to see the full compliance timeline'}
            </span>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#22C55E' }} />
                ≥90%
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#F59E0B' }} />
                70-89%
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#EF4444' }} />
                &lt;70%
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
