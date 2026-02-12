'use client';
import { VMA_API as API, getAuthHeaders } from '@/lib/vma-api';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createTimeline, animate } from 'animejs';
import { useModal } from '@/components/modal/GlobalModal';

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, { ...init, headers: { ...getAuthHeaders(), ...init?.headers } });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// Layout Constants
const CARD_W = 600;
const CARD_GAP = 160;
const SLOT_W = CARD_W + CARD_GAP;

interface Department {
  id: string;
  code: string;
  name: string;
  duties: string;
}

interface EmployeeDetail {
  id: string;
  employeeNo: string;
  firstName: string;
  lastName: string;
  hireDate: string;
  status: string;
  departmentAssignments: {
    id: string;
    department: Department;
    assignedAt: string;
    removedAt: string | null;
    isPrimary: boolean;
  }[];
}

interface HistoryGroup {
  date: string;
  events: {
    type: 'HIRED' | 'JOINED' | 'LEFT' | 'INFO' | 'STATUS';
    title: string;
    subtitle?: string;
    deptCode?: string;
    assignmentId?: string;
    fieldName?: 'assignedAt' | 'removedAt';
    meta?: any;
  }[];
}

export default function EmployeeCareerRoadmap({
  employee: initialEmployee,
  departments,
  colors,
  theme,
  t,
  onClose,
  onUpdate,
  onError,
  onSuccess,
}: {
  employee: { id: string; firstName: string; lastName: string; employeeNo: string; status: string };
  departments: Department[];
  colors: any;
  theme: string;
  t: any;
  onClose: () => void;
  onUpdate: () => void;
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
}) {
  const { showConfirm } = useModal();
  const [employee, setEmployee] = useState<EmployeeDetail | null>(null);
  const [history, setHistory] = useState<HistoryGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const [animated, setAnimated] = useState(false);

  // Editor State
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Create Mode
  const [actionType, setActionType] = useState<'ASSIGN' | 'REMOVE' | 'STATUS'>('ASSIGN');
  const [targetDeptId, setTargetDeptId] = useState('');
  const [targetAssignmentId, setTargetAssignmentId] = useState('');
  const [eventDate, setEventDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [newStatus, setNewStatus] = useState('INACTIVE');

  // Edit Mode (Past)
  const [editGroup, setEditGroup] = useState<HistoryGroup | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [updateDeptId, setUpdateDeptId] = useState('');

  // Drag State
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const fetchData = useCallback(async () => {
    try {
      const empData = await api<EmployeeDetail>(`/vma/employees/${initialEmployee.id}`);
      setEmployee(empData);

      const eventsMap = new Map<string, HistoryGroup['events']>();
      const addEvent = (date: string | null, evt: HistoryGroup['events'][0]) => {
        const d = date ? date.slice(0, 10) : 'Unknown';
        if (!eventsMap.has(d)) eventsMap.set(d, []);
        eventsMap.get(d)?.push(evt);
      };

      if (empData.hireDate) {
        addEvent(empData.hireDate, { type: 'HIRED', title: t('employees.career.joinedCompany') || 'Joined the Company', subtitle: `${t('employees.career.onboardedAs') || 'Onboarded as'} ${empData.employeeNo}` });
      }

      empData.departmentAssignments.forEach(asm => {
        addEvent(asm.assignedAt, {
          type: 'JOINED',
          title: `${t('employees.career.assignedDuty') || 'Assigned duty:'} ${asm.department.duties}`,
          subtitle: `${asm.department.code} - ${asm.department.name}`,
          deptCode: asm.department.code,
          assignmentId: asm.id,
          fieldName: 'assignedAt',
          meta: asm
        });

        if (asm.removedAt) {
          addEvent(asm.removedAt, {
            type: 'LEFT',
            title: `${t('employees.career.relievedFromDuty') || 'Relieved from duty:'} ${asm.department.duties}`,
            subtitle: `${t('employees.career.duration') || 'Duration:'} ${calculateDuration(asm.assignedAt, asm.removedAt)}`,
            deptCode: asm.department.code,
            assignmentId: asm.id,
            fieldName: 'removedAt',
            meta: asm
          });
        }
      });

      const sortedHistory = Array.from(eventsMap.entries())
        .map(([date, events]) => ({ date, events }))
        .sort((a, b) => {
             if (a.date === 'Unknown') return -1;
             if (b.date === 'Unknown') return 1;
             return new Date(a.date).getTime() - new Date(b.date).getTime();
        });

      setHistory(sortedHistory);
    } catch (e: any) {
      onError(e.message);
    } finally {
      setLoading(false);
    }
  }, [initialEmployee.id, onError]);

  useEffect(() => { fetchData(); }, [fetchData]);

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
      if (line) tl.add(line, { scaleX: [0, 1], duration: 800 });

      history.forEach((_, i) => {
        tl.add(`.ms-card-${i}`, { opacity: [0, 1], translateY: ['50px', '0px'], duration: 600 }, `<-=400`);
        tl.add(`.ms-node-${i}`, { scale: [0, 1], opacity: [0, 1], duration: 400 }, `<-=300`);
        tl.add(`.ms-date-${i}`, { opacity: [0, 1], translateY: [20, 0], duration: 400 }, `<-=200`);
      });
      
      tl.add('.ms-add-node', { scale: [0, 1], opacity: [0, 1], duration: 400 }, `<-=100`);

      setAnimated(true);
      setTimeout(() => { el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' }); }, 1500);
    } catch (e) { console.warn(e); }
  }, [loading, history.length, animated]);

  // Drag Handlers
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

  // === ACTIONS ===

  const openNewEditor = () => {
    setEditGroup(null);
    setEventDate(new Date().toISOString().slice(0, 10));
    setActionType('ASSIGN');
    setEditorOpen(true);
  };

  const openEditGroup = (group: HistoryGroup) => {
    setEditGroup(group);
    setEventDate(group.date);
    setEditingEventId(null);
    setEditorOpen(true);
  };

  const startEditEvent = (evt: HistoryGroup['events'][0]) => {
      if (evt.type === 'JOINED' && evt.assignmentId) {
          const originalAsm = employee?.departmentAssignments.find(a => a.id === evt.assignmentId);
          setUpdateDeptId(originalAsm?.department.id || '');
          setEditingEventId(evt.assignmentId);
      } else {
          onError(t('employees.career.alertOnlyAssigned') || "Only 'Assigned Duty' events can be modified to a different function.");
      }
  };

  const handleCreate = async () => {
    setSaving(true);
    try {
        if (actionType === 'ASSIGN') {
            if (!targetDeptId) throw new Error("Please select a department");
            await api(`/vma/employees/${initialEmployee.id}/departments`, { method: 'POST', body: JSON.stringify({ departmentId: targetDeptId, assignedAt: eventDate }) });
        } else if (actionType === 'REMOVE') {
            if (!targetAssignmentId) throw new Error("Please select an assignment to remove");
            await api(`/vma/employee-departments/${targetAssignmentId}/remove`, { method: 'PATCH', body: JSON.stringify({ removedAt: eventDate }) });
        } else if (actionType === 'STATUS') {
            await api(`/vma/employees/${initialEmployee.id}/toggle`, { method: 'PATCH', body: JSON.stringify({ status: newStatus, date: eventDate }) });
        }
        setEditorOpen(false);
        setAnimated(false);
        // onSuccess("Record updated successfully");
        onUpdate();
        fetchData();
    } catch (e: any) { onError(e.message); } 
    finally { setSaving(false); }
  };

  const handleUpdateEvent = async () => {
      if (!editingEventId || !updateDeptId) return;
      setSaving(true);
      try {
          await api(`/vma/employee-departments/${editingEventId}`, { method: 'PATCH', body: JSON.stringify({ departmentId: updateDeptId }) });
          setEditorOpen(false);
          setAnimated(false);
          // onSuccess("Record modified successfully");
          onUpdate();
          fetchData();
      } catch (e: any) { onError(e.message); }
      finally { setSaving(false); }
  };

  const calculateDuration = (start: string, end: string) => {
    const diff = new Date(end).getTime() - new Date(start).getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    return days + ' days';
  };
  const fmtDate = (d: string) => d === 'Unknown' ? 'Unknown' : new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' });
  const isDark = theme === 'dark';
  const cardBg = isDark ? 'rgba(30,30,45,0.85)' : 'rgba(255,255,255,0.85)';
  const cardBorder = `${colors.blue}4d`;

  const getEventColor = (type: string) => {
    switch (type) {
        case 'HIRED': return 'bg-emerald-500 text-white';
        case 'JOINED': return 'bg-blue-500 text-white';
        case 'LEFT': return 'bg-orange-500 text-white';
        case 'STATUS': return 'bg-purple-500 text-white';
        default: return 'bg-gray-500 text-white';
    }
  };
  const getEventIcon = (type: string) => {
      if (type === 'HIRED') return '★';
      if (type === 'JOINED') return '→';
      if (type === 'LEFT') return '✕'; 
      if (type === 'STATUS') return '⚠';
      return '•';
  };

  const activeAssignments = employee?.departmentAssignments.filter(a => !a.removedAt) || [];
  const canRemoveDuty = activeAssignments.length > 1;

  return (
    <div className="fixed inset-0 backdrop-blur-3xl flex flex-col z-[70] selection:bg-blue-500/30"
         style={{ backgroundColor: isDark ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.6)' }}>
         
      <style>{`
        @keyframes nodePulseEmp {
            0%, 100% { transform: scale(1); box-shadow: 0 0 4px 2px rgba(59,130,246,0.3); }
            50% { transform: scale(1.5); box-shadow: 0 0 30px 12px rgba(59,130,246,0.7); }
        }
        .pulse-node-emp { animation: nodePulseEmp 3s ease-in-out infinite; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
      `}</style>
      
      {/* HEADER */}
      <div className="absolute top-0 left-0 right-0 z-[80] px-12 py-8 flex items-start justify-between pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-4">
           {employee && (
               <>
                <h2 className="text-3xl font-bold tracking-tight drop-shadow-xl flex items-center gap-3" style={{ color: colors.text }}>
                    <span>{employee.firstName} {employee.lastName}</span>
                    <span className={`text-sm px-3 py-1 rounded-full font-medium ${employee.status === 'ACTIVE' ? 'bg-green-500/20 text-green-600' : 'bg-gray-500/20 text-gray-500'}`}>
                        {employee.status}
                    </span>
                </h2>
                <div className="text-lg opacity-60 mt-1 font-mono" style={{ color: colors.textSecondary }}>
                    #{employee.employeeNo} · Career Timeline
                </div>
               </>
           )}
        </div>
        <div className="pointer-events-auto">
            <button onClick={onClose} className="w-12 h-12 flex items-center justify-center rounded-full hover:bg-black/10 transition backdrop-blur-md border border-transparent hover:border-white/10" style={{ color: colors.text }}>
               <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
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
               <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
             </div>
        ) : (
            <div className="h-full flex items-center max-w-none" style={{ paddingLeft: '33vw', paddingRight: '10vw', width: 'max-content' }}>
                 <div className="relative pt-[10vh]" style={{ height: '70vh' }}>
                    
                    {/* CARDS */}
                    <div className="flex items-end mb-12">
                        {history.map((group, gi) => (
                             <div key={gi} className={`ms-card-${gi} flex-shrink-0 relative group opacity-0`}
                                  style={{ width: `${CARD_W}px`, marginRight: `${CARD_GAP}px`, marginBottom: '20px' }}>
                                <div className="w-full rounded-2xl overflow-hidden border transition-all duration-300 hover:shadow-2xl hover:-translate-y-2 cursor-default"
                                     style={{ 
                                         backgroundColor: cardBg,
                                         borderColor: cardBorder,
                                         boxShadow: '0 4px 20px -5px rgba(0,0,0,0.1)',
                                         height: '50vh'
                                     }}>
                                    
                                    <div className="px-6 py-4 border-b flex items-center justify-between bg-black/5" style={{ borderColor: cardBorder }}>
                                        <span className="font-bold text-xs uppercase tracking-widest opacity-60">
                                            {fmtDate(group.date)}
                                        </span>
                                        <button onClick={() => openEditGroup(group)} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 transition">EDIT ✎</button>
                                    </div>

                                    <div className="p-0 overflow-y-auto h-[calc(50vh-60px)]">
                                        {group.events.map((evt, ei) => (
                                            <div key={ei} className="px-6 py-5 border-b border-dashed border-gray-500/10 hover:bg-black/5 flex items-start gap-4">
                                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shadow-md text-xs font-bold ${getEventColor(evt.type)}`}>
                                                    {getEventIcon(evt.type)}
                                                </div>
                                                <div className="flex-1">
                                                    <div className="font-bold text-sm mb-0.5" style={{ color: colors.text }}>{evt.title}</div>
                                                    <div className="text-xs opacity-70" style={{ color: colors.textSecondary }}>{evt.subtitle}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                             </div>
                        ))}
                    </div>

                    {/* TIMELINE */}
                    <div className="absolute bottom-0 left-0 right-0 h-[80px]">
                         <div className="timeline-line absolute top-1/2 left-0 right-0 -translate-y-1/2 rounded-full"
                              style={{ 
                                  height: '8px', 
                                  background: `linear-gradient(90deg, ${colors.blue} 0%, ${colors.cyan || '#06b6d4'} 100%)`,
                                  transformOrigin: 'left center', 
                                  width: `${(history.length + 1) * SLOT_W}px` 
                              }} />
                         
                         {history.map((group, gi) => {
                             const cx = gi * SLOT_W + CARD_W / 2;
                             const isLatest = gi === history.length - 1;
                             return (
                                 <div key={gi} className="absolute top-1/2 left-0 -translate-y-1/2" style={{ transform: `translateX(${cx}px)` }}>
                                    <div className={`ms-node-${gi} relative w-8 h-8 -ml-4 flex items-center justify-center opacity-0`}>
                                        <div className={`w-5 h-5 rounded-full bg-white border-4 border-blue-500 shadow-lg z-10 ${isLatest ? 'pulse-node-emp' : ''}`} />
                                        <div className="absolute bottom-4 left-1/2 w-[2px] h-[60px] bg-blue-500/30 -ml-[1px]" />
                                    </div>
                                    <div className={`ms-date-${gi} absolute top-10 left-1/2 -translate-x-1/2 text-center w-[200px] opacity-0`}>
                                        <div className="text-sm font-bold" style={{ color: colors.text }}>{fmtDate(group.date)}</div>
                                    </div>
                                 </div>
                             );
                         })}

                        <div className="ms-add-node absolute top-1/2 left-0 -translate-y-1/2 opacity-0" 
                             style={{ transform: `translateX(${history.length * SLOT_W + CARD_W / 2}px)` }}>
                            <div onClick={openNewEditor}
                                 className="w-14 h-14 -ml-7 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-xl cursor-pointer hover:scale-110 hover:bg-blue-500 transition-all z-20">
                                <span className="text-3xl font-light mb-1">+</span>
                            </div>
                            <div className="absolute top-16 left-1/2 -translate-x-1/2 text-center w-[120px] opacity-60 text-xs font-bold uppercase tracking-widest text-blue-500">
                                New Event
                            </div>
                        </div>

                    </div>
                 </div>
            </div>
        )}
      </div>

      {/* EDITOR OVERLAY */}
      {editorOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setEditorOpen(false)} />
            <div className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-3xl shadow-2xl border border-blue-500/20 overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-8">
                    <h3 className="text-2xl font-bold mb-6 text-center">
                        {editGroup ? `${t('employees.career.modifyHistory') || 'Modify History'} - ${fmtDate(editGroup.date)}` : t('employees.career.planNewEvent') || 'Plan New Career Event'}
                    </h3>
                    
                    {!editGroup ? (
                        // CREATE MODE
                        <>
                            <div className="grid grid-cols-3 gap-3 mb-6">
                                <button onClick={() => setActionType('ASSIGN')} className={`py-3 rounded-xl text-sm font-bold border transition-all ${actionType === 'ASSIGN' ? 'bg-blue-500 text-white border-blue-500 shadow-lg' : 'bg-gray-100 dark:bg-white/5 border-transparent opacity-60'}`}>{t('employees.career.addDuty') || 'Add Duty +'}</button>
                                <button onClick={() => setActionType('REMOVE')} disabled={!canRemoveDuty}
                                        className={`py-3 rounded-xl text-sm font-bold border transition-all ${!canRemoveDuty ? 'opacity-30 cursor-not-allowed bg-gray-100' : actionType === 'REMOVE' ? 'bg-orange-500 text-white border-orange-500 shadow-lg' : 'bg-gray-100 dark:bg-white/5 border-transparent opacity-60'}`}>{t('employees.career.removeDuty') || 'Remove Duty -'}</button>
                                <button onClick={() => setActionType('STATUS')} className={`py-3 rounded-xl text-sm font-bold border transition-all ${actionType === 'STATUS' ? 'bg-purple-500 text-white border-purple-500 shadow-lg' : 'bg-gray-100 dark:bg-white/5 border-transparent opacity-60'}`}>{t('employees.career.terminateStatus') || 'Terminate / Status'}</button>
                            </div>

                            {!canRemoveDuty && actionType === 'REMOVE' && (
                                <div className="mb-4 p-3 rounded-xl bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-300 text-xs font-bold text-center">
                                    {t('employees.career.cannotRemoveLast') || 'Cannot remove the last duty. Use "Terminate" to end employment or add another duty first.'}
                                </div>
                            )}

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold uppercase opacity-50 mb-1">{t('employees.career.effectiveDate') || 'Effective Date'}</label>
                                    <input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-gray-100 dark:bg-white/5 border-none outline-none focus:ring-2 focus:ring-blue-500" />
                                </div>
                                {actionType === 'ASSIGN' && (
                                    <div>
                                        <label className="block text-xs font-bold uppercase opacity-50 mb-1">{t('employees.career.selectDepartment') || 'Select Department'}</label>
                                        <select value={targetDeptId} onChange={e => setTargetDeptId(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-gray-100 dark:bg-white/5 border-none outline-none focus:ring-2 focus:ring-blue-500">
                                            <option value="">{t('employees.career.selectPlaceholder') || 'Select...'}</option>
                                            {departments.map(d => (<option key={d.id} value={d.id}>{d.code} - {d.duties}</option>))}
                                        </select>
                                    </div>
                                )}
                                {actionType === 'REMOVE' && canRemoveDuty && (
                                    <div>
                                        <label className="block text-xs font-bold uppercase opacity-50 mb-1">{t('employees.career.selectAssignmentEnd') || 'Select Assignment to End'}</label>
                                        <select value={targetAssignmentId} onChange={e => setTargetAssignmentId(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-gray-100 dark:bg-white/5 border-none outline-none focus:ring-2 focus:ring-orange-500">
                                            <option value="">{t('employees.career.selectPlaceholder') || 'Select...'}</option>
                                            {activeAssignments.map(asm => (<option key={asm.id} value={asm.id}>{asm.department.duties} ({t('employees.career.assigned') || 'Assigned'}: {fmtDate(asm.assignedAt)})</option>))}
                                        </select>
                                    </div>
                                )}
                                {actionType === 'STATUS' && (
                                     <div>
                                        <label className="block text-xs font-bold uppercase opacity-50 mb-1">{t('employees.career.newStatus') || 'New Status'}</label>
                                        <select value={newStatus} onChange={e => setNewStatus(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-gray-100 dark:bg-white/5 border-none outline-none focus:ring-2 focus:ring-purple-500">
                                            <option value="ACTIVE">{t('employees.career.statusActive') || 'Active'}</option>
                                            <option value="INACTIVE">{t('employees.career.statusInactive') || 'Inactive (Terminated)'}</option>
                                            <option value="LEAVE">{t('employees.career.statusLeave') || 'Leave of Absence'}</option>
                                        </select>
                                    </div>
                                )}
                            </div>
                            <div className="mt-8">
                                <button onClick={handleCreate} disabled={saving || (!canRemoveDuty && actionType === 'REMOVE')} className="w-full py-4 rounded-xl font-bold text-lg text-white shadow-xl transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed" style={{ backgroundColor: actionType === 'ASSIGN' ? colors.blue : actionType === 'REMOVE' ? colors.orange : colors.indigo }}>{saving ? (t('employees.career.processing') || 'Processing...') : (t('employees.career.confirmPlan') || 'Confirm Plan')}</button>
                            </div>
                        </>
                    ) : (
                        // EDIT MODE
                        <div className="space-y-4">
                             {editGroup.events.map((evt, i) => (
                                 <div key={i} className="p-4 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/10">
                                     <div className="flex justify-between items-start mb-2">
                                         <div>
                                             <div className="font-bold text-sm">{evt.title}</div>
                                             <div className="text-xs opacity-60">{evt.subtitle}</div>
                                         </div>
                                         {evt.type === 'JOINED' && evt.assignmentId && editingEventId !== evt.assignmentId && (
                                             <button onClick={() => startEditEvent(evt)} className="px-3 py-1.5 bg-blue-500/10 text-blue-500 text-xs font-bold rounded-lg hover:bg-blue-500 hover:text-white transition">{t('employees.career.changeDuty') || 'Change Duty'}</button>
                                         )}
                                     </div>
                                     {editingEventId === evt.assignmentId && (
                                         <div className="mt-3 pt-3 border-t border-dashed border-gray-500/20 animate-in slide-in-from-top-2">
                                              <label className="block text-xs font-bold uppercase opacity-50 mb-1">{t('employees.career.changeTo') || 'Change To:'}</label>
                                              <div className="flex gap-2">
                                                  <select value={updateDeptId} onChange={e => setUpdateDeptId(e.target.value)} className="flex-1 px-3 py-2 rounded-lg bg-white dark:bg-black/20 border border-gray-200 dark:border-white/10 text-sm">
                                                      {departments.map(d => (<option key={d.id} value={d.id}>{d.code} - {d.duties}</option>))}
                                                  </select>
                                                  <button onClick={handleUpdateEvent} disabled={saving} className="px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700">{t('employees.career.save') || 'Save'}</button>
                                                  <button onClick={() => setEditingEventId(null)} className="px-4 py-2 bg-gray-200 dark:bg-white/10 text-sm font-bold rounded-lg hover:opacity-70">{t('employees.career.cancel') || 'Cancel'}</button>
                                              </div>
                                              <div className="mt-2 text-[10px] text-orange-500 font-medium">{t('employees.career.historyAdjustment') || '* History adjustment: This will update the official record for this date.'}</div>
                                         </div>
                                     )}
                                 </div>
                             ))}
                             <div className="mt-6 text-xs text-center opacity-40 px-8">{t('employees.career.cannotDeleteHistory') || 'Historical records cannot be deleted. You may correct the duty assignment.'}</div>
                        </div>
                    )}
                    <button onClick={() => setEditorOpen(false)} className="w-full mt-4 py-3 text-sm font-bold opacity-40 hover:opacity-100 transition">{t('trainingSop.close') || 'CLOSE'}</button>
                </div>
            </div>
          </div>
      )}

    </div>
  );
}
