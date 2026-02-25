'use client';
import { VMA_API as API, getAuthHeaders } from '@/lib/vma-api';

import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import VmaTabSelector from '../components/VmaTabSelector';

// ================================
// Types
// ================================
interface SopVersionInfo {
  id: string;
  version: string;
  daNo: string;
  effectiveDate: string;
  trainingRequired: boolean;
}

interface TrainingSop {
  id: string;
  seqNo: number;
  sopNo: string;
  name: string;
  description: string | null;
  version: string; // latest version (flattened from API)
  daNo: string; // latest daNo
  effectiveDate: string; // latest effectiveDate
  structureClassification: string;
  documentType: string;
  trainingRequired: boolean; // latest trainingRequired
  status: 'ACTIVE' | 'DEPRECATED';
  versions: SopVersionInfo[]; // version history (newest first)
  createdAt: string;
}

interface SopGroup {
  sopNo: string;
  latest: TrainingSop;
  versions: SopVersionInfo[];
}

type ModalMode = 'create' | 'edit' | 'revision';

// ================================
// API
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

// ================================
// Doc type config (NO EMOJI — SVG only)
// ================================
// NOTE: These are initialized with placeholder values, dynamically overridden at render time
// via getDocTypeConfig() using themeColors tokens
const DOC_TYPE_CONFIG_KEYS = ['Procedure Document', 'Management Regulation', 'Technical Document', 'Quality Manual'] as const;
function getDocTypeConfig(colors: any): Record<string, { accent: string; bg: string }> {
  return {
    'Procedure Document':    { accent: colors.blue,   bg: `${colors.blue}12` },
    'Management Regulation': { accent: colors.indigo,  bg: `${colors.indigo}12` },
    'Technical Document':    { accent: colors.orange,  bg: `${colors.orange}12` },
    'Quality Manual':        { accent: colors.green,   bg: `${colors.green}12` },
  };
}
const DOC_TYPE_ORDER = ['Quality Manual', 'Procedure Document', 'Management Regulation', 'Technical Document'];

