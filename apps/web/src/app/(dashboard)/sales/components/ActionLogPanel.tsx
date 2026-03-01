'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { salesActionLogApi, type ActionLogEntry } from '@/lib/api/sales';

interface ActionLogPanelProps {
  module: string; // 'LISTING' | 'OFFER' | 'all'
}

const TRIGGER_ICONS: Record<string, string> = {
  AUTO: 'A',
  MANUAL: 'M',
  SCHEDULED: 'S',
  WEBHOOK: 'W',
};

export default function ActionLogPanel({ module }: ActionLogPanelProps) {
  const { theme } = useTheme();
  const c = themeColors[theme];

  const [logs, setLogs] = useState<ActionLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [filterTrigger, setFilterTrigger] = useState<string>('');
  const [filterAction, setFilterAction] = useState<string>('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const limit = 50;

  // Trigger colors derived from theme system colors
  const triggerColors: Record<string, string> = {
    AUTO: c.purple,
    MANUAL: c.blue,
    SCHEDULED: c.orange,
    WEBHOOK: c.green,
  };

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await salesActionLogApi.getLogs({
        module: module === 'all' ? undefined : module,
        triggerType: filterTrigger || undefined,
        actionType: filterAction || undefined,
        limit,
        offset,
      });
      setLogs(res.logs || []);
      setTotal(res.total || 0);
    } catch (err) {
      console.error('Failed to load action logs:', err);
    } finally {
      setLoading(false);
    }
  }, [module, offset, filterTrigger, filterAction]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    setOffset(0);
  }, [filterTrigger, filterAction]);

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  // Shared styles using theme colors
  const selectStyle: React.CSSProperties = {
    padding: '6px 12px', borderRadius: 8,
    border: `1px solid ${c.borderLight}`,
    background: c.bgSecondary,
    color: c.text,
    fontSize: 13,
  };

  const thStyle: React.CSSProperties = {
    padding: '10px 12px',
    textAlign: 'left',
    fontSize: 12,
    fontWeight: 600,
    color: c.textSecondary,
    borderBottom: `1px solid ${c.borderLight}`,
  };

  const tdStyle: React.CSSProperties = {
    padding: '8px 12px',
    color: c.text,
  };

  const paginationBtn = (disabled: boolean): React.CSSProperties => ({
    padding: '6px 16px', borderRadius: 8, fontSize: 13,
    border: `1px solid ${c.borderLight}`,
    background: disabled ? c.bgTertiary : c.bgSecondary,
    color: disabled ? c.textTertiary : c.text,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  });

  return (
    <div style={{ padding: '16px 0' }}>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={filterTrigger} onChange={(e) => setFilterTrigger(e.target.value)} style={selectStyle}>
          <option value="">All triggers</option>
          <option value="AUTO">Auto</option>
          <option value="MANUAL">Manual</option>
          <option value="SCHEDULED">Scheduled</option>
          <option value="WEBHOOK">Webhook</option>
        </select>

        <select value={filterAction} onChange={(e) => setFilterAction(e.target.value)} style={selectStyle}>
          <option value="">All actions</option>
          <option value="RESTOCK">Restock</option>
          <option value="REPRICE">Reprice</option>
          <option value="PROMOTE">Promote</option>
          <option value="OFFER_REPLY">Offer Reply</option>
          <option value="DAILY_SYNC">Daily Sync</option>
          <option value="MANUAL_SYNC">Manual Sync</option>
          <option value="WEBHOOK_ORDER">Webhook Order</option>
          <option value="AD_RATE_REFRESH">Ad Rate Refresh</option>
          <option value="TRANSFORM">Transform</option>
          <option value="SKU_UPDATE">SKU Update</option>
          <option value="FULL_REFRESH">Full Refresh</option>
        </select>

        <button
          onClick={fetchLogs}
          style={{
            ...selectStyle,
            cursor: 'pointer',
            padding: '6px 16px',
          }}
        >
          Refresh
        </button>

        <span style={{ marginLeft: 'auto', fontSize: 12, color: c.textSecondary }}>
          {total} total records
        </span>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', borderRadius: 12, border: `1px solid ${c.borderLight}` }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: c.bgTertiary }}>
              <th style={thStyle}>Trigger</th>
              <th style={thStyle}>Time</th>
              <th style={thStyle}>Action</th>
              <th style={thStyle}>Summary</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Count</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Result</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Duration</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: c.textTertiary }}>Loading...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: c.textTertiary }}>No logs found</td></tr>
            ) : (
              logs.map((log) => {
                const isExpanded = expandedId === log.id;
                const parsed = log.detail ? (() => { try { return JSON.parse(log.detail); } catch { return null; } })() : null;
                const tColor = triggerColors[log.trigger_type] || c.gray;
                return (
                  <React.Fragment key={log.id}>
                    <tr
                      onClick={() => setExpandedId(isExpanded ? null : log.id)}
                      style={{
                        cursor: parsed ? 'pointer' : 'default',
                        borderBottom: `1px solid ${c.separator}`,
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = c.hover)}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={tdStyle}>
                        <span
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                            background: `${tColor}18`,
                            color: tColor,
                          }}
                        >
                          {TRIGGER_ICONS[log.trigger_type] || '?'} {log.trigger_type}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap', fontSize: 12, color: c.textSecondary }}>
                        {formatTime(log.created_at)}
                      </td>
                      <td style={tdStyle}>
                        <span style={{
                          padding: '2px 8px', borderRadius: 6, fontSize: 11,
                          background: c.bgTertiary,
                          color: c.textSecondary,
                          fontFamily: 'monospace',
                        }}>
                          {log.action_type}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {log.summary}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        {log.total_count != null ? (
                          <span>
                            <span style={{ color: c.green, fontWeight: 600 }}>{log.success_count ?? 0}</span>
                            <span style={{ color: c.textTertiary }}>/</span>
                            <span>{log.total_count}</span>
                          </span>
                        ) : '\u2014'}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        {log.success ? (
                          <span style={{ color: c.green, fontWeight: 600 }}>OK</span>
                        ) : (
                          <span title={log.error_message || ''} style={{ color: c.red, fontWeight: 600, cursor: 'help' }}>FAIL</span>
                        )}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontSize: 12, color: c.textSecondary }}>
                        {log.duration_ms != null ? formatDuration(log.duration_ms) : '\u2014'}
                      </td>
                    </tr>
                    {isExpanded && parsed && (
                      <tr key={`${log.id}-detail`}>
                        <td colSpan={7} style={{ padding: '8px 16px 12px', background: c.bgTertiary }}>
                          <pre style={{
                            fontSize: 11, fontFamily: 'monospace', whiteSpace: 'pre-wrap',
                            maxHeight: 300, overflowY: 'auto', margin: 0,
                            padding: 12, borderRadius: 8,
                            background: c.bgSecondary,
                            border: `1px solid ${c.borderLight}`,
                            color: c.text,
                          }}>
                            {JSON.stringify(parsed, null, 2)}
                          </pre>
                          {log.error_message && (
                            <div style={{
                              marginTop: 8, padding: '6px 10px', borderRadius: 6,
                              background: `${c.red}15`,
                              color: c.red,
                              fontSize: 12,
                            }}>
                              Error: {log.error_message}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16, alignItems: 'center' }}>
          <button
            disabled={currentPage <= 1}
            onClick={() => setOffset(Math.max(0, offset - limit))}
            style={paginationBtn(currentPage <= 1)}
          >
            Prev
          </button>
          <span style={{ fontSize: 13, color: c.textSecondary }}>
            Page {currentPage} / {totalPages}
          </span>
          <button
            disabled={currentPage >= totalPages}
            onClick={() => setOffset(offset + limit)}
            style={paginationBtn(currentPage >= totalPages)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-US', {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    });
  } catch { return iso; }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}
