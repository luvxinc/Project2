'use client';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useEmployees, useDepartments, vmaKeys, vmaFetch } from '@/lib/hooks/use-vma-queries';
import VmaTabSelector from '../components/VmaTabSelector';
import EmployeeCareerRoadmap from './_EmployeeCareerRoadmap';

// ================================
// Types
// ================================
interface Department {
  id: string;
  code: string;
  name: string;
  duties: string;
  isActive: boolean;
  employeeCount?: number;
}

interface Employee {
  id: string;
  employeeNo: string;
  lastName: string;
  firstName: string;
  departments: Department[];
  departmentAssignments?: { id: string; assignedAt: string; removedAt: string | null; department: Department }[];
  hireDate: string;
  terminationDate: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
}

type SortKey = 'employeeNo' | 'department' | 'duties' | 'hireDate';
type SortDir = 'asc' | 'desc';

// API helper (for mutations not yet covered by hooks)
const api = vmaFetch;

// ================================
// Sort Arrow Icon
// ================================
function SortIcon({ active, dir, colors }: { active: boolean; dir: SortDir; colors: typeof themeColors.dark }) {
  return (
    <span className="inline-flex flex-col ml-1 -mb-0.5">
      <svg
        className="w-3 h-3 -mb-1"
        viewBox="0 0 10 6"
        fill={active && dir === 'asc' ? colors.controlAccent : colors.textTertiary}
      >
        <path d="M5 0L10 6H0L5 0Z" />
      </svg>
      <svg
        className="w-3 h-3"
        viewBox="0 0 10 6"
        fill={active && dir === 'desc' ? colors.controlAccent : colors.textTertiary}
      >
        <path d="M5 6L0 0H10L5 6Z" />
      </svg>
    </span>
  );
}

