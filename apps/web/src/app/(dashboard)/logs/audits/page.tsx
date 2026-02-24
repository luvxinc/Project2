'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { logsApi, AuditLog, LogQueryParams } from '@/lib/api/logs';
import { LogTable, auditLogColumns, LogTypeSelector } from '../components';

export default function AuditLogsPage() {
  const t = useTranslations('logs');
  const { theme } = useTheme();
  const colors = themeColors[theme];
  
  const [audits, setAudits] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFilters] = useState<LogQueryParams>({ pageSize: 15 });

  const fetchAudits = useCallback(async () => {
    try {
      setLoading(true);
      const result = await logsApi.getAudits({ ...filters, page });
      setAudits(result.items);
      setTotalPages(result.totalPages);
    } catch (error) {
      console.error('Failed to fetch audits:', error);
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    fetchAudits();
  }, [fetchAudits]);

  return (
    <div style={{ backgroundColor: colors.bg }} className="min-h-screen">
      {/* Apple 风格 Header + Tab Selector */}
      <section className="pt-12 pb-6 px-6">
        <div className="max-w-[1200px] mx-auto">
          <LogTypeSelector />
        </div>
      </section>

      {/* Filters */}
      <section className="px-6 pb-4">
        <div className="max-w-[1200px] mx-auto">
          <div 
            className="rounded-xl p-4 flex flex-wrap gap-3 items-center"
            style={{ backgroundColor: colors.bgSecondary, border: `1px solid ${colors.border}` }}
          >
            {/* Module Filter */}
            <select
              value={filters.module || ''}
              onChange={(e) => setFilters(prev => ({ ...prev, module: e.target.value || undefined }))}
              className="h-9 px-3 rounded-lg text-[13px]"
              style={{ backgroundColor: colors.bgTertiary, color: colors.text, border: `1px solid ${colors.border}` }}
            >
              <option value="">All Modules</option>
              <option value="auth">Auth</option>
              <option value="users">Users</option>
              <option value="roles">Roles</option>
              <option value="security">Security</option>
              <option value="logs">Logs</option>
            </select>

            {/* Risk Level Filter */}
            <select
              value={filters.riskLevel || ''}
              onChange={(e) => setFilters(prev => ({ ...prev, riskLevel: e.target.value || undefined }))}
              className="h-9 px-3 rounded-lg text-[13px]"
              style={{ backgroundColor: colors.bgTertiary, color: colors.text, border: `1px solid ${colors.border}` }}
            >
              <option value="">All Risk Levels</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>

            {/* Search */}
            <input
              type="text"
              placeholder={t('audits.filters.search')}
              value={filters.search || ''}
              onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value || undefined }))}
              className="flex-1 min-w-[200px] h-9 px-3 rounded-lg text-[13px]"
              style={{ backgroundColor: colors.bgTertiary, color: colors.text, border: `1px solid ${colors.border}` }}
            />
          </div>
        </div>
      </section>

      {/* Table */}
      <section className="px-6 pb-16">
        <div className="max-w-[1200px] mx-auto">
          <LogTable
            logType="audit"
            columns={auditLogColumns}
            data={audits as unknown as Record<string, unknown>[]}
            loading={loading}
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            emptyMessage={t('audits.empty')}
          />
        </div>
      </section>
    </div>
  );
}
