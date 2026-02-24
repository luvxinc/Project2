'use client';
import { VMA_API as API, getAuthHeaders } from '@/lib/vma-api';

import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useModal } from '@/components/modal/GlobalModal';
import VmaTabSelector from '../components/VmaTabSelector';
import SopRoadmapModal from './_SopRoadmapModal';
import EmployeeListModal from './_EmployeeListModal';

const SCROLL_AMOUNT = 340;

// ================================
// Types
// ================================
interface Department {
  id: string;
  code: string;
  name: string;
  duties: string;
  sopTrainingReq: string | null;
  isActive: boolean;
  employeeCount?: number;
}

interface SopItem {
  seqNo: number;
  sopNo: string;
  name: string;
  status: string;
  documentType: string;
  structureClassification: string;
}

interface DeptGroup {
  code: string;
  name: string;
  color: string;
  departments: Department[];
}

// Prefill for the form when adding a duty to an existing group
interface FormPrefill {
  code: string;
  name: string;
}

// ================================
// API helpers
// ================================
async function api<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { ...getAuthHeaders(), ...(opts?.headers || {}) },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `API error ${res.status}`);
  }
  return res.json();
}

// 分组颜色
const GROUP_COLORS_FALLBACK = [
  '#007AFF', '#5856D6', '#34C759', '#FF9F0A',
  '#FF2D55', '#5AC8FA', '#FFCC00', '#AF52DE',
];

function getGroupColor(code: string): string {
  const hash = code.split('').reduce((s, c) => s + c.charCodeAt(0), 0);
  return GROUP_COLORS_FALLBACK[hash % GROUP_COLORS_FALLBACK.length];
}

