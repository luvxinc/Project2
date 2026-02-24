'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { logsApi, AccessLog, LogQueryParams } from '@/lib/api/logs';
import { LogTable, accessLogColumns, LogTypeSelector } from '../components';

export default function AccessLogsPage() {
  const t = useTranslations('logs');
  const { theme } = useTheme();
  const colors = themeColors[theme];
  
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFilters] = useState<LogQueryParams>({ pageSize: 20 });

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const result = await logsApi.getAccess({ ...filters, page });
      setLogs(result.items);
      setTotalPages(result.totalPages);
    } catch (error) {
      console.error('Failed to fetch access logs:', error);
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

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
            {/* Status Code Filter */}
            <select
              value={filters.statusCode || ''}
              onChange={(e) => setFilters(prev => ({ ...prev, statusCode: e.target.value ? parseInt(e.target.value) : undefined }))}
              className="h-9 px-3 rounded-lg text-[13px]"
              style={{ backgroundColor: colors.bgTertiary, color: colors.text, border: `1px solid ${colors.border}` }}
            >
              <option value="">{t('access.filters.allStatus')}</option>
              <option value="200">200 OK</option>
              <option value="201">201 Created</option>
              <option value="400">400 Bad Request</option>
              <option value="401">401 Unauthorized</option>
              <option value="403">403 Forbidden</option>
              <option value="404">404 Not Found</option>
              <option value="500">500 Server Error</option>
            </select>

            {/* Method Filter */}
            <select
              value={filters.method || ''}
              onChange={(e) => setFilters(prev => ({ ...prev, method: e.target.value || undefined }))}
              className="h-9 px-3 rounded-lg text-[13px]"
              style={{ backgroundColor: colors.bgTertiary, color: colors.text, border: `1px solid ${colors.border}` }}
            >
              <option value="">{t('access.filters.allMethods')}</option>
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="PATCH">PATCH</option>
              <option value="DELETE">DELETE</option>
            </select>

            {/* Search */}
            <input
              type="text"
              placeholder={t('access.filters.search')}
              value={filters.search || ''}
              onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value || undefined }))}
              className="flex-1 min-w-[200px] h-9 px-3 rounded-lg text-[13px]"
              style={{ backgroundColor: colors.bgTertiary, color: colors.text, border: `1px solid ${colors.border}` }}
            />
          </div>
        </div>
      </section>

      {/* Table with LogDetailModal */}
      <section className="px-6 pb-16">
        <div className="max-w-[1200px] mx-auto">
          <LogTable
            logType="access"
            columns={accessLogColumns}
            data={logs as unknown as Record<string, unknown>[]}
            loading={loading}
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            emptyMessage={t('access.empty')}
          />
        </div>
      </section>
    </div>
  );
}
