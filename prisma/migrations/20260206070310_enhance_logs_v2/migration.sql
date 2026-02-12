/*
  Warnings:

  - You are about to drop the column `file_path` on the `error_logs` table. All the data in the column will be lost.
  - You are about to drop the column `line_number` on the `error_logs` table. All the data in the column will be lost.
  - You are about to drop the column `traceback_full` on the `error_logs` table. All the data in the column will be lost.
  - The `category` column on the `error_logs` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "ErrorCategory" AS ENUM ('DATABASE', 'NETWORK', 'VALIDATION', 'AUTH', 'BUSINESS', 'EXTERNAL_API', 'SYSTEM', 'UNKNOWN');

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "new_value" JSONB,
ADD COLUMN     "old_value" JSONB,
ADD COLUMN     "result" "AuditResult" NOT NULL DEFAULT 'SUCCESS',
ADD COLUMN     "riskLevel" "RiskLevel" NOT NULL DEFAULT 'LOW',
ADD COLUMN     "session_id" TEXT,
ADD COLUMN     "trace_id" TEXT,
ADD COLUMN     "username" TEXT;

-- AlterTable
ALTER TABLE "error_logs" DROP COLUMN "file_path",
DROP COLUMN "line_number",
DROP COLUMN "traceback_full",
ADD COLUMN     "app_version" TEXT,
ADD COLUMN     "business_context" JSONB,
ADD COLUMN     "entity_id" TEXT,
ADD COLUMN     "entity_type" TEXT,
ADD COLUMN     "error_code" TEXT,
ADD COLUMN     "first_seen_at" TIMESTAMP(3),
ADD COLUMN     "hostname" TEXT,
ADD COLUMN     "last_seen_at" TIMESTAMP(3),
ADD COLUMN     "module" TEXT,
ADD COLUMN     "node_env" TEXT,
ADD COLUMN     "operation" TEXT,
ADD COLUMN     "request_body" JSONB,
ADD COLUMN     "request_headers" JSONB,
ADD COLUMN     "request_query" JSONB,
ADD COLUMN     "resolution" TEXT,
ADD COLUMN     "root_cause" TEXT,
ADD COLUMN     "session_id" TEXT,
ADD COLUMN     "stack_trace" TEXT,
ADD COLUMN     "system_context" JSONB,
ADD COLUMN     "userRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "user_agent" TEXT,
ADD COLUMN     "user_id" TEXT,
DROP COLUMN "category",
ADD COLUMN     "category" "ErrorCategory" NOT NULL DEFAULT 'UNKNOWN';

-- CreateIndex
CREATE INDEX "audit_logs_trace_id_idx" ON "audit_logs"("trace_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_riskLevel_idx" ON "audit_logs"("riskLevel");

-- CreateIndex
CREATE INDEX "error_logs_error_hash_idx" ON "error_logs"("error_hash");

-- CreateIndex
CREATE INDEX "error_logs_category_idx" ON "error_logs"("category");

-- CreateIndex
CREATE INDEX "error_logs_module_idx" ON "error_logs"("module");
