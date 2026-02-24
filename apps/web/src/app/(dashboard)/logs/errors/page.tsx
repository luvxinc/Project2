'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { logsApi, ErrorLog, LogQueryParams } from '@/lib/api/logs';
import { LogTable, errorLogColumns, LogTypeSelector } from '../components';

export default function ErrorLogsPage() {
  const t = useTranslations('logs');
  const { theme } = useTheme();
  const colors = themeColors[theme];
  
  const [errors, setErrors] = useState<ErrorLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFilters] = useState<LogQueryParams>({ pageSize: 15 });

  const fetchErrors = useCallback(async () => {
    try {
      setLoading(true);
      const result = await logsApi.getErrors({ ...filters, page });
      setErrors(result.items);
      setTotalPages(result.totalPages);
    } catch (error) {
      console.error('Failed to fetch errors:', error);
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    fetchErrors();
  }, [fetchErrors]);

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
            {/* Severity Filter */}
            <select
              value={filters.severity || ''}
              onChange={(e) => setFilters(prev => ({ ...prev, severity: e.target.value || undefined }))}
              className="h-9 px-3 rounded-lg text-[13px]"
              style={{ backgroundColor: colors.bgTertiary, color: colors.text, border: `1px solid ${colors.border}` }}
            >
              <option value="">{t('errors.filters.all')}</option>
              <option value="CRITICAL">{t('errors.severity.CRITICAL')}</option>
              <option value="HIGH">{t('errors.severity.HIGH')}</option>
              <option value="MEDIUM">{t('errors.severity.MEDIUM')}</option>
              <option value="LOW">{t('errors.severity.LOW')}</option>
            </select>

            {/* Resolved Filter */}
            <select
              value={filters.isResolved === undefined ? '' : filters.isResolved.toString()}
              onChange={(e) => setFilters(prev => ({ 
                ...prev, 
                isResolved: e.target.value === '' ? undefined : e.target.value === 'true'
              }))}
              className="h-9 px-3 rounded-lg text-[13px]"
              style={{ backgroundColor: colors.bgTertiary, color: colors.text, border: `1px solid ${colors.border}` }}
            >
              <option value="">{t('errors.filters.allStatus')}</option>
              <option value="false">{t('errors.filters.unresolved')}</option>
              <option value="true">{t('errors.filters.resolved')}</option>
            </select>

            {/* Search */}
            <input
              type="text"
              placeholder={t('errors.filters.search')}
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
            logType="error"
            columns={errorLogColumns}
            data={errors as unknown as Record<string, unknown>[]}
            loading={loading}
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            emptyMessage={t('errors.empty')}
          />
        </div>
      </section>
    </div>
  );
}
