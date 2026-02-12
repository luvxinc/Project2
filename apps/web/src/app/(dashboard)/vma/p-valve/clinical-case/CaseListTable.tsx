'use client';

import type { ClinicalCase } from './types';

interface CaseListTableProps {
  cases: ClinicalCase[];
  loading: boolean;
  colors: Record<string, string>;
  onCaseClick: (c: ClinicalCase) => void;
}

export default function CaseListTable({ cases, loading, colors, onCaseClick }: CaseListTableProps) {
  return (
    <div
      style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
      className="rounded-2xl border overflow-hidden"
    >
      <table className="w-full">
        <thead>
          <tr style={{ backgroundColor: colors.bgTertiary }}>
            {['Case #', 'Case ID', 'Site', 'Date', 'Status'].map((col) => (
              <th
                key={col}
                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                style={{ color: colors.textSecondary }}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={5} className="px-4 py-16 text-center" style={{ color: colors.textTertiary }}>
                Loading...
              </td>
            </tr>
          ) : cases.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-16 text-center" style={{ color: colors.textTertiary }}>
                <div className="flex flex-col items-center gap-3">
                  <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={0.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                  </svg>
                  <p className="text-[15px] font-medium">No clinical cases recorded yet</p>
                  <p className="text-[13px]">Create a new clinical case to start tracking</p>
                </div>
              </td>
            </tr>
          ) : (
            cases.map((c) => (
              <tr
                key={c.caseId}
                onClick={() => onCaseClick(c)}
                className="cursor-pointer transition-colors hover:opacity-80"
                style={{ borderBottom: `1px solid ${colors.border}` }}
              >
                <td className="px-4 py-3 text-sm font-mono font-semibold" style={{ color: colors.controlAccent }}>{c.caseNo || '-'}</td>
                <td className="px-4 py-3 text-sm font-mono" style={{ color: colors.text }}>{c.caseId}</td>
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
                    {c.status === 'COMPLETED' ? 'Completed' : 'In Progress'}
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