// ================================
// Department Group Carousel
// ================================
function DeptGroupCarousel({
  group,
  colors,
  theme,
  t,
  onEdit,
  onDelete,
  onAddDuty,
  onSopReq,
  onViewEmployees,
}: {
  group: DeptGroup;
  colors: any;
  theme: string;
  t: any;
  onEdit: (dept: Department) => void;
  onDelete: (dept: Department) => void;
  onAddDuty: (prefill: FormPrefill) => void;
  onSopReq: (dept: Department) => void;
  onViewEmployees: (dept: Department) => void;
}) {
  const carouselRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollButtons = useCallback(() => {
    if (carouselRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = carouselRef.current;
      setCanScrollLeft(scrollLeft > 10);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
    }
  }, []);

  const scrollCarousel = (direction: 'left' | 'right') => {
    if (carouselRef.current) {
      const amount = direction === 'left' ? -SCROLL_AMOUNT : SCROLL_AMOUNT;
      carouselRef.current.scrollBy({ left: amount, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    const carousel = carouselRef.current;
    if (carousel) {
      requestAnimationFrame(updateScrollButtons);
      const handleWheel = (e: WheelEvent) => {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && e.deltaY !== 0) {
          carousel.scrollBy({ left: e.deltaY, behavior: 'auto' });
        }
      };
      carousel.addEventListener('wheel', handleWheel, { passive: true });
      return () => carousel.removeEventListener('wheel', handleWheel);
    }
  }, [updateScrollButtons, group.departments]);

  return (
    <div className="mb-10">
      {/* 分组标题 */}
      <div className="max-w-[1200px] mx-auto px-6 flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[12px] font-bold tracking-wider"
            style={{ backgroundColor: group.color }}
          >
            {group.code.slice(0, 3)}
          </div>
          <div>
            <h2 style={{ color: colors.text }} className="text-[18px] font-semibold leading-tight">
              {group.name}
            </h2>
            <p style={{ color: colors.textTertiary }} className="text-[12px]">
              {group.code} · {group.departments.length} {group.departments.length === 1 ? 'duty' : 'duties'}
            </p>
          </div>
        </div>

        {/* Navigation Arrows */}
        <div className="flex gap-1">
          <button
            onClick={() => scrollCarousel('left')}
            disabled={!canScrollLeft}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200"
            style={{ backgroundColor: colors.bgTertiary, opacity: canScrollLeft ? 1 : 0.4 }}
          >
            <svg className="w-4 h-4" fill="none" stroke={colors.text} viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <button
            onClick={() => scrollCarousel('right')}
            disabled={!canScrollRight}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200"
            style={{ backgroundColor: colors.bgTertiary, opacity: canScrollRight ? 1 : 0.4 }}
          >
            <svg className="w-4 h-4" fill="none" stroke={colors.text} viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>
      </div>

      {/* 卡片轮播区 */}
      <div
        ref={carouselRef}
        onScroll={updateScrollButtons}
        className="flex gap-4 overflow-x-auto px-6 pt-2 pb-14 cursor-grab active:cursor-grabbing"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
      >
        {/* Left spacer */}
        <div className="flex-shrink-0 w-[max(0px,calc((100vw-1200px)/2-24px))]" />

        {group.departments.map((dept, idx) => (
          <DutyCard
            key={dept.id}
            dept={dept}
            groupColor={group.color}
            colors={colors}
            theme={theme}
            t={t}
            idx={idx}
            onEdit={() => onEdit(dept)}
            onDelete={() => onDelete(dept)}
            onSopReq={() => onSopReq(dept)}
            onViewEmployees={() => onViewEmployees(dept)}
          />
        ))}

        {/* ＋ 新增职责卡片 */}
        <AddDutyCard
          groupColor={group.color}
          colors={colors}
          theme={theme}
          t={t}
          idx={group.departments.length}
          onAdd={() => onAddDuty({ code: group.code, name: group.name })}
        />

        {/* Right spacer */}
        <div className="flex-shrink-0 w-[max(24px,calc((100vw-1200px)/2))]" />
      </div>

      <style>{`div::-webkit-scrollbar { display: none; }`}</style>
    </div>
  );
}

// ================================
// Duty Card (existing)
// ================================
function DutyCard({
  dept,
  groupColor,
  colors,
  theme,
  t,
  idx,
  onEdit,
  onDelete,
  onSopReq,
  onViewEmployees,
}: {
  dept: Department;
  groupColor: string;
  colors: any;
  theme: string;
  t: any;
  idx: number;
  onEdit: () => void;
  onDelete: () => void;
  onSopReq: () => void;
  onViewEmployees: () => void;
}) {
  const empCount = dept.employeeCount || 0;
  const canDelete = empCount === 0;

  return (
    <div
      className="flex-shrink-0 animate-fadeInUp"
      style={{ width: '300px', animationDelay: `${idx * 60}ms` }}
    >
      <div
        className="rounded-[20px] p-5 flex flex-col h-full transition-transform hover:scale-[1.02]"
        style={{
          backgroundColor: colors.bgSecondary,
          border: `1px solid ${colors.border}`,
          boxShadow: theme === 'dark'
            ? '0 6px 24px rgba(0,0,0,0.3)'
            : '0 4px 16px rgba(0,0,0,0.06)',
        }}
      >
        {/* Card Header */}
        <div className="flex items-start gap-3 mb-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${groupColor}15` }}
          >
            <svg className="w-5 h-5" fill="none" stroke={groupColor} viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[15px] font-semibold leading-snug mb-0.5" style={{ color: colors.text }}>
              {dept.duties}
            </h3>
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium"
              style={{
                backgroundColor: dept.isActive ? `${colors.green}15` : `${colors.gray}15`,
                color: dept.isActive ? colors.green : colors.textTertiary,
              }}
            >
              <span 
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: dept.isActive ? colors.green : colors.gray }} 
              />
              {dept.isActive ? t('departments.list.active') || 'Active' : t('departments.list.inactive') || 'Inactive'}
            </span>
          </div>
        </div>

        {/* Info rows */}
        <div className="space-y-2.5 mb-4 flex-1">
          {dept.sopTrainingReq && (
            <div className="flex items-start gap-2">
              <svg className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" fill="none" stroke={colors.textTertiary} viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342" />
              </svg>
              <span className="text-[12px] leading-relaxed line-clamp-3" style={{ color: colors.textSecondary }}>
                {dept.sopTrainingReq}
              </span>
            </div>
          )}
          <div 
             className="flex items-center gap-2 cursor-pointer hover:opacity-70 transition-opacity group/emp"
             onClick={(e) => { e.stopPropagation(); onViewEmployees(); }}
          >
            <svg className="w-3.5 h-3.5 flex-shrink-0 group-hover/emp:text-blue-500 transition-colors" fill="none" stroke={colors.textTertiary} viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
            <span className="text-[12px] group-hover/emp:text-blue-500 transition-colors underline decoration-dotted decoration-gray-400 group-hover/emp:decoration-blue-500" style={{ color: colors.textSecondary }}>
              {empCount} {t('departments.list.employees')}
            </span>
          </div>
        </div>

        {/* Action Buttons — Edit + Delete only */}
        <div className="flex items-center gap-2 pt-3 border-t" style={{ borderColor: colors.border }}>
          <button
            onClick={onEdit}
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-all hover:opacity-80"
            style={{ backgroundColor: colors.bgTertiary }}
            title={t('departments.actions.edit')}
          >
            <svg className="w-4 h-4" fill="none" stroke={colors.textSecondary} viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.38.138.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <button
            onClick={onDelete}
            disabled={!canDelete}
            className="h-8 px-3 flex items-center justify-center rounded-lg text-[12px] font-medium transition-all hover:opacity-90 text-white disabled:opacity-30"
            style={{ backgroundColor: colors.red }}
            title={canDelete ? t('departments.actions.delete') : t('departments.actions.cannotDelete')}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </button>
        </div>
      </div>

      {/* SOP Requirements — Apple Blue Pill CTA (matching HUB page) */}
      <div className="mt-3 text-center">
        <button
          onClick={onSopReq}
          className="inline-flex items-center justify-center gap-1.5 px-5 py-2 rounded-full text-[13px] font-medium transition-all hover:opacity-90"
          style={{ backgroundColor: colors.controlAccent, color: colors.white }}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342" />
          </svg>
          {t('departments.actions.sopRequirements')}
        </button>
      </div>
    </div>
  );
}

