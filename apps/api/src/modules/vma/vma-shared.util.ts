/**
 * VMA 共享工具 — 消除 Controller/Service 间的代码重复
 *
 * - AuthenticatedRequest: 统一的已认证请求接口
 * - extractClientIp: 统一的 IP 提取方法
 * - parsePacificDate: 太平洋时区铁律日期解析
 * - MONTHS: 月份短名常量
 */
import type { Request as ExpressRequest } from 'express';

export interface AuthenticatedRequest extends ExpressRequest {
  user: { userId: string; username: string; roles?: string[] };
}

/**
 * 提取客户端真实 IP — 统一实现
 *
 * 优先级：x-forwarded-for → x-real-ip → req.ip → socket.remoteAddress
 */
export function extractClientIp(req: AuthenticatedRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  if (Array.isArray(forwarded)) return forwarded[0];
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string') return realIp;
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

/**
 * 太平洋时区铁律 — 日期字符串解析
 *
 * 将 YYYY-MM-DD 字符串转为 Date，强制加 T12:00:00.000Z 防止跨天偏移。
 * @param dateStr — 格式 'YYYY-MM-DD'
 * @returns Date 对象
 */
export function parsePacificDate(dateStr: string): Date {
  return new Date(dateStr + 'T12:00:00.000Z');
}

/**
 * 太平洋时区铁律 — 可选日期字符串解析
 *
 * 同 parsePacificDate 但接受 null/undefined，返回 null
 */
export function parsePacificDateOptional(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  return new Date(dateStr + 'T12:00:00.000Z');
}

/** 月份短名常量 — 全局复用 */
export const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'] as const;