// Strip #N suffix used for DB uniqueness — never shown in UI
const displaySopNo = (sopNo: string) => sopNo.replace(/#\d+$/, '');

// SVG Icons
const IconDoc = ({ color = 'currentColor', size = 16 }: { color?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
  </svg>
);
const IconRegulation = ({ color = 'currentColor', size = 16 }: { color?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
  </svg>
);
const IconTech = ({ color = 'currentColor', size = 16 }: { color?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
  </svg>
);
const IconManual = ({ color = 'currentColor', size = 16 }: { color?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" /><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" />
  </svg>
);
const IconSearch = ({ color = 'currentColor' }: { color?: string }) => (
  <svg className="w-4 h-4" fill="none" stroke={color} viewBox="0 0 24 24" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
  </svg>
);
const IconClock = ({ color = 'currentColor' }: { color?: string }) => (
  <svg className="w-3.5 h-3.5" fill="none" stroke={color} viewBox="0 0 24 24" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);
const IconEdit = ({ color = 'currentColor' }: { color?: string }) => (
  <svg className="w-3.5 h-3.5" fill="none" stroke={color} viewBox="0 0 24 24" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
  </svg>
);
const IconPlus = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
  </svg>
);
const IconGrad = ({ color = 'currentColor' }: { color?: string }) => (
  <svg className="w-3.5 h-3.5" fill="none" stroke={color} viewBox="0 0 24 24" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 00-.491 6.347A48.62 48.62 0 0112 20.904a48.62 48.62 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.636 50.636 0 00-2.658-.813A59.906 59.906 0 0112 3.493a59.903 59.903 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
  </svg>
);
const IconRevision = ({ color = 'currentColor' }: { color?: string }) => (
  <svg className="w-3.5 h-3.5" fill="none" stroke={color} viewBox="0 0 24 24" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3l-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3l-3 3" />
  </svg>
);

const DOC_TYPE_ICONS: Record<string, React.FC<{ color?: string; size?: number }>> = {
  'Procedure Document':    IconDoc,
  'Management Regulation': IconRegulation,
  'Technical Document':    IconTech,
  'Quality Manual':        IconManual,
};

// ================================
// Main Page
// ================================
export default function TrainingSopPage() {
  const t = useTranslations('vma');
  const { theme } = useTheme();
  const colors = themeColors[theme];

  const [sops, setSops] = useState<TrainingSop[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal
  const [modalMode, setModalMode] = useState<ModalMode>('create');
  const [editingSop, setEditingSop] = useState<TrainingSop | null>(null);
  const [showModal, setShowModal] = useState(false);

  // Version history dropdown
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);

  // ================================
  const fetchSops = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api<TrainingSop[]>('/vma/training-sops');
      setSops(data);
    } catch (e: any) {
      showToast(e.message, 'err');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSops(); }, [fetchSops]);

   // ================================
   // Group: documentType → individual records (seqNo is unique)
   // ================================
  const sections = useMemo(() => {
    const filtered = searchQuery.trim()
      ? sops.filter(
          (s) => {
            const q = searchQuery.toLowerCase();
            return (
              s.sopNo.toLowerCase().includes(q) ||
              s.name.toLowerCase().includes(q) ||
              String(s.seqNo).includes(searchQuery) ||
              s.daNo.toLowerCase().includes(q) ||
              s.versions?.some((v: SopVersionInfo) => v.daNo.toLowerCase().includes(q))
            );
          },
        )
      : sops;

    // API 已返回每个 SOP 含 versions 数组, 直接映射为 SopGroup
    const allGroups: SopGroup[] = filtered.map((sop) => ({
      sopNo: sop.sopNo,
      latest: sop,
      versions: sop.versions || [],
    }));

    const sectionMap = new Map<string, SopGroup[]>();
    for (const g of allGroups) {
      const key = g.latest.documentType;
      const list = sectionMap.get(key) || [];
      list.push(g);
      sectionMap.set(key, list);
    }
    for (const [, groups] of sectionMap) {
      groups.sort((a, b) => a.latest.seqNo - b.latest.seqNo);
    }

    return DOC_TYPE_ORDER
      .filter((dt) => sectionMap.has(dt))
      .map((dt) => ({ documentType: dt, groups: sectionMap.get(dt)! }));
  }, [sops, searchQuery]);

  // ================================
  const showToast = (msg: string, type: 'ok' | 'err') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });

  // Technical Documents: strip "Rev" prefix, show only number
  const formatVersion = (v: string, docType: string) => {
    if (docType === 'Technical Document') {
      return v.replace(/^rev\s*/i, '');
    }
    return v;
  };

  const openEdit = (sop: TrainingSop) => {
    setEditingSop(sop);
    setModalMode('edit');
    setShowModal(true);
  };

  const openAdd = () => {
    setEditingSop(null);
    setModalMode('create');
    setShowModal(true);
  };

  const openRevision = (sop: TrainingSop) => {
    setEditingSop(sop); // parent SOP to inherit sopNo from
    setModalMode('revision');
    setShowModal(true);
  };

  const totalActive = sops.filter((s) => s.status === 'ACTIVE').length;
  const totalTraining = sops.filter((s) => s.trainingRequired).length;

  // Compute set of IDs that are the latest version for their sopNo group
  const latestIds = useMemo(() => {
    const ids = new Set<string>();
    for (const sec of sections) {
      for (const g of sec.groups) {
        ids.add(g.latest.id);
      }
    }
    return ids;
  }, [sections]);

  // ================================
  return (
    <div style={{ backgroundColor: colors.bg }} className="min-h-screen pb-20">
      <section className="pt-12 pb-6 px-6">
        <div className="max-w-[1200px] mx-auto">
          <VmaTabSelector />
        </div>
      </section>

      {/* Header — aligned with other pages */}
      <div className="max-w-[1200px] mx-auto px-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 style={{ color: colors.text }} className="text-xl font-semibold mb-1">
              {t('trainingSop.title')}
            </h2>
            <p style={{ color: colors.textSecondary }} className="text-sm">
              {sops.length} {t('trainingSop.list.documents')} · {totalActive} {t('trainingSop.status.active')} · {totalTraining} {t('trainingSop.list.requireTraining')}
            </p>
          </div>
          <button
            onClick={openAdd}
            style={{ backgroundColor: colors.controlAccent, color: colors.white }}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-medium hover:opacity-90 transition"
          >
            <IconPlus /> {t('trainingSop.actions.add')}
          </button>
        </div>
      </div>

      {/* Content — wider for SOP table */}
      <div className="max-w-[1800px] mx-auto px-6">
        {/* Search */}
        <div className="mb-6 relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2"><IconSearch color={colors.textTertiary} /></div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('trainingSop.search')}
            style={{ backgroundColor: colors.bgSecondary, color: colors.text, borderColor: colors.border }}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        </div>

        {/* Sections */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : sections.length === 0 ? (
          <div className="text-center py-20" style={{ color: colors.textSecondary }}>{t('trainingSop.list.empty')}</div>
        ) : (
          <div className="space-y-8">
            {sections.map(({ documentType, groups }) => {
              const cfg = getDocTypeConfig(colors)[documentType] || getDocTypeConfig(colors)['Procedure Document'];
              const TypeIcon = DOC_TYPE_ICONS[documentType] || IconDoc;
              return (
                <DocTypeSection
                  key={documentType}
                  documentType={documentType}
                  groups={groups}
                  cfg={cfg}
                  TypeIcon={TypeIcon}
                  colors={colors}
                  theme={theme}
                  t={t}
                  formatDate={formatDate}
                  formatVersion={formatVersion}
                  onClickSop={openEdit}
                  expandedGroupId={expandedGroupId}
                  onExpand={setExpandedGroupId}
                />
              );
            })}
          </div>
        )}
      </div>

      {/*
        ╔═══════════════════════════════════════════════════════════════════╗
        ║  🔒 LOCKED: 版本历史下拉 Backdrop 虚化层 - 请勿修改               ║
        ║  Last verified: 2026-02-06 by Agent                              ║
        ╠═══════════════════════════════════════════════════════════════════╣
        ║  行为说明:                                                        ║
        ║  1. expandedGroupId 非空时显示全屏半透明 + blur 遮罩               ║
        ║  2. 点击遮罩 → 收起下拉                                           ║
        ║  3. z-10: 低于展开的行 (z-20)，高于其他内容                        ║
        ║                                                                  ║
        ║  ⚠️  禁止操作:                                                   ║
        ║  - 不要移除 backdrop-filter: blur                                 ║
        ║  - 不要修改 z-index 层级关系 (backdrop=10, row=20)                ║
        ╚═══════════════════════════════════════════════════════════════════╝
      */}
      {expandedGroupId && (
        <div
          className="fixed inset-0 z-10 transition-opacity"
          style={{ backgroundColor: 'rgba(0,0,0,0.08)', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)' }}
          onClick={() => setExpandedGroupId(null)}
        />
      )}

      {/* Modal */}
      {showModal && (
        <SopFormModal
          mode={modalMode}
          sop={editingSop}
          isLatest={editingSop ? latestIds.has(editingSop.id) : false}
          colors={colors}
          theme={theme}
          t={t}
          onClose={() => setShowModal(false)}
          onSave={() => {
            setShowModal(false);
            showToast(t('trainingSop.actions.saveSuccess'), 'ok');
            fetchSops();
          }}
          onError={(msg) => showToast(msg, 'err')}
          onRevision={(sop) => {
            setShowModal(false);
            setTimeout(() => { openRevision(sop); }, 100);
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 px-5 py-3 rounded-xl text-sm font-medium shadow-lg z-50"
          style={{ backgroundColor: toast.type === 'ok' ? colors.green : colors.red, color: colors.white }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ================================
// Document Type Section
// ================================
function DocTypeSection({
  documentType,
  groups,
  cfg,
  TypeIcon,
  colors,
  theme,
  t,
  formatDate,
  formatVersion,
  onClickSop,
  expandedGroupId,
  onExpand,
}: {
  documentType: string;
  groups: SopGroup[];
  cfg: { accent: string; bg: string };
  TypeIcon: React.FC<{ color?: string; size?: number }>;
  colors: any;
  theme: string;
  t: any;
  formatDate: (d: string) => string;
  formatVersion: (v: string, docType: string) => string;
  onClickSop: (sop: TrainingSop) => void;
  expandedGroupId: string | null;
  onExpand: (id: string | null) => void;
}) {
  return (
    <section>
      {/* Section Header */}
      <div className="flex items-center gap-3 mb-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: cfg.bg }}>
          <TypeIcon color={cfg.accent} size={16} />
        </div>
        <h3 className="text-[15px] font-semibold" style={{ color: colors.text }}>
          {t(`trainingSop.documentTypes.${documentType}`) || documentType}
        </h3>
        <span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: cfg.bg, color: cfg.accent }}>
          {groups.length}
        </span>
      </div>

      {/* Table */}
      <div
        className="rounded-xl border overflow-visible"
        style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
        onMouseMove={(e) => {
          const el = (e.target as HTMLElement).closest('[data-group-id]');
          if (el) {
            const id = el.getAttribute('data-group-id')!;
            const multi = el.getAttribute('data-has-multiple') === 'true';
            const newId = multi ? id : null;
            if (newId !== expandedGroupId) onExpand(newId);
          }
        }}
        onMouseLeave={() => onExpand(null)}
      >
        {/* Header */}
        <div
          className="grid items-center px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider"
          style={{
            color: colors.textTertiary,
            borderBottom: `1px solid ${colors.border}`,
            gridTemplateColumns: '44px 120px minmax(0, 1fr) 44px 76px 96px 100px 44px 76px',
            gap: '0 8px',
          }}
        >
          <span>{t('trainingSop.fields.seqNo')}</span>
          <span>{t('trainingSop.fields.sopNo')}</span>
          <span>{t('trainingSop.fields.name')}</span>
          <span>{t('trainingSop.fields.version')}</span>
          <span>DA#</span>
          <span>{t('trainingSop.fields.effectiveDate')}</span>
          <span>{t('trainingSop.fields.structureClassification')}</span>
          <span className="text-center">{t('trainingSop.training.short')}</span>
          <span className="text-right">{t('trainingSop.fields.status')}</span>
        </div>

        {/* Rows */}
        {groups.map((group) => (
          <SopRow
            key={group.sopNo + '-' + group.latest.id}
            group={group}
            colors={colors}
            theme={theme}
            t={t}
            formatDate={formatDate}
            formatVersion={(v: string) => formatVersion(v, documentType)}
            onClickSop={onClickSop}
            accent={cfg.accent}
            isExpanded={expandedGroupId === group.latest.id}
            onExpand={onExpand}
          />
        ))}
      </div>
    </section>
  );
}

// ================================
// SOP Row with hover dropdown
// ================================
function SopRow({
  group,
  colors,
  theme,
  t,
  formatDate,
  formatVersion,
  onClickSop,
  accent,
  isExpanded,
  onExpand,
}: {
  group: SopGroup;
  colors: any;
  theme: string;
  t: any;
  formatDate: (d: string) => string;
  formatVersion: (v: string) => string;
  onClickSop: (sop: TrainingSop) => void;
  accent: string;
  isExpanded: boolean;
  onExpand: (id: string | null) => void;
}) {
  const { latest, versions } = group;
  const hasMultiple = versions.length > 1;

  const isActive = latest.status === 'ACTIVE';

  return (
    <div
      data-group-id={latest.id}
      data-has-multiple={String(hasMultiple)}
      style={isExpanded ? { zIndex: 20, position: 'relative' } : { position: 'relative' }}
    >
      {/* Main Row — onMouseEnter here opens dropdown */}
      <div
        className="grid items-center px-4 py-3 cursor-pointer transition-colors group"
        style={{
          borderBottom: `1px solid ${colors.border}`,
          gridTemplateColumns: '44px 120px minmax(0, 1fr) 44px 76px 96px 100px 44px 76px',
          gap: '0 8px',
          backgroundColor: isExpanded ? (theme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)') : undefined,
        }}
        /* hover detection handled by table-level onMouseMove */
        onMouseOver={(e) => {
          if (!isExpanded) {
            (e.currentTarget as HTMLElement).style.backgroundColor =
              theme === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.015)';
          }
        }}
        onMouseOut={(e) => {
          if (!isExpanded) {
            (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
          }
        }}
        onClick={() => onClickSop(latest)}
      >
        {/* SeqNo */}
        <span className="text-xs font-mono" style={{ color: colors.textTertiary }}>{latest.seqNo}</span>

        {/* SopNo */}
        <div className="flex items-center gap-1">
          <span className="text-xs font-mono font-bold" style={{ color: accent }}>{displaySopNo(latest.sopNo)}</span>
          {hasMultiple && (
            <span className="text-[9px] px-1 py-0.5 rounded font-medium" style={{ backgroundColor: `${accent}15`, color: accent }}>
              {versions.length}
            </span>
          )}
        </div>

        {/* Name */}
        <span className="text-[13px] pr-3" style={{ color: colors.text, overflowWrap: 'break-word', wordBreak: 'break-word', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{latest.name}</span>

        {/* Version */}
        <span className="text-[11px] font-mono" style={{ color: colors.textSecondary }}>
          {formatVersion(latest.version)}
        </span>

        {/* DA# */}
        <span className="text-[11px] font-mono" style={{ color: latest.daNo === 'DA-2500' ? colors.textTertiary : accent }}>
          {latest.daNo === 'DA-2500' ? t('trainingSop.fields.initial') : latest.daNo}
        </span>

        {/* Date */}
        <span className="text-xs" style={{ color: colors.textSecondary }}>{formatDate(latest.effectiveDate)}</span>

        {/* Structure */}
        <span className="text-xs" style={{ color: colors.textSecondary, overflowWrap: 'break-word', wordBreak: 'break-word' }}>{latest.structureClassification === 'Master Document' ? (t('trainingSop.structureTypes.Master') || 'Master') : (t(`trainingSop.structureTypes.${latest.structureClassification}`) || latest.structureClassification)}</span>

        {/* Training Required */}
        <div className="flex justify-center">
          {latest.trainingRequired ? (
            <span className="w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: `${colors.blue}1f` }}>
              <IconGrad color={colors.blue} />
            </span>
          ) : (
            <span className="w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: colors.textTertiary }} />
            </span>
          )}
        </div>

        {/* Status */}
        <div className="flex justify-end">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium`}
            style={{
              backgroundColor: isActive ? `${colors.green}1a` : `${colors.orange}1a`,
              color: isActive ? colors.green : colors.orange,
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: isActive ? colors.green : colors.orange }} />
            {isActive ? t('trainingSop.status.active') : t('trainingSop.status.deprecated')}
          </span>
        </div>
      </div>

      {/*
        ╔═══════════════════════════════════════════════════════════════════╗
        ║  🔒 LOCKED: 版本历史下拉菜单 Hover 逻辑 - 请勿修改               ║
        ║  Last verified: 2026-02-06                                       ║
        ╠═══════════════════════════════════════════════════════════════════╣
        ║  核心机制: 表格级 onMouseMove 动态检测                             ║
        ║                                                                  ║
        ║  工作原理:                                                        ║
        ║  1. 每个 SopRow 外层 div 带 data-group-id + data-has-multiple    ║
        ║  2. Table 容器 onMouseMove → closest('[data-group-id]')          ║
        ║     动态识别鼠标所在行，实时切换 expandedGroupId                    ║
        ║  3. Table 容器 onMouseLeave → 关闭所有下拉                        ║
        ║  4. 面板是 inline 布局，推开下方内容                               ║
        ║  5. 展开行 z-20 浮于 backdrop (z-10) 之上                         ║
        ║                                                                  ║
        ║  为什么不用 onMouseEnter:                                         ║
        ║  inline 布局下，关闭 A 的下拉会导致 B 位置回弹，                    ║
        ║  mouseEnter 事件丢失。onMouseMove 在布局变化后的下一帧              ║
        ║  自动重新检测目标行，确保丝滑切换。                                 ║
        ║                                                                  ║
        ║  ⚠️  禁止操作:                                                   ║
        ║  - 不要用 onMouseEnter 替代 onMouseMove 检测                      ║
        ║  - 不要删除 data-group-id / data-has-multiple 属性               ║
        ║  - 不要使用 setTimeout / debounce 做 hover 延迟                   ║
        ║  - 不要把面板改为 position: absolute                              ║
        ╚═══════════════════════════════════════════════════════════════════╝
      */}
      {/* Version Dropdown — inline layout, pushes content */}
      {isExpanded && hasMultiple && (
        <div
          className="shadow-lg border-x border-b rounded-b-xl overflow-hidden"
          style={{
            backgroundColor: theme === 'dark' ? colors.bgTertiary : colors.bgElevated,
            borderColor: accent + '30',
            borderTop: `2px solid ${accent}`,
          }}
        >
          <div
            className="px-4 py-2 text-[11px] font-semibold flex items-center gap-2"
            style={{
              color: accent,
              backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)',
              borderBottom: `1px solid ${colors.border}`,
            }}
          >
            <IconClock color={accent} />
            {t('trainingSop.versionHistory')} — {displaySopNo(group.sopNo)}
          </div>

          {versions.map((v, idx) => {
            const isFirst = idx === 0;
            return (
              <div
                key={v.id}
                className={`grid items-center px-4 py-2.5 transition-colors${isFirst ? ' cursor-pointer' : ''}`}
                style={{
                  gridTemplateColumns: '44px 120px minmax(0, 1fr) 44px 76px 96px 100px 44px 76px',
                  gap: '0 8px',
                  borderBottom: idx < versions.length - 1 ? `1px solid ${colors.border}` : undefined,
                  backgroundColor: isFirst ? (theme === 'dark' ? `${accent}10` : `${accent}06`) : 'transparent',
                  opacity: isFirst ? 1 : 0.7,
                }}
                onMouseOver={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor =
                    theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)';
                }}
                onMouseOut={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = isFirst
                    ? (theme === 'dark' ? `${accent}10` : `${accent}06`)
                    : 'transparent';
                }}
                onClick={isFirst ? () => { onExpand(null); onClickSop(latest); } : undefined}
              >
                <span className="text-xs font-mono" style={{ color: colors.textTertiary }}>{latest.seqNo}</span>
                <span className="text-xs font-mono" style={{ color: colors.textSecondary }}>
                  {displaySopNo(latest.sopNo)}
                  {isFirst && (
                    <span className="ml-1.5 text-[9px] px-1 rounded font-medium" style={{ backgroundColor: `${colors.green}1a`, color: colors.green }}>
                      {t('trainingSop.status.latest')}
                    </span>
                  )}
                </span>
                <span className="text-[12px] pr-3" style={{ color: colors.text, overflowWrap: 'break-word', wordBreak: 'break-word', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{latest.name}</span>
                <span className="text-[11px] font-mono text-center" style={{ color: colors.textSecondary }}>{formatVersion(v.version)}</span>
                <span className="text-[11px] font-mono" style={{ color: v.daNo === 'DA-2500' ? colors.textTertiary : accent }}>{v.daNo === 'DA-2500' ? t('trainingSop.fields.initial') : v.daNo}</span>
                <span className="text-[11px]" style={{ color: colors.textSecondary }}>{formatDate(v.effectiveDate)}</span>
                <span className="text-[11px]" style={{ color: colors.textSecondary, overflowWrap: 'break-word', wordBreak: 'break-word' }}>{latest.structureClassification === 'Master Document' ? (t('trainingSop.structureTypes.Master') || 'Master') : (t(`trainingSop.structureTypes.${latest.structureClassification}`) || latest.structureClassification)}</span>
                <div className="flex justify-center">
                  {v.trainingRequired ? (
                    <span className="w-4 h-4 rounded-full flex items-center justify-center" style={{ backgroundColor: `${colors.blue}1f` }}>
                      <IconGrad color={colors.blue} />
                    </span>
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: colors.textTertiary }} />
                  )}
                </div>
                <div className="flex justify-end">
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-medium`}
                    style={{
                      backgroundColor: isActive ? `${colors.green}1a` : `${colors.orange}1a`,
                      color: isActive ? colors.green : colors.orange,
                    }}
                  >
                    <span className="w-1 h-1 rounded-full" style={{ backgroundColor: isActive ? colors.green : colors.orange }} />
                    {isActive ? t('trainingSop.status.active') : t('trainingSop.status.deprecated')}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ================================
// Form Modal (create / edit / revision)
// ================================
function SopFormModal({
  mode,
  sop,
  isLatest,
  colors,
  theme,
  t,
  onClose,
  onSave,
  onError,
  onRevision,
}: {
  mode: ModalMode;
  sop: TrainingSop | null;
  isLatest: boolean;
  colors: any;
  theme: string;
  t: any;
  onClose: () => void;
  onSave: () => void;
  onError: (msg: string) => void;
  onRevision: (sop: TrainingSop) => void;
}) {
  const isEdit = mode === 'edit';
  const isRevision = mode === 'revision';

  // Auto-increment version: "C2" → "C3", "D9" → "D10"
  const incrementVersion = (v: string): string => {
    const match = v.match(/^([A-Za-z]+)(\d+)$/);
    if (!match) return '';
    return match[1] + (parseInt(match[2], 10) + 1);
  };

  const [seqNo, setSeqNo] = useState(isEdit ? sop!.seqNo : 0);
  const [sopNo, setSopNo] = useState(sop ? displaySopNo(sop.sopNo) : '');
  const [name, setName] = useState(isEdit ? sop!.name : (isRevision ? sop!.name : ''));
  const [description, setDescription] = useState(isEdit ? (sop!.description || '') : '');
  const [version, setVersion] = useState(
    isEdit ? sop!.version : (isRevision && sop ? incrementVersion(sop.version) : ''),
  );
  const [effectiveDate, setEffectiveDate] = useState(
    isEdit && sop?.effectiveDate
      ? new Date(sop.effectiveDate).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
      : '',
  );
  const [structureClassification, setStructureClassification] = useState(
    sop?.structureClassification || 'Master Document',
  );
  const [documentType, setDocumentType] = useState(sop?.documentType || 'Procedure Document');
  const [trainingRequired, setTrainingRequired] = useState(sop?.trainingRequired ?? true);
  const [daNo, setDaNo] = useState(sop?.daNo || '');
  const [saving, setSaving] = useState(false);

  // Auto-fetch next seqNo for create and revision
  useEffect(() => {
    if (!isEdit) {
      api<{ nextSeqNo: number }>('/vma/training-sops/next-seq').then((r) => setSeqNo(r.nextSeqNo)).catch(() => {});
    }
  }, [isEdit]);

  const title = isEdit
    ? t('trainingSop.form.title_edit')
    : isRevision
      ? t('trainingSop.form.title_revision')
      : t('trainingSop.form.title_create');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (isEdit) {
        // 更新主文档信息 (不含版本)
        await api(`/vma/training-sops/${sop!.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name,
            description: description.trim() || undefined,
            structureClassification,
            documentType,
            version,
            daNo,
            effectiveDate,
            trainingRequired,
          }),
        });
      } else if (isRevision && sop) {
        // 添加新版本到版本表
        await api(`/vma/training-sops/${sop.id}/version`, {
          method: 'POST',
           body: JSON.stringify({
            version,
            daNo,
            effectiveDate,
            trainingRequired,
          }),
        });
      } else {
        // 创建新SOP + 初始版本
        await api('/vma/training-sops', {
          method: 'POST',
          body: JSON.stringify({
            seqNo,
            sopNo,
            name,
            description: description.trim() || undefined,
            version,
            daNo,
            effectiveDate,
            structureClassification,
            documentType,
            trainingRequired,
          }),
        });
      }
      onSave();
    } catch (e: any) {
      onError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeprecate = async () => {
    if (!sop) return;
    setSaving(true);
    try {
      await api(`/vma/training-sops/${sop.id}/toggle`, { method: 'PATCH' });
      onSave();
    } catch (e: any) {
      onError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const structOptions = ['Master Document', 'Form', 'Template', 'Attachment'];
  const docTypeOptions = ['Procedure Document', 'Management Regulation', 'Technical Document', 'Quality Manual'];
  const getStructLabel = (o: string) => t(`trainingSop.structureTypes.${o}`) || o;
  const getDocTypeLabel = (o: string) => t(`trainingSop.documentTypes.${o}`) || o;

  const fieldStyle = { backgroundColor: colors.bg, color: colors.text, borderColor: colors.border };
  const lockedStyle = { ...fieldStyle, backgroundColor: colors.bgTertiary, opacity: 0.7 };

  // sopNo and seqNo are locked in edit and revision modes
  const sopNoLocked = isEdit || isRevision;
  const seqNoLocked = isEdit;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
        className="w-full max-w-lg rounded-2xl border shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <div className="flex items-center gap-3">
            <h2 style={{ color: colors.text }} className="text-lg font-bold">{title}</h2>
            {isRevision && (
              <span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: `${colors.blue}1a`, color: colors.blue }}>
                {displaySopNo(sop!.sopNo)}
              </span>
            )}
          </div>
          {isEdit && (
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium`}
              style={{
                backgroundColor: sop!.status === 'ACTIVE' ? `${colors.green}1a` : `${colors.orange}1a`,
                color: sop!.status === 'ACTIVE' ? colors.green : colors.orange,
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: sop!.status === 'ACTIVE' ? colors.green : colors.orange }} />
              {sop!.status === 'ACTIVE' ? t('trainingSop.status.active') : t('trainingSop.status.deprecated')}
            </span>
          )}
        </div>

        {isRevision && (
          <div className="mx-6 mb-3 px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: `${colors.blue}0f`, color: colors.blue, border: `1px solid ${colors.blue}26` }}>
            {t('trainingSop.form.revisionHint')}
          </div>
        )}

        <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-4">
          {/* SeqNo + SOP No */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>
                {t('trainingSop.fields.seqNo')}
              </label>
              <input
                type="number"
                required
                value={seqNo}
                onChange={(e) => setSeqNo(Number(e.target.value))}
                readOnly={seqNoLocked}
                style={seqNoLocked ? lockedStyle : fieldStyle}
                className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-blue-500/30 font-mono"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>
                {t('trainingSop.fields.sopNo')}
              </label>
              <input
                type="text"
                required
                value={sopNo}
                onChange={(e) => setSopNo(e.target.value.toUpperCase())}
                placeholder={t('trainingSop.form.sopNo_placeholder')}
                readOnly={sopNoLocked}
                style={sopNoLocked ? lockedStyle : fieldStyle}
                className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-blue-500/30 font-mono"
              />
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>{t('trainingSop.fields.name')}</label>
            <input
              type="text" required value={name} onChange={(e) => setName(e.target.value)}
              placeholder={t('trainingSop.form.name_placeholder')}
              style={fieldStyle}
              className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-blue-500/30"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>{t('trainingSop.fields.description')}</label>
            <textarea
              value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder={t('trainingSop.form.description_placeholder')}
              rows={2} style={fieldStyle}
              className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-blue-500/30 resize-none"
            />
          </div>

          {/* Version + DA# + Date */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>{t('trainingSop.fields.version')}</label>
              <input
                type="text" required value={version} onChange={(e) => setVersion(e.target.value)}
                placeholder={t('trainingSop.form.version_placeholder')}
                style={fieldStyle}
                className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-blue-500/30 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>DA#</label>
              <input
                type="text" required value={daNo} onChange={(e) => setDaNo(e.target.value)}
                placeholder="DA-2501"
                style={fieldStyle}
                className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-blue-500/30 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>{t('trainingSop.fields.effectiveDate')}</label>
              <input
                type="date" required value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)}
                style={{ ...fieldStyle, colorScheme: theme === 'dark' ? 'dark' : 'light', cursor: 'pointer' }}
                className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </div>
          </div>

          {/* Structure + Type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>{t('trainingSop.fields.structureClassification')}</label>
              <select value={structureClassification} onChange={(e) => setStructureClassification(e.target.value)} style={fieldStyle} className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-blue-500/30">
                {structOptions.map((o) => <option key={o} value={o}>{getStructLabel(o)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>{t('trainingSop.fields.documentType')}</label>
              <select value={documentType} onChange={(e) => setDocumentType(e.target.value)} style={fieldStyle} className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-blue-500/30">
                {docTypeOptions.map((o) => <option key={o} value={o}>{getDocTypeLabel(o)}</option>)}
              </select>
            </div>
          </div>

          {/* Training Required */}
          <div className="flex items-center gap-3 pt-1">
            <label className="text-xs font-medium" style={{ color: colors.textSecondary }}>{t('trainingSop.fields.trainingRequired')}</label>
            <button
              type="button"
              onClick={() => setTrainingRequired(!trainingRequired)}
              style={{ width: 44, height: 24, borderRadius: 12, backgroundColor: trainingRequired ? colors.blue : colors.gray4, position: 'relative', transition: 'background-color 0.2s', flexShrink: 0 }}
            >
              <span style={{ position: 'absolute', top: 2, left: trainingRequired ? 22 : 2, width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s' }} />
            </button>
            <span className="text-xs" style={{ color: colors.text }}>
              {trainingRequired ? t('trainingSop.training.required') : t('trainingSop.training.notRequired')}
            </span>
          </div>

          {/* Divider */}
          <div style={{ borderTop: `1px solid ${colors.border}` }} className="pt-3 mt-1" />

          {/* Actions */}
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              {isEdit && (
                <button
                  type="button" onClick={handleDeprecate} disabled={saving}
                  className="px-4 py-2 rounded-xl text-sm font-medium transition disabled:opacity-50"
                  style={{
                    backgroundColor: sop!.status === 'ACTIVE' ? `${colors.orange}1a` : `${colors.green}1a`,
                    color: sop!.status === 'ACTIVE' ? colors.orange : colors.green,
                  }}
                >
                  {sop!.status === 'ACTIVE' ? t('trainingSop.actions.deprecate') : t('trainingSop.actions.activate')}
                </button>
              )}
              {isEdit && isLatest && (
                <button
                  type="button"
                  onClick={() => onRevision(sop!)}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition disabled:opacity-50"
                  style={{ backgroundColor: `${colors.blue}1a`, color: colors.blue }}
                >
                  <IconRevision color={colors.blue} />
                  {t('trainingSop.actions.newRevision')}
                </button>
              )}
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={onClose} style={{ color: colors.textSecondary }} className="px-4 py-2 rounded-xl text-sm hover:opacity-70 transition">
                {t('employees.career.cancel') || 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={saving || !sopNo.trim() || !name.trim() || !version.trim() || !effectiveDate}
                style={{ backgroundColor: colors.controlAccent, color: colors.white }}
                className="px-5 py-2 rounded-xl text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
              >
                {saving ? '...' : (t('sopRequirementsModal.save') || 'Save')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
