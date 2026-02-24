'use client';
import { VMA_API as API, getAuthHeaders } from '@/lib/vma-api';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createTimeline, animate, stagger } from 'animejs';
import { useModal } from '@/components/modal/GlobalModal';

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, { ...init, headers: { ...getAuthHeaders(), ...init?.headers } });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

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

interface SopHistoryGroup {
  changeDate: string;
  changeType: string;
  changes: { id: string; changeType: string; sopNo: string; sopName?: string }[];
}

/* ───── Layout constants ───── */
const CARD_W = 650;           // Standard width: Wide enough for no wrapping
const CARD_GAP = 180;         // Breathable gap between items
const SLOT_W = CARD_W + CARD_GAP; 



export default function SopRoadmapModal({
  department,
  colors,
  theme,
  t,
  onClose,
  onSave,
  onError,
}: {
  department: Department;
  colors: any;
  theme: string;
  t: any;
  onClose: () => void;
  onSave: () => void;
  onError: (msg: string) => void;
}) {
  // ===== State =====
  const [history, setHistory] = useState<SopHistoryGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { showConfirm } = useModal();
  const containerRef = useRef<HTMLDivElement>(null);
  const [animated, setAnimated] = useState(false);
  
  // Drag to scroll
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  // ===== SOP Data =====
  const [allSops, setAllSops] = useState<SopItem[]>([]);
  const [loadingSops, setLoadingSops] = useState(false);

  // ===== Editor Popup State =====
  const [popupIdx, setPopupIdx] = useState<number | null>(null);
  const [popupSearch, setPopupSearch] = useState('');
  const [popupSelected, setPopupSelected] = useState<Set<string>>(new Set());
  const [popupDate, setPopupDate] = useState(() => new Date().toISOString().slice(0, 10));

  const fetchHistory = useCallback(async () => {
    try {
      const data = await api<SopHistoryGroup[]>(`/vma/departments/${department.id}/sop-history`);
      setHistory(data);
    } catch (e: any) {
      console.error('Failed to load SOP history:', e);
    } finally {
      setLoading(false);
    }
  }, [department.id]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const loadSops = useCallback(async () => {
    if (allSops.length > 0) return;
    setLoadingSops(true);
    try {
      const sopsRaw = await api<any[]>('/vma/training-sops');
      const sopMap = new Map<string, SopItem>();
      for (const s of sopsRaw) {
        if (s.documentType !== 'Technical Document' && s.structureClassification !== 'Master Document') continue;
        const existing = sopMap.get(s.sopNo);
        if (!existing || s.seqNo < existing.seqNo) {
          sopMap.set(s.sopNo, {
            seqNo: s.seqNo, sopNo: s.sopNo, name: s.name,
            status: s.status || 'ACTIVE',
            documentType: s.documentType || '',
            structureClassification: s.structureClassification || '',
          });
        }
      }
      setAllSops(Array.from(sopMap.values()).sort((a, b) => a.seqNo - b.seqNo));
    } catch (e: any) {
      onError(e.message);
    } finally {
      setLoadingSops(false);
    }
  }, [allSops.length, onError]);

  useEffect(() => { loadSops(); }, [loadSops]);

  const latestGroupIdx = history.length - 1;

  const typeLabel = (ct: string) => {
    switch (ct) {
      case 'INITIAL': return t('sopHistory.initial') || 'Initial Setup';
      case 'ADD': return t('sopHistory.add') || 'Added';
      case 'REMOVE': return t('sopHistory.remove') || 'Removed';
      default: return ct;
    }
  };

  const fmtDateShort = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' });

  // ===== Drag Handlers =====
  const onMouseDown = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    setIsDragging(true);
    setStartX(e.pageX - containerRef.current.offsetLeft);
    setScrollLeft(containerRef.current.scrollLeft);
  };
  
  const onMouseLeave = () => { setIsDragging(false); };
  const onMouseUp = () => { setIsDragging(false); };
  
  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !containerRef.current) return;
    e.preventDefault();
    const x = e.pageX - containerRef.current.offsetLeft;
    const walk = (x - startX) * 1.5; 
    containerRef.current.scrollLeft = scrollLeft - walk;
  };

  // ===== Popup Handlers =====
  const openMilestonePopup = (gi: number) => {
    const group = history[gi];
    const selectedNos = new Set(
      group.changes
        .filter(c => c.changeType === 'ADD' || c.changeType === 'INITIAL')
        .map(c => c.sopNo)
    );
    setPopupSelected(selectedNos);
    setPopupDate(new Date(group.changeDate).toISOString().slice(0, 10));
    setPopupSearch('');
    setPopupIdx(gi);
  };

  const openNewPopup = () => {
    const latestSopNos = new Set<string>();
    if (history.length > 0) {
      for (const group of history) {
        for (const c of group.changes) {
          if (c.changeType === 'ADD' || c.changeType === 'INITIAL') latestSopNos.add(c.sopNo);
          if (c.changeType === 'REMOVE') latestSopNos.delete(c.sopNo);
        }
      }
    }
    setPopupSelected(latestSopNos);
    setPopupDate(new Date().toISOString().slice(0, 10));
    setPopupSearch('');
    setPopupIdx(-1);
  };

  const handleSaveRequirements = async () => {
    if (!popupDate) { onError('Please select a change date'); return; }
    setSaving(true);
    try {
      await api(`/vma/departments/${department.id}/sop-requirements`, {
        method: 'PUT',
        body: JSON.stringify({ sopNos: Array.from(popupSelected), changeDate: popupDate }),
      });
      setPopupIdx(null);
      setAnimated(false);
      await fetchHistory();
      onSave();
    } catch (e: any) { onError(e.message); }
    finally { setSaving(false); }
  };

  const handleDeleteGroup = (group: SopHistoryGroup, dateLabel: string) => {
    showConfirm({
      title: t('sopHistory.deleteGroup') || 'Delete Change Group',
      message: `${t('sopHistory.confirmDeleteGroup') || 'Delete all'} ${group.changes.length} ${t('sopHistory.recordsOnDate') || 'records on'} ${dateLabel}?`,
      confirmText: t('departments.actions.delete') || 'Delete',
      confirmClass: 'danger',
      onConfirm: async () => {
        for (const c of group.changes) { await api(`/vma/duty-sop-history/${c.id}`, { method: 'DELETE' }); }
        await fetchHistory();
        onSave();
        setPopupIdx(null);
      },
    });
  };

  // ===== Animation =====
  useEffect(() => {
    if (loading || history.length === 0 || animated) return;
    const el = containerRef.current;
    if (!el) return;

    try {
        const tl = createTimeline({
            playbackEase: 'inOut(3)',
            defaults: { duration: 900, ease: 'out(3)' },
        });

        const line = el.querySelector('.timeline-line');
        if (line) {
            tl.add(line, { scaleX: [0, 1], duration: 800 });
        }

        history.forEach((_g, i) => {
            tl.add(`.ms-card-${i}`, {
                opacity: [0, 1],
                translateY: ['50px', '0px'],
                duration: 600,
            }, `<-=400`);
            
            tl.add(`.ms-node-${i}`, {
                scale: [0, 1],
                opacity: [0, 1],
                duration: 400,
            }, `<-=300`);
            
            tl.add(`.ms-date-${i}`, {
                opacity: [0, 1],
                translateY: [20, 0],
                duration: 400,
            }, `<-=200`);
        });

        tl.add('.ms-add-node', {
            scale: [0, 1],
            opacity: [0, 1], 
            duration: 400,
        }, `<-=100`);

        setAnimated(true);
    } catch(e) {
        console.warn("Animation failed, elements should be visible by default as fallback", e);
    }
  }, [loading, history.length, animated]);

  // Helpers
  const popupFiltered = popupSearch.trim()
    ? allSops.filter(s => s.sopNo.toLowerCase().includes(popupSearch.toLowerCase()) || s.name.toLowerCase().includes(popupSearch.toLowerCase()))
    : allSops;
  
  const togglePopupSop = (sopNo: string) => {
    setPopupSelected(prev => { const next = new Set(prev); if (next.has(sopNo)) next.delete(sopNo); else next.add(sopNo); return next; });
  };

  const minNewDate = history.length > 0 ? (() => {
    const last = new Date(history[history.length - 1].changeDate);
    last.setDate(last.getDate() + 1);
    return last.toISOString().slice(0, 10);
  })() : undefined;

  const isDark = theme === 'dark';



  return (
    <div className="fixed inset-0 backdrop-blur-3xl flex flex-col z-50 selection:bg-purple-500/30" 
         style={{ backgroundColor: isDark ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.6)' }}>
      
      <style>{`
        @keyframes nodePulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(139,92,246,0.3); }
          50% { transform: scale(1.2); box-shadow: 0 0 0 10px rgba(139,92,246,0); }
        }
        .pulse-node { animation: nodePulse 2s ease-in-out infinite; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        /* Glass gradient background for dark mode cards */
        .glass-card-dark {
          background: linear-gradient(145deg, rgba(40,40,45,0.6) 0%, rgba(20,20,25,0.8) 100%);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255,255,255,0.08);
          box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3);
        }
        .glass-card-light {
           background: rgba(255, 255, 255, 0.7);
           backdrop-filter: blur(20px);
           -webkit-backdrop-filter: blur(20px);
           border: 1px solid rgba(255,255,255,0.5);
           box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.1);
        }
      `}</style>
      
      {/* HEADER */}
      <div className="absolute top-0 left-0 right-0 z-[60] px-12 py-8 flex items-start justify-between pointer-events-none">
        <div className="pointer-events-auto">
          <h2 className="text-4xl font-extrabold tracking-tight drop-shadow-xl" 
                style={{ 
                  color: 'transparent', 
                  backgroundImage: isDark 
                    ? 'linear-gradient(to right, #fff, #a1a1aa)' 
                    : 'linear-gradient(to right, #000, #555)',
                  backgroundClip: 'text',
                  WebkitBackgroundClip: 'text'
                }}>
            {t('sopRequirementsModal.title') || 'SOP Requirements Roadmap'}
          </h2>
          <div className="flex items-center gap-3 mt-2">
            <span className="text-lg font-bold" style={{ color: colors.indigo }}>{department.code}</span>
            <div className={`h-1 w-1 rounded-full opacity-50 ${isDark ? 'bg-white' : 'bg-black'}`} />
            <span className="text-lg opacity-60 font-medium" style={{ color: colors.textSecondary }}>{department.duties}</span>
          </div>
        </div>
        <div className="pointer-events-auto">
          <button onClick={onClose} className="w-12 h-12 flex items-center justify-center rounded-full hover:bg-white/10 transition backdrop-blur-md border border-white/10 group">
             <svg className="w-6 h-6 transition-transform group-hover:rotate-90" fill="none" stroke={colors.text} viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      </div>

      {/* DRAGGABLE CONTAINER */}
      <div 
        ref={containerRef}
        className="flex-1 w-full overflow-x-auto no-scrollbar cursor-grab active:cursor-grabbing relative"
        onMouseDown={onMouseDown} onMouseLeave={onMouseLeave} onMouseUp={onMouseUp} onMouseMove={onMouseMove}
      >
        {loading ? (
          <div className="h-full w-full flex items-center justify-center"><div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : history.length === 0 ? (
          <div className="h-full w-full flex flex-col items-center justify-center gap-6">
            <div className="text-xl font-medium opacity-50">{t('sopHistory.noHistoryFound') || 'No history found'}</div>
            <button onClick={openNewPopup} className="px-8 py-4 rounded-2xl text-lg font-bold shadow-xl hover:scale-105 transition hover:shadow-purple-500/25" style={{ backgroundColor: colors.indigo, color: colors.white }}>{t('sopHistory.createFirstMilestone') || 'Create First Milestone'}</button>
          </div>
        ) : (
          /* PADDING-LEFT: 33vw to start at 1/3 screen */
          <div className="h-full flex items-center min-w-max" style={{ paddingLeft: '33vw', paddingRight: '10vw' }}>
            <div className="relative pt-[10vh]" style={{ height: '70vh' }}>
              
              {/* CARDS */}
              <div className="flex items-end mb-16">
                {history.map((group, gi) => {
                  const isLatest = gi === latestGroupIdx;
                  return (
                    <div key={gi} className={`ms-card-${gi} flex-shrink-0 relative group opacity-0`} style={{ width: `${CARD_W}px`, marginRight: `${CARD_GAP}px`, marginBottom: '20px' }}>
                      <div className={`w-full rounded-[24px] overflow-hidden transition-all duration-300 hover:-translate-y-2 cursor-default ${isDark ? 'glass-card-dark' : 'glass-card-light'}`}
                         style={{ 
                           borderColor: isLatest ? colors.indigo : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'),
                           boxShadow: isLatest ? `0 0 40px -10px ${colors.indigo}80` : undefined,
                           height: '50vh',
                           color: colors.text
                         }}>
                        <div className="px-6 py-5 border-b flex items-center justify-between" 
                             style={{ 
                                 borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                                 background: isDark ? 'linear-gradient(to bottom, rgba(255,255,255,0.05), rgba(255,255,255,0))' : 'rgba(255,255,255,0.5)'
                             }}>
                          <span className={`text-xs font-bold px-3 py-1.5 rounded-full tracking-wider border shadow-sm ${
                              group.changeType === 'REMOVE' 
                              ? 'bg-red-500/10 text-red-500 border-red-500/20' 
                              : 'bg-green-500/10 text-green-500 border-green-500/20'
                          }`}>{typeLabel(group.changeType)}</span>
                          
                          <button onClick={() => openMilestonePopup(gi)} className="text-xs font-bold px-4 py-1.5 rounded-full bg-purple-500/10 text-purple-500 hover:bg-purple-500/20 hover:scale-105 transition border border-purple-500/20">{t('sopHistory.editButton') || 'EDIT'}</button>
                        </div>
                        <div className="p-0 overflow-y-auto h-[calc(50vh-80px)] no-scrollbar">
                          {group.changes.map((c, ci) => {
                              return (
                                <div key={ci} className="px-6 py-4 border-b border-dashed flex items-center gap-4 hover:bg-white/5 transition" style={{ borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }}>
                                  <div className="flex-shrink-0 w-24">
                                      <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded border" 
                                            style={{ color: colors.blue, borderColor: `${colors.blue}40`, backgroundColor: `${colors.blue}10` }}>
                                          {c.sopNo}
                                      </span>
                                  </div>
                                  <span className="text-sm font-medium leading-relaxed opacity-90 break-words" style={{ color: colors.text }}>{c.sopName}</span>
                                </div>
                              );
                          })}
                          {group.changes.length === 0 && <div className="p-8 text-center text-sm opacity-40 italic">{t('sopHistory.noSopsListed') || 'No SOPs listed'}</div>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* TIMELINE */}
              <div className="absolute bottom-0 left-0 right-0 h-[80px]">
                <div className="timeline-line absolute top-1/2 left-0 right-0 -translate-y-1/2"
                     style={{ 
                         height: '2px', 
                         background: `linear-gradient(90deg, ${colors.indigo} 0%, ${colors.blue} 100%)`, 
                         transformOrigin: 'left center', 
                         width: `${history.length * SLOT_W + 200}px`,
                         boxShadow: '0 0 15px rgba(191,90,242,0.5)'
                     }} />

                {history.map((group, gi) => {
                  const isLatest = gi === latestGroupIdx;
                  const cx = gi * SLOT_W + CARD_W / 2; 
                  return (
                    <div key={gi} className="absolute top-1/2 left-0 -translate-y-1/2" style={{ transform: `translateX(${cx}px)` }}>
                      <div className={`ms-node-${gi} relative w-8 h-8 -ml-4 flex items-center justify-center cursor-pointer hover:scale-125 transition-transform duration-300 opacity-0 group`} onClick={() => openMilestonePopup(gi)}>
                         <div className={`w-5 h-5 rounded-full border-[3px] shadow-lg z-10 transition-colors ${isLatest ? 'pulse-node' : ''}`} 
                              style={{ 
                                  backgroundColor: colors.bg,
                                  borderColor: isLatest ? colors.indigo : colors.text
                              }} />
                         <div className="absolute bottom-4 left-1/2 w-[1px] h-[60px] -ml-[0.5px]" 
                              style={{ background: `linear-gradient(to top, ${colors.indigo}, transparent)` }} />
                      </div>
                      <div className={`ms-date-${gi} absolute top-12 left-1/2 -translate-x-1/2 text-center w-[200px] opacity-0`}>
                        <div className="text-sm font-bold" style={{ color: colors.text }}>{fmtDateShort(group.changeDate)}</div>
                        <div className="text-[10px] opacity-70 mt-1 uppercase tracking-widest font-semibold">{group.changes.length} {t('sopHistory.items') || 'Items'}</div>
                      </div>
                    </div>
                  );
                })}

                <div className="ms-add-node absolute top-1/2 left-0 -translate-y-1/2 opacity-0" style={{ transform: `translateX(${history.length * SLOT_W + CARD_W / 2}px)` }}>
                   <div onClick={openNewPopup} className="w-12 h-12 -ml-6 rounded-full bg-purple-600 text-white flex items-center justify-center shadow-[0_0_20px_rgba(191,90,242,0.6)] cursor-pointer hover:scale-110 hover:bg-purple-500 transition-all z-20"><span className="text-2xl font-light mb-1">+</span></div>
                   <div className="absolute top-16 left-1/2 -translate-x-1/2 text-center w-[100px] opacity-60 text-xs font-bold uppercase tracking-widest">{t('sopHistory.newEntry') || 'New Entry'}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* EDITOR MODAL (Refined Glass) */}
      {popupIdx !== null && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setPopupIdx(null)} />
          <div 
            className={`relative w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden border flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200 ${isDark ? 'glass-card-dark' : 'glass-card-light'}`}
            style={{ 
              borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
              color: colors.text
            }}
          >
            <div 
              className="px-6 py-5 border-b flex justify-between items-center"
              style={{ borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }}
            >
              <h3 className="text-xl font-bold tracking-tight">
                {popupIdx === -1 ? (t('sopHistory.createNewMilestone') || 'Create New Milestone') : `${t('sopHistory.editMilestone') || 'Edit Milestone'}: ${fmtDateShort(history[popupIdx].changeDate)}`}
              </h3>
              <button 
                onClick={() => setPopupIdx(null)} 
                className="w-8 h-8 rounded-full flex items-center justify-center transition hover:bg-white/10"
              >✕</button>
            </div>

            <div 
              className="px-6 py-4 border-b"
              style={{ borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }}
            >
               <input 
                 type="text" 
                 placeholder={t('sopHistory.searchSops') || 'Search SOPs...'} 
                 className="w-full px-4 py-3 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 transition-colors"
                 style={{ 
                   backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.05)',
                   color: 'inherit',
                   border: 'none'
                 }}
                 value={popupSearch} 
                 onChange={e => setPopupSearch(e.target.value)} 
               />
               <div className="flex gap-4 mt-3 text-sm">
                 <button onClick={() => setPopupSelected(new Set(popupFiltered.map(s => s.sopNo)))} style={{ color: colors.indigo }} className="font-bold hover:underline">{t('sopHistory.selectAll') || 'Select All'}</button>
                 <button onClick={() => setPopupSelected(new Set())} className="font-bold opacity-60 hover:opacity-100 hover:underline">{t('sopHistory.deselectAll') || 'Deselect All'}</button>
                 <div className="ml-auto font-mono" style={{ color: colors.indigo }}>{t('sopHistory.selectedCount', { count: popupSelected.size }) || `${popupSelected.size} selected`}</div>
               </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-2 gap-2" style={{ backgroundColor: isDark ? 'transparent' : 'rgba(255,255,255,0.5)' }}>
               {loadingSops ? (
                 <div className="col-span-2 text-center py-10 opacity-50">{t('sopHistory.loadingMasterList') || 'Loading master list...'}</div>
               ) : popupFiltered.map(sop => {
                    const isActive = popupSelected.has(sop.sopNo);
                    return (
                      <div 
                        key={sop.sopNo} 
                        onClick={() => togglePopupSop(sop.sopNo)} 
                        className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${isActive ? 'shadow-md scale-[1.01]' : 'opacity-80 hover:opacity-100'}`}
                        style={{
                          backgroundColor: isActive 
                            ? (isDark ? 'rgba(10, 132, 255, 0.15)' : 'rgba(10, 132, 255, 0.08)')
                            : (isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.4)'),
                          borderColor: isActive ? colors.blue : 'transparent',
                        }}
                      >
                        <div 
                          className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${isActive ? 'text-white' : 'border-white/20'}`}
                          style={isActive ? { backgroundColor: colors.blue, borderColor: colors.blue } : {}}
                        >
                          {isActive && '✓'}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-bold font-mono" style={{ color: colors.blue }}>{sop.sopNo}</span>
                          <span className="text-sm truncate opacity-90">{sop.name}</span>
                        </div>
                      </div>
                   );
                 })}
            </div>

            <div 
              className="p-6 border-t flex gap-4 items-center"
              style={{ 
                borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.1)'
              }}
            >
               <input 
                 type="date" 
                 className="px-4 py-2 rounded-lg border outline-none"
                 style={{ 
                   backgroundColor: isDark ? 'rgba(0,0,0,0.5)' : '#fff',
                   color: 'inherit',
                   borderColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)',
                 }}
                 value={popupDate} 
                 onChange={e => setPopupDate(e.target.value)} 
                 min={popupIdx === -1 ? minNewDate : undefined}
               />
               {popupIdx !== -1 && (
                 <button 
                   onClick={() => handleDeleteGroup(history[popupIdx], fmtDateShort(history[popupIdx].changeDate))} 
                   className="px-4 py-2 text-red-500 hover:bg-red-500/10 rounded-lg transition font-bold uppercase tracking-wider text-xs"
                 >{t('sopHistory.deleteGroup') || 'Delete Group'}</button>
               )}
               <button 
                 onClick={handleSaveRequirements} 
                 disabled={saving} 
                 className="ml-auto px-8 py-3 text-white rounded-xl font-bold shadow-lg transition-transform active:scale-95 disabled:opacity-50 tracking-wide"
                 style={{ backgroundColor: colors.indigo }}
               >
                  {saving ? (t('sopHistory.saving') || 'SAVING...') : (t('sopHistory.saveChanges') || 'SAVE CHANGES')}
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