// ================================
// Add Duty Card (＋ 卡片 - 每个分组末尾)
// ================================
function AddDutyCard({
  groupColor,
  colors,
  theme,
  t,
  idx,
  onAdd,
}: {
  groupColor: string;
  colors: any;
  theme: string;
  t: any;
  idx: number;
  onAdd: () => void;
}) {
  return (
    <div
      className="flex-shrink-0 animate-fadeInUp"
      style={{ width: '200px', animationDelay: `${idx * 60}ms` }}
    >
      <button
        onClick={onAdd}
        className="w-full h-full min-h-[180px] rounded-[20px] flex flex-col items-center justify-center gap-3 transition-all hover:scale-[1.03] cursor-pointer group"
        style={{
          border: `2px dashed ${theme === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'}`,
          backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)',
        }}
      >
        {/* + 圆形图标 */}
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center transition-all group-hover:scale-110"
          style={{
            backgroundColor: `${groupColor}15`,
            border: `2px solid ${groupColor}40`,
          }}
        >
          <svg className="w-6 h-6" fill="none" stroke={groupColor} viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </div>
        <span
          className="text-[13px] font-medium transition-colors"
          style={{ color: colors.textSecondary }}
        >
          {t('departments.actions.addDuty')}
        </span>
      </button>
    </div>
  );
}

