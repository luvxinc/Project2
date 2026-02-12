'use client';
import { VMA_API as API, getAuthHeaders } from '@/lib/vma-api';

import { useEffect, useState, useRef } from 'react';
import { createTimeline } from 'animejs';

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, { ...init, headers: { ...getAuthHeaders(), ...init?.headers } });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// Layout Constants
const CARD_W = 350;
const CARD_GAP = 120;
const SLOT_W = CARD_W + CARD_GAP;

interface SopChange {
  sopNo: string;
  sopName: string;
  version: string;
  daNo?: string;
  effectiveDate: string;
}

interface RoadmapMilestone {
  date: string;
  changeType: 'INITIAL' | 'UPDATE';
  sopChanges: SopChange[];
  summary: {
    totalEmployees: number;
    compliant: number;
    nonCompliant: number;
    totalRequired: number;
    totalCompleted: number;
    completionRate: number;
  };
  topNonCompliant: {
    employeeNo: string;
    name: string;
    required: number;
    completed: number;
    missing: number;
    compliant: boolean;
    missingSops: string[];
  }[];
}

const DA_COLORS = [
    '#0A84FF', // Apple Blue (Neon)
    '#BF5AF2', // Apple Purple
    '#32D74B', // Apple Green
    '#FF9F0A', // Apple Orange
    '#FF375F', // Apple Pink
    '#64D2FF', // Apple Cyan
    '#FFD60A', // Apple Yellow
    '#5E5CE6', // Apple Indigo
];

