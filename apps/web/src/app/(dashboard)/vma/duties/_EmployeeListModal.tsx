'use client';
import { VMA_API as API, getAuthHeaders } from '@/lib/vma-api';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createTimeline, animate } from 'animejs';
import { useModal } from '@/components/modal/GlobalModal';
import EmployeeTimelineModal from './_EmployeeTimelineModal';

/* ───── Layout constants ───── */
const CARD_W = 450;           // Compact but wide enough for employee details
const CARD_GAP = 120;         
const SLOT_W = CARD_W + CARD_GAP; 

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
}

interface Employee {
  id: string;
  employeeNo: string;
  firstName: string;
  lastName: string;
  hireDate: string; // ISO date
  status: string; // ACTIVE, INACTIVE, LEAVE
  departmentAssignments: {
    id: string;
    department: { code: string; name: string };
    isPrimary: boolean;
  }[];
}

interface EmployeeGroup {
  date: string; // Hire Date
  employees: Employee[];
}

export default function EmployeeListModal({
  department,
  colors,
  theme,
  t,
  onClose,
  onEditEmployee, // Optional callback if we want to edit from here
}: {
  department: Department;
  colors: any;
  theme: string;
  t: any;
  onClose: () => void;
  onEditEmployee?: (emp: Employee) => void;
}) {
  // ===== State =====
  const [groups, setGroups] = useState<EmployeeGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const [animated, setAnimated] = useState(false);
  
  // Drag to scroll
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  // Selected Employee for Timeline Modal
  const [selectedEmpId, setSelectedEmpId] = useState<string | null>(null);

  const fetchEmployees = useCallback(async () => {
    try {
      // Assuming API supports filtering by departmentId
      const data = await api<Employee[]>(`/vma/employees?departmentId=${department.id}`);
      
      // Group by hireDate
      const grouped = new Map<string, Employee[]>();
      data.forEach(emp => {
        const date = emp.hireDate ? emp.hireDate.slice(0, 10) : 'Unknown';
        if (!grouped.has(date)) grouped.set(date, []);
        grouped.get(date)?.push(emp);
      });

      // Sort groups by date
      const sorted = Array.from(grouped.entries())
        .map(([date, employees]) => ({ date, employees }))
        .sort((a, b) => {
             if (a.date === 'Unknown') return -1;
             if (b.date === 'Unknown') return 1;
             return new Date(a.date).getTime() - new Date(b.date).getTime();
        });

      setGroups(sorted);
    } catch (e: any) {
      console.error('Failed to load employees:', e);
    } finally {
      setLoading(false);
    }
  }, [department.id]);

  useEffect(() => { fetchEmployees(); }, [fetchEmployees]);

  const fmtDateShort = (d: string) => {
    if (d === 'Unknown') return t('employees.career.legacyUnknown') || 'Legacy / Unknown';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' });
  };

  const getInitials = (emp: Employee) => 
    `${emp.firstName?.[0] || ''}${emp.lastName?.[0] || ''}`.toUpperCase();

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

  // ===== Animation =====
  useEffect(() => {
    if (loading || groups.length === 0 || animated) return;
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

        groups.forEach((_g, i) => {
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

        setAnimated(true);
        
        // Auto-scroll to end after animation
        const totalDuration = 800 + groups.length * 200 + 400;
        setTimeout(() => {
           el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' });
        }, totalDuration);
        
    } catch(e) {
        console.warn("Animation failed", e);
    }
  }, [loading, groups.length, animated]);

  // Styles
  const isDark = theme === 'dark';
  const cardBg = isDark ? 'rgba(30,30,45,0.85)' : 'rgba(255,255,255,0.85)';
  const cardBorder = isDark ? 'rgba(59,130,246,0.3)' : 'rgba(59,130,246,0.2)'; // Blue for employees
  const accentColor = '#3b82f6'; // Blue

  // Last group index for highlighting
  const latestGroupIdx = groups.length - 1;

  return (
    <div className="fixed inset-0 backdrop-blur-3xl flex flex-col z-50 selection:bg-blue-500/30" 
         style={{ backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.4)' }}>
      
      <style>{`
        @keyframes nodePulseBlue {
          0%, 100% { transform: scale(1); box-shadow: 0 0 4px 2px rgba(59,130,246,0.3); }
          50% { transform: scale(1.5); box-shadow: 0 0 30px 12px rgba(59,130,246,0.7); }
        }
        .pulse-node-blue { animation: nodePulseBlue 3s ease-in-out infinite; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* HEADER */}
      <div className="absolute top-0 left-0 right-0 z-[60] px-12 py-8 flex items-start justify-between pointer-events-none">
        <div className="pointer-events-auto">
          <h2 className="text-3xl font-bold tracking-tight drop-shadow-xl" style={{ color: isDark ? '#fff' : '#1f2937' }}>
             {/* Dynamic Title based on translation keys if available, else fallback */}
             {t('employees.career.employeesTimeline') || 'Employees Timeline'}
          </h2>
          <div className="flex items-center gap-3 mt-2">
            <span className="text-lg font-medium opacity-80" style={{ color: isDark ? '#ddd' : '#4b5563' }}>{department.code}</span>
            <div className="h-1 w-1 rounded-full bg-blue-500/50" />
            <span className="text-lg opacity-60" style={{ color: isDark ? '#bbb' : '#6b7280' }}>
              {department.duties}
            </span>
          </div>
        </div>
        
        <div className="pointer-events-auto">
          <button onClick={onClose}
            className="w-12 h-12 flex items-center justify-center rounded-full hover:bg-black/10 transition backdrop-blur-md border border-transparent hover:border-white/10"
            style={{ color: isDark ? '#fff' : '#000' }}>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* DRAGGABLE TIMELINE CONTAINER */}
      <div 
        ref={containerRef}
        className="flex-1 w-full overflow-x-auto no-scrollbar cursor-grab active:cursor-grabbing relative"
        onMouseDown={onMouseDown} onMouseLeave={onMouseLeave} onMouseUp={onMouseUp} onMouseMove={onMouseMove}
      >
        {loading ? (
          <div className="h-full w-full flex items-center justify-center">
            <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : groups.length === 0 ? (
          <div className="h-full w-full flex flex-col items-center justify-center gap-6">
            <div className="text-xl font-medium opacity-50">{t('employees.career.noEmployeesInDept') || 'No employees found in this department'}</div>
          </div>
        ) : (
          <div className="h-full flex items-center min-w-max" style={{ paddingLeft: '33vw', paddingRight: '10vw' }}>
            <div className="relative pt-[10vh]" style={{ height: '70vh' }}>
              
              {/* 1. CARDS (Above Line) */}
              <div className="flex items-end mb-12">
                {groups.map((group, gi) => {
                  const isLatest = gi === latestGroupIdx;
                  return (
                    <div key={gi}
                      className={`ms-card-${gi} flex-shrink-0 relative group opacity-0`} // Default hidden via Tailwind
                      style={{ 
                        width: `${CARD_W}px`, 
                        marginRight: `${CARD_GAP}px`,
                        marginBottom: '20px'
                      }}>
                      {/* Card Body */}
                      <div className="w-full rounded-2xl overflow-hidden border transition-all duration-300 hover:shadow-2xl hover:-translate-y-2 cursor-default"
                         style={{ 
                           backgroundColor: cardBg,
                           borderColor: isLatest ? 'rgba(59,130,246,0.5)' : cardBorder,
                           boxShadow: isLatest ? '0 10px 40px -10px rgba(59,130,246,0.3)' : '0 4px 20px -5px rgba(0,0,0,0.1)',
                           height: '50vh'
                         }}>
                        
                        {/* Header: Date / Count */}
                        <div className="px-6 py-4 border-b flex items-center justify-between bg-black/5"
                             style={{ borderColor: cardBorder }}>
                          <span className="text-xs font-bold px-3 py-1.5 rounded-md tracking-wider bg-blue-500/10 text-blue-500 uppercase">
                             {t('employees.career.joined') || 'Joined'}
                          </span>
                          <span className="text-xs font-mono opacity-50">{group.employees.length} {t('employees.career.staff') || 'Staff'}</span>
                        </div>

                        {/* Scrolling Employee List */}
                        <div className="p-0 overflow-y-auto h-[calc(50vh-60px)]">
                          {group.employees.map((emp, ei) => (
                            <div key={emp.id} 
                                 onClick={() => setSelectedEmpId(emp.id)}
                                 className="px-5 py-4 border-b border-dashed border-gray-500/10 hover:bg-black/5 flex items-center gap-4 transition-colors cursor-pointer active:scale-[0.98]">
                              {/* Avatar / Initials */}
                              <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300">
                                {getInitials(emp)}
                              </div>
                              
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                   <span className="font-bold text-sm truncate" style={{ color: isDark ? '#fff' : '#111' }}>
                                     {emp.firstName} {emp.lastName}
                                   </span>
                                   <span className={`text-[10px] px-1.5 py-0.5 rounded ${emp.status === 'ACTIVE' ? 'bg-green-500/10 text-green-600' : 'bg-gray-500/10 text-gray-500'}`}>
                                     {emp.status === 'ACTIVE' ? (t('employees.status.active') || 'Active') : (t('employees.status.inactive') || 'Inactive')}
                                   </span>
                                </div>
                                <div className="text-xs font-mono opacity-60 mt-0.5 flex gap-2">
                                    <span>#{emp.employeeNo}</span>
                                    {emp.departmentAssignments.length > 1 && (
                                        <span className="text-blue-400">+{emp.departmentAssignments.length - 1} {t('employees.career.depts') || 'depts'}</span>
                                    )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 2. TIMELINE LINE & NODES */}
              <div className="absolute bottom-0 left-0 right-0 h-[80px]">
                {/* Thick Line - Blue Gradient */}
                <div className="timeline-line absolute top-1/2 left-0 right-0 -translate-y-1/2 rounded-full"
                     style={{ 
                       height: '8px', 
                       background: 'linear-gradient(90deg, #3b82f6 0%, #60a5fa 50%, #93c5fd 100%)',
                       transformOrigin: 'left center',
                       width: `${groups.length * SLOT_W + 200}px`
                     }} />

                {groups.map((group, gi) => {
                  const isLatest = gi === latestGroupIdx;
                  const cx = gi * SLOT_W + CARD_W / 2; 
                  return (
                    <div key={gi} className="absolute top-1/2 left-0 -translate-y-1/2" style={{ transform: `translateX(${cx}px)` }}>
                      {/* Node Circle */}
                      <div className={`ms-node-${gi} relative w-8 h-8 -ml-4 flex items-center justify-center cursor-pointer hover:scale-125 transition-transform duration-300 opacity-0`}>
                         <div className={`w-5 h-5 rounded-full bg-white border-4 border-blue-600 shadow-lg z-10 ${isLatest ? 'pulse-node-blue' : ''}`} />
                         {/* Connecting vertical line to card */}
                         <div className="absolute bottom-4 left-1/2 w-[2px] h-[60px] bg-blue-500/30 -ml-[1px]" />
                      </div>

                      {/* Date Label (Below) */}
                      <div className={`ms-date-${gi} absolute top-10 left-1/2 -translate-x-1/2 text-center w-[200px] opacity-0`}>
                        <div className="text-sm font-bold" style={{ color: isDark ? '#fff' : '#111' }}>
                          {fmtDateShort(group.date)}
                        </div>
                        <div className="text-xs opacity-50 mt-1 uppercase tracking-widest font-semibold">
                          {group.employees.length} {t('employees.career.joined') || 'Joined'}
                        </div>
                      </div>
                    </div>
                  );
                })}

              </div>
            </div>
          </div>
        )}
      </div>

      {/* Employee Timeline Modal (Details) */}
      {selectedEmpId && (
        <EmployeeTimelineModal
            employeeId={selectedEmpId}
            theme={theme}
            t={t}
            onClose={() => setSelectedEmpId(null)}
        />
      )}
    </div>
  );
}
