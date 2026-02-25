/**
 * Backup API Client — Database backup management endpoints.
 *
 * V3 architecture: connects to BackupController (/api/v1/backups)
 * V1 parity: db_admin backup/restore/delete operations
 */
import { api } from './client';

// ── Types ────────────────────────────────────────────────

export interface BackupListItem {
  id: string;
  displayDate: string;   // "2026 02 24"
  tag: string;
  size: string;           // "1.2 MB"
}

export interface BackupDetail {
  id: string;
  displayDate: string;
  detailDate: string;     // "2026-02-24 20:15:00"
  tag: string;
  size: string;
  sizeBytes: number;
  databases: string[];
}

export interface BackupCreateResponse {
  id: string;
  displayDate: string;
  tag: string;
  size: string;
  message: string;
}

export interface BackupOperationResult {
  message: string;
  backupId?: string;
}

// ── API Functions ────────────────────────────────────────

/** List all backups (sorted newest first) */
export function listBackups(): Promise<BackupListItem[]> {
  return api.get<BackupListItem[]>('/backups');
}

/** Get backup detail by ID */
export function getBackupDetail(id: string): Promise<BackupDetail> {
  return api.get<BackupDetail>(`/backups/${encodeURIComponent(id)}`);
}

/** Create a new backup */
export function createBackup(
  tag: string,
  securityCodes: Record<string, string> = {},
): Promise<BackupCreateResponse> {
  return api.post<BackupCreateResponse>('/backups', {
    tag,
    ...securityCodes,
  });
}

/** Restore a backup */
export function restoreBackup(
  id: string,
  securityCodes: Record<string, string> = {},
): Promise<BackupOperationResult> {
  return api.post<BackupOperationResult>(
    `/backups/${encodeURIComponent(id)}/restore`,
    { ...securityCodes },
  );
}

/** Delete a backup */
export function deleteBackup(
  id: string,
  securityCodes: Record<string, string> = {},
): Promise<BackupOperationResult> {
  return api.delete<BackupOperationResult>(
    `/backups/${encodeURIComponent(id)}`,
    { ...securityCodes },
  );
}