// ================================
// Main Page
// ================================
export default function EmployeesPage() {
  const t = useTranslations('vma');
  const { theme } = useTheme();
  const colors = themeColors[theme];

  const queryClient = useQueryClient();

  // Filters (local state → drives query key)
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Debounce search input
  useState(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  });
  // Sync debounced search with actual search (using useMemo as side effect)
  useMemo(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // React Query: employees + departments
  const empParams = useMemo(() => {
    const p: Record<string, string> = {};
    if (debouncedSearch) p.search = debouncedSearch;
    if (filterDept) p.departmentId = filterDept;
    if (filterStatus) p.status = filterStatus;
    return p;
  }, [debouncedSearch, filterDept, filterStatus]);

  const { data: empResult, isLoading: loading, error: empError } = useEmployees(empParams);
  const { data: departments = [] } = useDepartments();
  const employees = empResult?.data ?? [];
  const total = empResult?.total ?? 0;

  // Sort
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Modal state
  const [showEmpModal, setShowEmpModal] = useState(false);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);

  // Termination date modal
  const [showTermModal, setShowTermModal] = useState(false);
  const [termTarget, setTermTarget] = useState<Employee | null>(null);
  const [termDate, setTermDate] = useState('');

  // Career timeline modal
  const [careerEmp, setCareerEmp] = useState<Employee | null>(null);

  // Show error toast on query error (moved after showToast declaration below)

  // Helper to refetch all employee data
  const refetchEmployees = () => queryClient.invalidateQueries({ queryKey: vmaKeys.employees.all });

  // ================================
  // Sorted data
  // ================================
  const sortedEmployees = useMemo(() => {
    if (!sortKey) return employees;
    const sorted = [...employees].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'employeeNo':
          cmp = a.employeeNo.localeCompare(b.employeeNo, undefined, { numeric: true });
          break;
        case 'department':
          // Sort by first department name
          const aName = a.departments[0]?.name || '';
          const bName = b.departments[0]?.name || '';
          cmp = aName.localeCompare(bName);
          break;
        case 'duties':
          // Sort by first department duties
          const aDuty = a.departments[0]?.duties || '';
          const bDuty = b.departments[0]?.duties || '';
          cmp = aDuty.localeCompare(bDuty);
          break;
        case 'hireDate':
          cmp = new Date(a.hireDate).getTime() - new Date(b.hireDate).getTime();
          break;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return sorted;
  }, [employees, sortKey, sortDir]);

  // ================================
  // Actions
  // ================================
  const showToast = (msg: string, type: 'ok' | 'err') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const queryErrorMessage = empError instanceof Error ? empError.message : null;

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const handleToggleStatus = async (emp: Employee) => {
    if (emp.status === 'ACTIVE') {
      // Show termination date picker modal
      setTermTarget(emp);
      setTermDate('');
      setShowTermModal(true);
      return;
    }
    // Reactivation: no date needed
    try {
      await api(`/vma/employees/${emp.id}/toggle`, { method: 'PATCH', body: JSON.stringify({}) });
      showToast(t('employees.actions.activateSuccess'), 'ok');
      setSelectedEmp(null);
      refetchEmployees();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Operation failed', 'err');
    }
  };

  const handleConfirmTermination = async () => {
    if (!termTarget || !termDate) return;
    try {
      await api(`/vma/employees/${termTarget.id}/toggle`, { method: 'PATCH', body: JSON.stringify({ terminationDate: termDate }) });
      showToast(t('employees.actions.deactivateSuccess'), 'ok');
      setShowTermModal(false);
      setTermTarget(null);
      setSelectedEmp(null);
      refetchEmployees();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Operation failed', 'err');
    }
  };

  const handleDeleteEmp = async (emp: Employee) => {
    try {
      await api(`/vma/employees/${emp.id}`, { method: 'DELETE' });
      showToast(t('employees.actions.deleteSuccess'), 'ok');
      setSelectedEmp(null);
      refetchEmployees();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Operation failed', 'err');
    }
  };

  // ================================
  // Column config
  // ================================
  const columns: { key: string; sortable: boolean }[] = [
    { key: 'employeeNo', sortable: true },
    { key: 'lastName', sortable: false },
    { key: 'firstName', sortable: false },
    { key: 'department', sortable: true },
    { key: 'duties', sortable: true },
    { key: 'hireDate', sortable: true },
    { key: 'status', sortable: false },
  ];

  // ================================
  // Render
  // ================================
  return (
    <div style={{ backgroundColor: colors.bg }} className="min-h-screen pb-20">
      {/* Apple 风格 Header + Tab Selector */}
      <section className="pt-12 pb-6 px-6">
        <div className="max-w-[1200px] mx-auto">
          <VmaTabSelector />
        </div>
      </section>

      {/* Action Bar */}
      <div className="max-w-[1200px] mx-auto px-6 pb-6">
        <div className="flex items-center justify-between mb-6">
          <p style={{ color: colors.textSecondary }} className="text-sm">
            {t('employees.list.total', { count: total })}
          </p>
          <button
            onClick={() => { setEditingEmp(null); setShowEmpModal(true); }}
            style={{ backgroundColor: colors.controlAccent, color: colors.white }}
            className="px-4 py-2 rounded-xl text-sm font-medium hover:opacity-90 transition"
          >
            + {t('employees.actions.add')}
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-6">
          <input
            type="text"
            placeholder={t('employees.list.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ backgroundColor: colors.bgSecondary, color: colors.text, borderColor: colors.border }}
            className="flex-1 px-4 py-2.5 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-blue-500/30"
          />
          <select
            value={filterDept}
            onChange={(e) => setFilterDept(e.target.value)}
            style={{ backgroundColor: colors.bgSecondary, color: colors.text, borderColor: colors.border }}
            className="px-4 py-2.5 rounded-xl border text-sm outline-none"
          >
            <option value="">{t('employees.fields.department')} - All</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name} - {d.duties}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={{ backgroundColor: colors.bgSecondary, color: colors.text, borderColor: colors.border }}
            className="px-4 py-2.5 rounded-xl border text-sm outline-none"
          >
            <option value="">{t('employees.fields.status')} - All</option>
            <option value="ACTIVE">{t('employees.status.active')}</option>
            <option value="INACTIVE">{t('employees.status.inactive')}</option>
          </select>
        </div>

        {/* Table */}
        <div
          style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
          className="rounded-2xl border overflow-hidden"
        >
          <table className="w-full">
            <thead>
              <tr style={{ backgroundColor: colors.bgTertiary }}>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider select-none ${
                      col.sortable ? 'cursor-pointer hover:opacity-70 transition-opacity' : ''
                    }`}
                    style={{ color: sortKey === col.key ? colors.controlAccent : colors.textSecondary }}
                    onClick={col.sortable ? () => handleSort(col.key as SortKey) : undefined}
                  >
                    <span className="inline-flex items-center">
                      {t(`employees.fields.${col.key}`)}
                      {col.sortable && (
                        <SortIcon active={sortKey === col.key} dir={sortDir} colors={colors} />
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center" style={{ color: colors.textSecondary }}>
                    <div className="animate-pulse">Loading...</div>
                  </td>
                </tr>
              ) : sortedEmployees.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center" style={{ color: colors.textSecondary }}>
                    {t('employees.list.empty')}
                  </td>
                </tr>
              ) : (
                sortedEmployees.map((emp) => (
                  <tr
                    key={emp.id}
                    className="border-t transition-colors cursor-pointer"
                    style={{ borderColor: colors.border }}
                    onClick={() => setCareerEmp(emp)}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = colors.hover; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                  >
                    <td className="px-4 py-3 text-sm font-mono font-medium" style={{ color: colors.controlAccent }}>
                      {emp.employeeNo}
                    </td>
                    <td className="px-4 py-3 text-sm" style={{ color: colors.text }}>{emp.lastName}</td>
                    <td className="px-4 py-3 text-sm" style={{ color: colors.text }}>{emp.firstName}</td>
                    <td className="px-4 py-3 text-sm max-w-[200px]" style={{ color: colors.text }}>
                      {emp.departments.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {Array.from<string>(new Set(emp.departments.map((d: Department) => d.name))).map((name) => (
                            <span
                              key={name}
                              className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium"
                              style={{
                                backgroundColor: `${colors.green}15`, // 15% opacity
                                color: colors.green,
                              }}
                            >
                              {name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span style={{ color: colors.textSecondary }}>-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm max-w-[250px]" style={{ color: colors.text }}>
                      {emp.departments.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {emp.departments.map((d: Department) => (
                            <span
                              key={d.id}
                              className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium"
                              style={{
                                backgroundColor: `${colors.blue}15`, // 15% opacity
                                color: colors.blue,
                              }}
                            >
                              {d.duties}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span style={{ color: colors.textSecondary }}>-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm" style={{ color: colors.textSecondary }}>
                      {new Date(emp.hireDate).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                        style={{
                          backgroundColor: emp.status === 'ACTIVE' ? `${colors.green}20` : `${colors.gray}20`,
                          color: emp.status === 'ACTIVE' ? colors.green : colors.gray,
                        }}
                      >
                        {t(`employees.status.${emp.status.toLowerCase()}`)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 名片式详情 Modal */}
      {selectedEmp && (
        <EmployeeCardModal
          employee={selectedEmp}
          colors={colors}
          theme={theme}
          t={t}
          onClose={() => setSelectedEmp(null)}
          onEdit={() => {
            setEditingEmp(selectedEmp);
            setSelectedEmp(null);
            setShowEmpModal(true);
          }}
          onToggle={() => handleToggleStatus(selectedEmp)}
          onDelete={() => handleDeleteEmp(selectedEmp)}
          onViewCareer={() => {
            setCareerEmp(selectedEmp);
            setSelectedEmp(null);
          }}
        />
      )}

      {/* Employee Form Modal */}
      {showEmpModal && (
        <EmployeeFormModal
          employee={editingEmp}
          departments={departments}
          colors={colors}
          theme={theme}
          t={t}
          onClose={() => setShowEmpModal(false)}
          onSave={() => {
            setShowEmpModal(false);
            showToast(t('employees.actions.saveSuccess'), 'ok');
            refetchEmployees();
          }}
          onError={(msg) => showToast(msg, 'err')}
        />
      )}

      {/* Termination Date Modal */}
      {showTermModal && termTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: `${colors.bg}B3`, backdropFilter: 'blur(4px)' }}>
          <div
            className="w-full max-w-sm rounded-2xl shadow-2xl p-6"
            style={{ backgroundColor: colors.bgElevated }}
          >
            <h3 className="text-lg font-bold mb-1" style={{ color: colors.text }}>
              {t('employees.actions.deactivate')}
            </h3>
            <p className="text-sm mb-4" style={{ color: colors.textSecondary }}>
              {t('employees.fields.terminationDateDesc') || `Set the termination date for ${termTarget.lastName} ${termTarget.firstName}`}
            </p>
            <div className="mb-5">
              <label className="block text-sm font-medium mb-1" style={{ color: colors.textSecondary }}>
                {t('employees.fields.terminationDate')} *
              </label>
              <input
                type="date"
                required
                value={termDate}
                onChange={(e) => setTermDate(e.target.value)}
                style={{
                  backgroundColor: colors.bg,
                  color: colors.text,
                  borderColor: colors.border,
                  colorScheme: theme === 'dark' ? 'dark' : 'light',
                  cursor: 'pointer',
                }}
                className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-red-500/30"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setShowTermModal(false); setTermTarget(null); }}
                style={{ color: colors.textSecondary }}
                className="px-4 py-2 rounded-xl text-sm hover:opacity-70 transition"
              >
                {t('employees.actions.cancel') || 'Cancel'}
              </button>
              <button
                disabled={!termDate}
                onClick={handleConfirmTermination}
                className="px-5 py-2 rounded-xl text-sm font-medium transition disabled:opacity-50"
                style={{ backgroundColor: colors.red, color: colors.white }}
              >
                {t('employees.actions.deactivate')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Employee Career Timeline Modal */}
      {careerEmp && (
        <EmployeeCareerRoadmap
          employee={careerEmp}
          departments={departments}
          colors={colors}
          theme={theme}
          t={t}
          onClose={() => setCareerEmp(null)}
          onUpdate={() => { refetchEmployees(); }}
          onError={(msg) => showToast(msg, 'err')}
          onSuccess={(msg) => showToast(msg, 'ok')}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 px-5 py-3 rounded-xl text-sm font-medium shadow-lg z-50 transition-all ${
            toast.type === 'ok' ? '' : ''
          }`}
          style={{ backgroundColor: toast.type === 'ok' ? colors.green : colors.red, color: colors.white }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ================================
// Employee Card Modal (名片式弹窗)
// ================================
function EmployeeCardModal({
  employee,
  colors,
  theme,
  t,
  onClose,
  onEdit,
  onToggle,
  onDelete,
  onViewCareer,
}: {
  employee: Employee;
  colors: typeof themeColors.dark;
  theme: 'dark' | 'light';
  t: ReturnType<typeof useTranslations>;
  onClose: () => void;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onViewCareer: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isActive = employee.status === 'ACTIVE';

  // 首字母头像颜色
  const avatarColors = [colors.blue, colors.indigo, colors.pink, colors.orange, colors.green, colors.cyan];
  const colorIdx = employee.employeeNo.split('').reduce((s, c) => s + c.charCodeAt(0), 0) % avatarColors.length;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: colors.bgSecondary,
          borderColor: colors.border,
          boxShadow: theme === 'dark'
            ? `0 25px 60px ${colors.bg}80`
            : `0 25px 60px ${colors.bg}26`,
        }}
        className="w-full max-w-sm rounded-3xl border overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Card header with gradient accent */}
        <div
          className="h-20 relative"
          style={{
            background: `linear-gradient(135deg, ${avatarColors[colorIdx]}80, ${avatarColors[(colorIdx + 1) % avatarColors.length]}60)`,
          }}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center transition"
            style={{ color: `${colors.white}CC` }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Avatar overlapping */}
        <div className="relative px-6 -mt-10">
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center text-2xl font-bold shadow-lg"
            style={{
              backgroundColor: avatarColors[colorIdx],
              border: `3px solid ${colors.bgSecondary}`,
              color: colors.white,
            }}
          >
            {employee.lastName.charAt(0)}{employee.firstName.charAt(0)}
          </div>
        </div>

        {/* Info */}
        <div className="px-6 pt-3 pb-5">
          {/* Name + badge */}
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-lg font-bold" style={{ color: colors.text }}>
              {employee.lastName} {employee.firstName}
            </h3>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
              }`}
            >
              {t(`employees.status.${employee.status.toLowerCase()}`)}
            </span>
          </div>

          {/* Employee No */}
          <p className="text-sm font-mono mb-4" style={{ color: colors.textSecondary }}>
            # {employee.employeeNo}
          </p>

          {/* Detail rows */}
          <div className="space-y-3 mb-5">
            {/* Duties */}
            <div className="flex items-start gap-3">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke={colors.textTertiary} viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
              <div className="flex flex-wrap gap-1">
                {employee.departments.length > 0 ? employee.departments.map((d) => (
                  <span
                    key={d.id}
                    className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium"
                    style={{
                      backgroundColor: `${colors.blue}26`,
                      color: colors.blue,
                    }}
                  >
                    {d.name} - {d.duties}
                  </span>
                )) : (
                  <span className="text-xs" style={{ color: colors.textTertiary }}>-</span>
                )}
              </div>
            </div>

            {/* Hire Date */}
            <div className="flex items-center gap-3">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke={colors.textTertiary} viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
              <span className="text-sm" style={{ color: colors.text }}>
                {t('employees.fields.hireDate')}:&nbsp;
                <span className="font-medium">
                  {new Date(employee.hireDate).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })}
                </span>
              </span>
            </div>

            {/* Termination Date */}
            {employee.terminationDate && (
              <div className="flex items-center gap-3">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke={colors.red} viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                </svg>
                <span className="text-sm" style={{ color: colors.red }}>
                  {t('employees.fields.terminationDate')}:&nbsp;
                  <span className="font-medium">
                    {new Date(employee.terminationDate).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })}
                  </span>
                </span>
              </div>
            )}
          </div>

          {/* Actions Divider */}
          <div className="h-px mb-3" style={{ backgroundColor: colors.border }} />

          {/* Career Button - Full Width */}
          <button
            onClick={onViewCareer}
            className="w-full h-9 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 transition hover:opacity-80 mb-3"
            style={{
              backgroundColor: `${colors.indigo}26`,
              color: colors.indigo,
            }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {t('employees.career.viewCareer') || 'View Career Timeline'}
          </button>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {/* Edit */}
            <button
              onClick={onEdit}
              className="flex-1 h-10 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 transition hover:opacity-80"
              style={{
                backgroundColor: `${colors.blue}26`,
                color: colors.blue,
              }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
              </svg>
              {t('employees.actions.edit')}
            </button>

            {/* Toggle Status */}
            <button
              onClick={onToggle}
              className="flex-1 h-10 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 transition hover:opacity-80"
              style={{
                backgroundColor: isActive
                  ? `${colors.orange}26`
                  : `${colors.green}26`,
                color: isActive ? colors.orange : colors.green,
              }}
            >
              {isActive ? (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
                  </svg>
                  {t('employees.actions.deactivate')}
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                  </svg>
                  {t('employees.actions.activate')}
                </>
              )}
            </button>

            {/* Delete */}
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="w-10 h-10 rounded-xl flex items-center justify-center transition hover:opacity-80"
                style={{
                  backgroundColor: `${colors.red}26`,
                  color: colors.red,
                }}
                title={t('employees.actions.delete')}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
              </button>
            ) : (
              <button
                onClick={onDelete}
                className="h-10 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition animate-pulse"
                style={{
                  backgroundColor: colors.red,
                  color: colors.white,
                }}
              >
                {t('employees.actions.confirmDelete')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ================================
// Employee Form Modal (多选职责)
// ================================
function EmployeeFormModal({
  employee,
  departments,
  colors,
  theme,
  t,
  onClose,
  onSave,
  onError,
}: {
  employee: Employee | null;
  departments: Department[];
  colors: typeof themeColors.dark;
  theme: 'dark' | 'light';
  t: ReturnType<typeof useTranslations>;
  onClose: () => void;
  onSave: () => void;
  onError: (msg: string) => void;
}) {
  const isEdit = !!employee;
  const [employeeNo, setEmployeeNo] = useState(employee?.employeeNo || '');
  const [lastName, setLastName] = useState(employee?.lastName || '');
  const [firstName, setFirstName] = useState(employee?.firstName || '');
  const [selectedDeptIds, setSelectedDeptIds] = useState<string[]>(
    employee?.departments?.map((d) => d.id) || []
  );
  const [hireDate, setHireDate] = useState(
    employee?.hireDate ? new Date(employee.hireDate).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }) : ''
  );
  const [saving, setSaving] = useState(false);

  const toggleDept = (id: string) => {
    setSelectedDeptIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedDeptIds.length === 0) {
      onError('Please select at least one duty');
      return;
    }
    setSaving(true);
    try {
      const body = {
        employeeNo,
        lastName,
        firstName,
        departmentIds: selectedDeptIds,
        hireDate,
      };
      if (isEdit) {
        await api(`/vma/employees/${employee!.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await api('/vma/employees', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      onSave();
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : 'Operation failed');
    } finally {
      setSaving(false);
    }
  };

  const activeDepts = departments.filter((d) => d.isActive);

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
        className="w-full max-w-lg rounded-2xl border shadow-2xl p-6 max-h-[90vh] overflow-y-auto"
      >
        <h2 style={{ color: colors.text }} className="text-xl font-bold mb-6">
          {isEdit ? t('employees.form.title_edit') : t('employees.form.title_create')}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Employee No */}
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: colors.textSecondary }}>
              {t('employees.fields.employeeNo')} *
            </label>
            <input
              type="text"
              required
              value={employeeNo}
              onChange={(e) => setEmployeeNo(e.target.value)}
              placeholder={t('employees.form.employeeNo_placeholder')}
              style={{ backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }}
              className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-blue-500/30"
            />
          </div>
          {/* Last Name + First Name */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: colors.textSecondary }}>
                {t('employees.fields.lastName')} *
              </label>
              <input
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder={t('employees.form.lastName_placeholder')}
                style={{ backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }}
                className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: colors.textSecondary }}>
                {t('employees.fields.firstName')} *
              </label>
              <input
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder={t('employees.form.firstName_placeholder')}
                style={{ backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }}
                className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </div>
          </div>

          {/* Duties (multi-select checkboxes) */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: colors.textSecondary }}>
              {t('employees.fields.duties')} * ({selectedDeptIds.length} selected)
            </label>
            <div
              className="rounded-xl border p-3 max-h-[200px] overflow-y-auto space-y-1"
              style={{ backgroundColor: colors.bg, borderColor: colors.border }}
            >
              {activeDepts.length === 0 ? (
                <p className="text-sm py-2 text-center" style={{ color: colors.textSecondary }}>
                  No departments available
                </p>
              ) : (
                activeDepts.map((d) => (
                  <label
                    key={d.id}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors hover:opacity-80"
                    style={{
                      backgroundColor: selectedDeptIds.includes(d.id)
                        ? `${colors.blue}26`
                        : 'transparent',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedDeptIds.includes(d.id)}
                      onChange={() => toggleDept(d.id)}
                      className="w-4 h-4 rounded accent-blue-500"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium" style={{ color: colors.text }}>
                        {d.name}
                      </span>
                      <span className="text-xs ml-2" style={{ color: colors.textSecondary }}>
                        {d.duties}
                      </span>
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>

          {/* Hire Date */}
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: colors.textSecondary }}>
              {t('employees.fields.hireDate')} *
            </label>
            <input
              type="date"
              required
              value={hireDate}
              onChange={(e) => setHireDate(e.target.value)}
              style={{
                backgroundColor: colors.bg,
                color: colors.text,
                borderColor: colors.border,
                colorScheme: theme === 'dark' ? 'dark' : 'light',
                cursor: 'pointer',
              }}
              className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-blue-500/30"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              style={{ color: colors.textSecondary }}
              className="px-4 py-2 rounded-xl text-sm hover:opacity-70 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || selectedDeptIds.length === 0}
              style={{ backgroundColor: colors.controlAccent, color: colors.white }}
              className="px-5 py-2 rounded-xl text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
            >
              {saving ? '...' : isEdit ? (t('employees.career.save') || 'Save') : (t('employees.career.create') || 'Create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