// ================================
// Main Page
// ================================
export default function DutiesPage() {
  const t = useTranslations('vma');
  const { theme } = useTheme();
  const colors = themeColors[theme];
  const { showConfirm } = useModal();

  // State
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [formPrefill, setFormPrefill] = useState<FormPrefill | null>(null);

  // SOP Requirements modal state
  const [showSopModal, setShowSopModal] = useState(false);
  const [sopReqDept, setSopReqDept] = useState<Department | null>(null);

  // Employee List modal state
  const [showEmpModal, setShowEmpModal] = useState(false);
  const [empDept, setEmpDept] = useState<Department | null>(null);

  // ================================
  // Data fetching
  // ================================
  const fetchDepartments = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api<Department[]>('/vma/departments');
      setDepartments(data);
    } catch (e: any) {
      showToast(e.message, 'err');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDepartments();
  }, [fetchDepartments]);

  // ================================
  // Group by department code
  // ================================
  const groups = useMemo<DeptGroup[]>(() => {
    const map = new Map<string, Department[]>();
    for (const dept of departments) {
      const existing = map.get(dept.code) || [];
      existing.push(dept);
      map.set(dept.code, existing);
    }
    return Array.from(map.entries()).map(([code, depts]) => ({
      code,
      name: depts[0].name,
      color: getGroupColor(code),
      departments: depts,
    }));
  }, [departments]);

  // ================================
  // Actions
  // ================================
  const showToast = (msg: string, type: 'ok' | 'err') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleDelete = (dept: Department) => {
    showConfirm({
      title: t('departments.actions.confirmDelete'),
      message: `${dept.code} — ${dept.name} (${dept.duties})`,
      confirmText: t('departments.actions.delete') || 'Delete',
      confirmClass: 'danger',
      onConfirm: async () => {
        try {
          await api(`/vma/departments/${dept.id}`, { method: 'DELETE' });
          showToast(t('departments.actions.deleteSuccess'), 'ok');
          fetchDepartments();
        } catch (e: any) {
          showToast(e.message, 'err');
        }
      },
    });
  };

  // 全局新增部门 (空白表单)
  const openAddDepartment = () => {
    setEditingDept(null);
    setFormPrefill(null);
    setShowModal(true);
  };

  // 在已有部门组中新增职责 (预填 code + name)
  const openAddDuty = (prefill: FormPrefill) => {
    setEditingDept(null);
    setFormPrefill(prefill);
    setShowModal(true);
  };

  const openEdit = (dept: Department) => {
    setEditingDept(dept);
    setFormPrefill(null);
    setShowModal(true);
  };

  const openSopReq = (dept: Department) => {
    setSopReqDept(dept);
    setShowSopModal(true);
  };

  const openEmployees = (dept: Department) => {
    setEmpDept(dept);
    setShowEmpModal(true);
  };

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

      {/* Section Header */}
      <div className="max-w-[1200px] mx-auto px-6 mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h2
              style={{ color: colors.text }}
              className="text-xl font-semibold mb-1"
            >
              {t('departments.title')}
            </h2>
            <p style={{ color: colors.textSecondary }} className="text-sm">
              {t('departments.description')} · {departments.length} total
            </p>
          </div>
          <button
            onClick={openAddDepartment}
            style={{ backgroundColor: colors.controlAccent }}
            className="px-5 py-2.5 rounded-xl text-white text-sm font-medium hover:opacity-90 transition"
          >
            + {t('departments.actions.addDepartment')}
          </button>
        </div>
      </div>

      {/* Groups */}
      {loading ? (
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="animate-pulse text-center py-20" style={{ color: colors.textSecondary }}>
            Loading...
          </div>
        </div>
      ) : groups.length === 0 ? (
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="text-center py-20" style={{ color: colors.textSecondary }}>
            {t('departments.list.empty')}
          </div>
        </div>
      ) : (
        groups.map((group) => (
          <DeptGroupCarousel
            key={group.code}
            group={group}
            colors={colors}
            theme={theme}
            t={t}
            onEdit={openEdit}
            onDelete={handleDelete}
            onAddDuty={openAddDuty}
            onSopReq={openSopReq}
            onViewEmployees={openEmployees}
          />
        ))
      )}

      {/* Department/Duty Form Modal */}
      {showModal && (
        <DeptFormModal
          department={editingDept}
          prefill={formPrefill}
          colors={colors}
          theme={theme}
          t={t}
          onClose={() => setShowModal(false)}
          onSave={() => {
            setShowModal(false);
            showToast(t('departments.actions.saveSuccess'), 'ok');
            fetchDepartments();
          }}
          onError={(msg) => showToast(msg, 'err')}
        />
      )}

      {/* SOP Requirements Modal */}
      {showSopModal && sopReqDept && (
        <SopRoadmapModal
          department={sopReqDept}
          colors={colors}
          theme={theme}
          t={t}
          onClose={() => setShowSopModal(false)}
          onSave={() => {
            setShowSopModal(false);
            showToast(t('departments.actions.sopReqSaveSuccess'), 'ok');
          }}
          onError={(msg) => showToast(msg, 'err')}
        />
      )}

      {/* Employee List Modal */}
      {showEmpModal && empDept && (
        <EmployeeListModal
          department={empDept}
          colors={colors}
          theme={theme}
          t={t}
          onClose={() => setShowEmpModal(false)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 px-5 py-3 rounded-xl text-white text-sm font-medium shadow-lg z-50 transition-all ${
            toast.type === 'ok' ? '' : ''
          }`}
          style={{ backgroundColor: toast.type === 'ok' ? colors.green : colors.red }}
        >
          {toast.msg}
        </div>
      )}

      {/* Keyframe animation */}
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeInUp {
          animation: fadeInUp 0.4s ease-out both;
        }
      `}</style>
    </div>
  );
}

