'use client';

import { useState, useMemo } from 'react';
import type { ClinicalCase } from './types';
import { useTranslations } from 'next-intl';

type SortKey = 'caseNo' | 'caseId' | 'site' | 'caseDate' | 'status';
type SortDir = 'asc' | 'desc';

interface CaseListTableProps {
  cases: ClinicalCase[];
  loading: boolean;
  colors: Record<string, string>;
  onCaseClick: (c: ClinicalCase) => void;
}

const COLUMNS: { key: SortKey; tKey: string }[] = [
  { key: 'caseNo', tKey: 'p_valve.clinicalCase.columns.caseNo' },
  { key: 'caseId', tKey: 'p_valve.clinicalCase.columns.caseId' },
  { key: 'site', tKey: 'p_valve.clinicalCase.columns.site' },
  { key: 'caseDate', tKey: 'p_valve.clinicalCase.columns.date' },
  { key: 'status', tKey: 'p_valve.clinicalCase.columns.status' },
];

function getSortValue(c: ClinicalCase, key: SortKey): string {
  switch (key) {
    case 'caseNo': return c.caseNo || '';
    case 'caseId': return c.caseId || '';
    case 'site': return c.site?.siteName || c.siteId || '';
    case 'caseDate': return c.caseDate || '';
    case 'status': return c.status || '';
  }
}

export default function CaseListTable({ cases, loading, colors, onCaseClick }: CaseListTableProps) {
  const t = useTranslations('vma');
  const [sortKey, setSortKey] = useState<SortKey>('caseNo');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'caseDate' || key === 'caseNo' ? 'desc' : 'asc');
    }
  };

  // Natural sort for caseNo: "9" < "10" < "10a" < "10b" < "11"
  const naturalCompareCaseNo = (a: string, b: string): number => {
    const re = /^(\d+)(.*)/;
    const ma = re.exec(a);
    const mb = re.exec(b);
    if (ma && mb) {
      const numA = parseInt(ma[1], 10);
      const numB = parseInt(mb[1], 10);
      if (numA !== numB) return numA - numB;
      // Same number → compare suffix alphabetically
      const sa = ma[2].toLowerCase();
      const sb = mb[2].toLowerCase();
      return sa < sb ? -1 : sa > sb ? 1 : 0;
    }
    // Fallback: plain string compare
    return a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0;
  };

  const sorted = useMemo(() => {
    if (cases.length === 0) return cases;
    return [...cases].sort((a, b) => {
      let cmp: number;
      if (sortKey === 'caseNo') {
        cmp = naturalCompareCaseNo(getSortValue(a, sortKey), getSortValue(b, sortKey));
      } else {
        const va = getSortValue(a, sortKey).toLowerCase();
        const vb = getSortValue(b, sortKey).toLowerCase();
        cmp = va < vb ? -1 : va > vb ? 1 : 0;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [cases, sortKey, sortDir]);

  const arrow = (key: SortKey) => {
    if (sortKey !== key) return null;
    return (
      <span className="ml-1 text-[10px]" style={{ opacity: 0.7 }}>
        {sortDir === 'asc' ? '▲' : '▼'}
      </span>
    );
  };

  return (
    <div
      style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
      className="rounded-2xl border overflow-hidden"
    >
      <table className="w-full">
        <thead>
          <tr style={{ backgroundColor: colors.bgTertiary }}>
            {COLUMNS.map(col => (
              <th
                key={col.key}
                onClick={() => toggleSort(col.key)}
                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider cursor-pointer select-none transition-colors hover:opacity-70"
                style={{ color: sortKey === col.key ? colors.controlAccent : colors.textSecondary }}
              >
                {t(col.tKey)}{arrow(col.key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={5} className="px-4 py-16 text-center" style={{ color: colors.textTertiary }}>
                {t('p_valve.clinicalCase.loading')}
              </td>
            </tr>
          ) : sorted.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-16 text-center" style={{ color: colors.textTertiary }}>
                <div className="flex flex-col items-center gap-3">
                  <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={0.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                  </svg>
                  <p className="text-[15px] font-medium">{t('p_valve.clinicalCase.empty')}</p>
                  <p className="text-[13px]">{t('p_valve.clinicalCase.emptyHint')}</p>
                </div>
              </td>
            </tr>
          ) : (
            sorted.map((c) => (
              <tr
                key={c.caseId}
                onClick={() => onCaseClick(c)}
                className="cursor-pointer transition-colors hover:opacity-80"
                style={{ borderBottom: `1px solid ${colors.border}` }}
              >
                <td className="px-4 py-3 text-sm font-mono font-semibold" style={{ color: colors.controlAccent }}>{c.caseNo || '-'}</td>
                <td className="px-4 py-3 text-sm font-mono" style={{ color: colors.text }}>
                  {c.caseId}
                  {c.tripId && (
                    <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-semibold" style={{ backgroundColor: `${colors.purple || colors.controlAccent}20`, color: colors.purple || colors.controlAccent }}>
                      {t('p_valve.clinicalCase.columns.trip')}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm" style={{ color: colors.textSecondary }}>
                  {c.siteId}{c.site?.siteName ? ` - ${c.site.siteName}` : ''}
                </td>
                <td className="px-4 py-3 text-sm" style={{ color: colors.textSecondary }}>
                  {c.caseDate?.split('T')[0] || ''}
                </td>
                <td className="px-4 py-3">
                  <span
                    className="px-2.5 py-1 rounded-full text-[11px] font-semibold"
                    style={{
                      backgroundColor: c.status === 'COMPLETED' ? `${colors.green}26` : `${colors.orange}26`,
                      color: c.status === 'COMPLETED' ? colors.green : colors.orange,
                    }}
                  >
                    {c.status === 'COMPLETED' ? t('p_valve.clinicalCase.status.completed') : t('p_valve.clinicalCase.status.inProgress')}
                  </span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