export default function TrainingMatrixRoadmap({
  colors,
  theme,
  t,
  onClose,
}: {
  colors: any;
  theme: string;
  t: any;
  onClose?: () => void;
}) {
  const [milestones, setMilestones] = useState<RoadmapMilestone[]>([]);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const [animated, setAnimated] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await api<{ milestones: RoadmapMilestone[] }>('/vma/training-records/roadmap');
        setMilestones(data.milestones || []);
      } catch (e: any) {
        console.error('Failed to load roadmap:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (loading || milestones.length === 0 || animated) return;
    const el = containerRef.current;
    if (!el) return;

    try {
      const tl = createTimeline({
        playbackEase: 'inOut(3)',
        defaults: { duration: 900, ease: 'out(3)' },
      });
      
      milestones.forEach((_, i) => {
         tl.add(`.rm-node-${i}`, { scale: [0, 1], opacity: [0, 1], duration: 500 }, i === 0 ? '+=200' : '-=100');
         tl.add(`.rm-card-${i}`, { opacity: [0, 1], translateY: ['50px', '0px'], duration: 700 }, '-=400');
         if (i < milestones.length - 1) {
             tl.add(`.rm-line-${i}`, { scaleX: [0, 1], opacity: [0, 1], duration: 600, easing: 'easeOutQuad' }, '-=300');
         }
      });

      setAnimated(true);
    } catch (e) { console.warn(e); }
  }, [loading, milestones.length, animated]);

  // Drag Handlers
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  
  const onMouseDown = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    setIsDragging(true);
    setStartX(e.pageX - containerRef.current.offsetLeft);
    setScrollLeft(containerRef.current.scrollLeft);
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !containerRef.current) return;
    e.preventDefault();
    const x = e.pageX - containerRef.current.offsetLeft;
    const walk = (x - startX) * 1.5;
    containerRef.current.scrollLeft = scrollLeft - walk;
  };
  const onMouseUp = () => setIsDragging(false);
  const onMouseLeave = () => setIsDragging(false);

  // Helper colors
  const isDark = theme === 'dark';

  const getDaColor = (milestone: RoadmapMilestone) => {
      const da = milestone.sopChanges.find(c => c.daNo)?.daNo;
      if (!da) return '#8e8e93'; 
      let hash = 0;
      for (let i = 0; i < da.length; i++) hash = da.charCodeAt(i) + ((hash << 5) - hash);
      return DA_COLORS[Math.abs(hash) % DA_COLORS.length];
  };

  const getDaLabel = (milestone: RoadmapMilestone) => {
      const da = milestone.sopChanges.find(c => c.daNo)?.daNo;
      return da || t('trainingMatrix.baseline') || 'BASELINE';
  };

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' });

  return (
    <div className="fixed inset-0 backdrop-blur-3xl flex flex-col z-[70] selection:bg-blue-500/30"
         style={{ backgroundColor: isDark ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.6)' }}>
         
      <style>{`
        @keyframes nodePulseRm {
            0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255,255,255,0.4); }
            70% { transform: scale(1.1); box-shadow: 0 0 0 10px rgba(255,255,255,0); }
            100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255,255,255,0); }
        }
        .pulse-node-rm { animation: nodePulseRm 2s infinite; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
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
      <div className="absolute top-0 left-0 right-0 z-[80] px-12 py-8 flex items-start justify-between pointer-events-none">
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
                {t('training.roadmap.title') || 'Compliance Roadmap'}
            </h2>
            <div className="text-lg opacity-80 mt-2 font-medium tracking-wide" style={{ color: isDark ? '#d4d4d8' : '#52525b' }}>
               {t('training.roadmap.subtitle') || 'Training compliance snapshots at each SOP change event'}
            </div>
        </div>
        <div className="pointer-events-auto">
            <button onClick={onClose} className="w-12 h-12 flex items-center justify-center rounded-full hover:bg-white/10 transition backdrop-blur-md border border-white/10 group">
               <svg className="w-6 h-6 transition-transform group-hover:rotate-90" fill="none" stroke={isDark ? '#fff' : '#000'} viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
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
             <div className="h-full w-full flex items-center justify-center">
               <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
             </div>
        ) : (
            <div className="h-full flex items-center max-w-none" style={{ paddingLeft: '5vw', paddingRight: '10vw', width: 'max-content' }}>
                 <div className="relative pt-[12vh]" style={{ height: '70vh' }}>
                    
                    {/* CARDS */}
                    <div className="flex items-end mb-20">
                        {milestones.map((ms, i) => {
                             const daColor = getDaColor(ms);
                             const isSelected = selectedIdx === i;
                             const pendingCount = ms.summary.nonCompliant;
                             
                             return (
                             <div key={i} className={`rm-card-${i} flex-shrink-0 relative group opacity-0`}
                                  style={{ width: `${CARD_W}px`, marginRight: `${CARD_GAP}px`, marginBottom: '20px' }}>
                                
                                {/* DA LABEL (Floating Badge) */}
                                <div className="absolute -top-3 left-6 z-20 shadow-lg shadow-black/20">
                                    <span className="text-[11px] font-bold px-3 py-1 rounded-full uppercase tracking-wider border border-white/10 backdrop-blur-md"
                                          style={{ backgroundColor: daColor, color: '#000' }}>
                                        {getDaLabel(ms)}
                                    </span>
                                </div>

                                <div className={`w-full rounded-[24px] overflow-hidden transition-all duration-300 hover:-translate-y-2 cursor-pointer ${isDark ? 'glass-card-dark' : 'glass-card-light'}`}
                                     onClick={() => setSelectedIdx(isSelected ? null : i)}
                                     style={{ 
                                         borderColor: isSelected ? daColor : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'),
                                         boxShadow: isSelected ? `0 0 40px -10px ${daColor}80` : undefined, // Neon Glow
                                         height: '45vh',
                                         transform: isSelected ? 'scale(1.02)' : 'scale(1)',
                                         color: isDark ? '#fff' : '#000'
                                     }}>
                                    
                                    <div className="px-6 py-6 border-b flex items-start justify-between" 
                                         style={{ 
                                             borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                                             background: isDark ? 'linear-gradient(to bottom, rgba(255,255,255,0.05), rgba(255,255,255,0))' : 'rgba(255,255,255,0.5)'
                                         }}>
                                        <div className="flex flex-col pt-1">
                                           <div className="font-bold text-2xl tracking-tight leading-none mb-1">
                                               {fmtDate(ms.date).split(',')[0]} {/* Month Day */}
                                           </div>
                                           <div className="text-sm opacity-60 font-medium tracking-wide">
                                               {fmtDate(ms.date).split(',')[1]} {/* Year */}
                                           </div>
                                        </div>
                                        
                                        {/* Donut Chart / Percentage */}
                                        <div className="relative w-16 h-16 flex items-center justify-center">
                                            <svg className="w-full h-full transform -rotate-90">
                                              <circle cx="32" cy="32" r="28" stroke={isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"} strokeWidth="6" fill="none" />
                                              <circle cx="32" cy="32" r="28" stroke={daColor} strokeWidth="6" fill="none"
                                                      strokeDasharray={175.9}
                                                      strokeDashoffset={175.9 - (175.9 * ms.summary.completionRate) / 100}
                                                      strokeLinecap="round" />
                                            </svg>
                                            <div className="absolute inset-0 flex items-center justify-center text-[13px] font-bold">
                                              {ms.summary.completionRate}%
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-6 h-[calc(45vh-90px)] overflow-y-auto no-scrollbar">
                                        
                                        {/* Non Compliant Section (Dopamine Highlight) */}
                                        {pendingCount > 0 ? (
                                            <div className="mb-5 animate-in slide-in-from-bottom-2 fade-in duration-500">
                                                <div className="flex items-center justify-between mb-3">
                                                   <div className="text-xs font-bold text-red-500 mb-0 uppercase tracking-widest flex items-center gap-2">
                                                      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                                                      {t('trainingMatrix.pendingAction') || 'Action Required'}
                                                   </div>
                                                   <span className="text-xs font-mono font-bold bg-red-500/20 text-red-500 px-2 py-0.5 rounded text-end">{pendingCount}</span>
                                                </div>
                                                
                                                <div className="space-y-2">
                                                    {ms.topNonCompliant.slice(0, 4).map((emp, ei) => (
                                                        <div key={ei} className="flex justify-between items-center text-xs p-2.5 rounded-lg transition border"
                                                             style={{ 
                                                               backgroundColor: 'rgba(255, 69, 58, 0.1)', // Red tint
                                                               borderColor: 'rgba(255, 69, 58, 0.2)' 
                                                             }}>
                                                            <div className="font-semibold flex items-center gap-2">
                                                              <div className="w-5 h-5 rounded bg-red-500/20 flex items-center justify-center text-[9px] font-bold text-red-500">
                                                                {emp.name.charAt(0)}
                                                              </div>
                                                              {emp.name}
                                                            </div>
                                                            <div className="text-red-500 font-bold">{emp.missing} missing</div>
                                                        </div>
                                                    ))}
                                                    {ms.topNonCompliant.length > 4 && (
                                                        <button className="w-full py-1 text-[10px] text-center opacity-50 hover:opacity-100 transition uppercase tracking-widest font-bold">
                                                          View All {ms.topNonCompliant.length} Pending
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="mb-5 p-4 rounded-xl border border-green-500/20 bg-green-500/5 flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center text-black shadow-lg shadow-green-500/40 text-xl">✓</div>
                                                <div>
                                                  <div className="text-sm font-bold text-green-500 uppercase tracking-wide">System Compliant</div>
                                                  <div className="text-[10px] opacity-70">All training records verified</div>
                                                </div>
                                            </div>
                                        )}
                                        
                                        {/* Triggers (SOPs) */}
                                        <div className="pt-4 border-t border-dashed" style={{ borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}>
                                            <div className="text-[10px] font-bold opacity-40 mb-2 uppercase tracking-widest">{t('trainingMatrix.triggers') || 'Trigger Event'}</div>
                                            <div className="flex flex-wrap gap-2">
                                                {ms.sopChanges.map((sc, sci) => (
                                                    <span key={sci} className="text-[10px] px-2.5 py-1 rounded-md border font-mono font-medium transition-colors hover:bg-white/5" 
                                                          style={{ borderColor: `${daColor}50`, color: daColor }}>
                                                        {sc.sopNo} <span className="opacity-50">v{sc.version}</span>
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                             </div>
                        );
                        })}
                    </div>

                    {/* TIMELINE AXIS (Neon Style) */}
                    <div className="absolute bottom-0 left-0 right-0 h-[100px] pointer-events-none">
                         {milestones.map((ms, i) => {
                             const daColor = getDaColor(ms);
                             const cx = i * SLOT_W + CARD_W / 2;
                             const hasNext = i < milestones.length - 1;
                             const nextColor = hasNext ? getDaColor(milestones[i+1]) : daColor;
                             
                             return (
                                 <div key={i} className="absolute top-1/2 left-0 -translate-y-1/2" style={{ transform: `translateX(${cx}px)` }}>
                                    {/* Line to next */}
                                    {hasNext && (
                                        <div className={`rm-line-${i} absolute top-1/2 left-0 h-[2px] opacity-0 origin-left shadow-[0_0_10px_rgba(255,255,255,0.3)]`}
                                             style={{ 
                                                 width: `${SLOT_W}px`, 
                                                 background: `linear-gradient(90deg, ${daColor}, ${nextColor})`,
                                                 zIndex: 0
                                             }} />
                                    )}

                                    {/* Node */}
                                    <div className={`rm-node-${i} relative flex flex-col items-center opacity-0 z-10 pointer-events-auto`}>
                                        <div className={`w-5 h-5 rounded-full border-[3px] shadow-[0_0_20px_5px_rgba(255,255,255,0.2)] z-20 transition-transform duration-300 hover:scale-150 ${i===milestones.length-1 ? 'pulse-node-rm' : ''}`}
                                             style={{ 
                                                 borderColor: daColor, 
                                                 backgroundColor: isDark ? '#000' : '#fff',
                                                 boxShadow: `0 0 15px ${daColor}`
                                             }} />
                                        
                                        {/* Vertical Connector */}
                                        <div className="absolute bottom-full mb-0 w-[1px] h-[70px]" 
                                             style={{ 
                                                 background: `linear-gradient(to top, ${daColor}, transparent)`, 
                                                 opacity: 0.6 
                                             }} />
                                    </div>
                                 </div>
                             );
                         })}
                    </div>
                 </div>
            </div>
        )}
      </div>
    </div>
  );
}
