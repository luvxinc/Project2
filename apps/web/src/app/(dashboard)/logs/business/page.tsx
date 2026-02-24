'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { logsApi, BusinessLog, LogQueryParams } from '@/lib/api/logs';
import { LogTable, businessLogColumns, LogTypeSelector } from '../components';

export default function BusinessLogsPage() {
  const t = useTranslations('logs');
  const { theme } = useTheme();
  const colors = themeColors[theme];
  
  const [logs, setLogs] = useState<BusinessLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFilters] = useState<LogQueryParams>({ pageSize: 15 });

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const result = await logsApi.getBusiness({ ...filters, page });
      setLogs(result.items);
      setTotalPages(result.totalPages);
    } catch (error) {
      console.error('Failed to fetch business logs:', error);
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
            {/* Module Filter */}
            <select
              value={filters.module || ''}
              onChange={(e) => setFilters(prev => ({ ...prev, module: e.target.value || undefined }))}
              className="h-9 px-3 rounded-lg text-[13px]"
              style={{ backgroundColor: colors.bgTertiary, color: colors.text, border: `1px solid ${colors.border}` }}
            >
              <option value="">{t('business.filters.allModules')}</option>
              <option value="sales">Sales</option>
              <option value="purchase">Purchase</option>
              <option value="inventory">Inventory</option>
              <option value="finance">Finance</option>
            </select>

            {/* Action Filter */}
            <select
              value={filters.action || ''}
              onChange={(e) => setFilters(prev => ({ ...prev, action: e.target.value || undefined }))}
              className="h-9 px-3 rounded-lg text-[13px]"
              style={{ backgroundColor: colors.bgTertiary, color: colors.text, border: `1px solid ${colors.border}` }}
            >
              <option value="">{t('business.filters.allActions')}</option>
              <option value="CREATE">Create</option>
              <option value="UPDATE">Update</option>
              <option value="DELETE">Delete</option>
            </select>

            {/* Search */}
            <input
              type="text"
              placeholder={t('business.filters.search')}
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
            logType="business"
            columns={businessLogColumns}
            data={logs as unknown as Record<string, unknown>[]}
            loading={loading}
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            emptyMessage={t('business.empty')}
          />
        </div>
      </section>
    </div>
  );
}