// ================================
// Department Form Modal
// ================================
function DeptFormModal({
  department,
  prefill,
  colors,
  theme,
  t,
  onClose,
  onSave,
  onError,
}: {
  department: Department | null;
  prefill: FormPrefill | null;
  colors: any;
  theme: string;
  t: any;
  onClose: () => void;
  onSave: () => void;
  onError: (msg: string) => void;
}) {
  // 如果有 prefill 从分组内添加，code/name 预填且锁定
  const isPrefilled = !!prefill && !department;
  const isEdit = !!department;

  const [code, setCode] = useState(department?.code || prefill?.code || '');
  const [name, setName] = useState(department?.name || prefill?.name || '');
  const [duties, setDuties] = useState(department?.duties || '');
  const [saving, setSaving] = useState(false);

  // 弹窗标题
  const title = isEdit
    ? t('departments.form.title_edit')
    : isPrefilled
      ? t('departments.form.title_addDuty')
      : t('departments.form.title_create');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body: any = { code, name, duties: duties.trim() };

      if (department) {
        await api(`/vma/departments/${department.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await api('/vma/departments', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      onSave();
    } catch (e: any) {
      onError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
        className="w-full max-w-md rounded-2xl border shadow-2xl p-6"
      >
        <h2 style={{ color: colors.text }} className="text-lg font-bold mb-5">
          {title}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 部门码 */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>
              {t('departments.fields.code')} *
            </label>
            <input
              type="text"
              required
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder={t('departments.form.code_placeholder')}
              readOnly={isPrefilled}
              style={{
                backgroundColor: isPrefilled ? colors.bgTertiary : colors.bg,
                color: colors.text,
                borderColor: colors.border,
                opacity: isPrefilled ? 0.7 : 1,
              }}
              className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-blue-500/30 font-mono"
            />
          </div>

          {/* 部门名字 */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>
              {t('departments.fields.name')} *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('departments.form.name_placeholder')}
              readOnly={isPrefilled}
              style={{
                backgroundColor: isPrefilled ? colors.bgTertiary : colors.bg,
                color: colors.text,
                borderColor: colors.border,
                opacity: isPrefilled ? 0.7 : 1,
              }}
              className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-blue-500/30"
            />
          </div>

          {/* 职责 — 这是重点输入字段 */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: isPrefilled ? colors.controlAccent : colors.textSecondary }}>
              {t('departments.fields.duties')} *
              {isPrefilled && (
                <span className="ml-2 text-[10px] font-normal" style={{ color: colors.textTertiary }}>
                  ← {t('departments.form.focusHint')}
                </span>
              )}
            </label>
            <textarea
              required
              autoFocus={isPrefilled}
              value={duties}
              onChange={(e) => setDuties(e.target.value)}
              placeholder={t('departments.form.duties_placeholder')}
              rows={2}
              style={{ backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }}
              className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-blue-500/30 resize-none"
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
              disabled={saving || !code.trim() || !name.trim() || !duties.trim()}
              style={{ backgroundColor: colors.controlAccent }}
              className="px-5 py-2 rounded-xl text-white text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
            >
              {saving ? '...' : (t('sopRequirementsModal.save') || 'Save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Old SopRequirementsModal + SopHistoryModal moved to ./_SopRoadmapModal.tsx

