/**
 * 日志表格列配置
 * 
 * 设计原则:
 * 1. 表格只显示最关键的字段 (5-7列)，便于快速扫描
 * 2. 详细信息通过点击行展开 Modal 查看
 * 3. 每行都可点击，鼠标悬浮有视觉反馈
 *
 * Colors are NOT stored here — they are resolved at render time
 * via theme-aware helpers in LogTable / LogDetailModal.
 * The `badgeColorKey` field references a resolver function
 * that accepts ThemeColors and returns the color map.
 */

export type ColumnType = 'text' | 'datetime' | 'badge' | 'status' | 'duration' | 'truncate';

export interface TableColumn {
  key: string;
  label: string;           // i18n key: logs.[type].columns.[label]
  type: ColumnType;
  width?: string;          // Tailwind width class
  align?: 'left' | 'center' | 'right';
  /** Key into badge color resolver — resolved at render time with theme colors */
  badgeColorKey?: 'severity' | 'risk' | 'result' | 'method';
}

// ================================
// Error Log 表格列
// ================================
// 表格显示: 时间 | 严重程度 | 类型 | 消息 | 模块 | 状态
// Modal 展示: 完整错误信息、堆栈、请求上下文、用户信息、系统环境

export const errorLogColumns: TableColumn[] = [
  { key: 'createdAt', label: 'time', type: 'datetime', width: 'w-[140px]' },
  { key: 'severity', label: 'severity', type: 'badge', width: 'w-[100px]', badgeColorKey: 'severity' },
  { key: 'errorType', label: 'type', type: 'text', width: 'w-[120px]' },
  { key: 'errorMessage', label: 'message', type: 'truncate', width: 'flex-1' },
  { key: 'module', label: 'module', type: 'text', width: 'w-[100px]' },
  { key: 'isResolved', label: 'status', type: 'status', width: 'w-[80px]', align: 'center' },
];

// ================================
// Audit Log 表格列
// ================================
// 表格显示: 时间 | 用户 | 模块 | 操作 | 实体 | 结果 | 风险
// Modal 展示: 修改前后值对比、详细上下文、会话信息

export const auditLogColumns: TableColumn[] = [
  { key: 'createdAt', label: 'time', type: 'datetime', width: 'w-[140px]' },
  { key: 'username', label: 'user', type: 'text', width: 'w-[100px]' },
  { key: 'module', label: 'module', type: 'text', width: 'w-[100px]' },
  { key: 'action', label: 'action', type: 'badge', width: 'w-[150px]' },
  { key: 'entityType', label: 'entity', type: 'text', width: 'w-[100px]' },
  { key: 'result', label: 'result', type: 'badge', width: 'w-[90px]', badgeColorKey: 'result', align: 'center' },
  { key: 'riskLevel', label: 'risk', type: 'badge', width: 'w-[80px]', badgeColorKey: 'risk', align: 'center' },
];

// ================================
// Business Log 表格列
// ================================
// 表格显示: 时间 | 用户 | 模块 | 操作 | 摘要 | 状态
// Modal 展示: 详细业务数据

export const businessLogColumns: TableColumn[] = [
  { key: 'createdAt', label: 'time', type: 'datetime', width: 'w-[140px]' },
  { key: 'username', label: 'user', type: 'text', width: 'w-[100px]' },
  { key: 'module', label: 'module', type: 'text', width: 'w-[100px]' },
  { key: 'action', label: 'action', type: 'badge', width: 'w-[150px]' },
  { key: 'summary', label: 'summary', type: 'truncate', width: 'flex-1' },
  { key: 'status', label: 'status', type: 'badge', width: 'w-[90px]', align: 'center' },
];

// ================================
// Access Log 表格列
// ================================
// 表格显示: 时间 | 方法 | 路径 | 状态码 | 响应时间 | 用户 | IP
// Modal 展示: 完整请求详情

export const accessLogColumns: TableColumn[] = [
  { key: 'createdAt', label: 'time', type: 'datetime', width: 'w-[140px]' },
  { key: 'method', label: 'method', type: 'badge', width: 'w-[80px]', badgeColorKey: 'method', align: 'center' },
  { key: 'path', label: 'path', type: 'truncate', width: 'flex-1' },
  { key: 'statusCode', label: 'status', type: 'badge', width: 'w-[70px]', align: 'center' },
  { key: 'responseTime', label: 'duration', type: 'duration', width: 'w-[80px]', align: 'right' },
  { key: 'username', label: 'user', type: 'text', width: 'w-[100px]' },
  { key: 'ipAddress', label: 'ip', type: 'text', width: 'w-[120px]' },
];

// ================================
// 表格列配置导出
// ================================
export type LogType = 'error' | 'audit' | 'business' | 'access';

export const tableColumns: Record<LogType, TableColumn[]> = {
  error: errorLogColumns,
  audit: auditLogColumns,
  business: businessLogColumns,
  access: accessLogColumns,
};
