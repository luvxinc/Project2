/*
  Warnings:

  - You are about to drop the `po_payments` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `purchase_order_items` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `purchase_orders` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `receive_items` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `receives` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `shipments` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `supplier_strategies` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `suppliers` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "ErrorSeverity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "LogStatus" AS ENUM ('SUCCESS', 'FAILED', 'PENDING');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT', 'PASSWORD_CHANGE', 'CREATE_USER', 'UPDATE_USER', 'DELETE_USER', 'LOCK_USER', 'UNLOCK_USER', 'CHANGE_ROLE', 'UPDATE_PERMISSIONS', 'GOD_MODE_UNLOCK', 'GOD_MODE_LOCK', 'DEV_MODE_TOGGLE', 'CLEAR_DEV_LOGS', 'SECURITY_CODE_VERIFY', 'UPDATE_CONFIG', 'UPDATE_BOUNDARIES');

-- CreateEnum
CREATE TYPE "ActionCategory" AS ENUM ('AUTH', 'AUTHZ', 'DATA', 'CONFIG', 'ADMIN', 'SECURITY');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "AuditResult" AS ENUM ('SUCCESS', 'DENIED', 'FAILED');

-- DropForeignKey
ALTER TABLE "po_payments" DROP CONSTRAINT "po_payments_po_id_fkey";

-- DropForeignKey
ALTER TABLE "purchase_order_items" DROP CONSTRAINT "purchase_order_items_po_id_fkey";

-- DropForeignKey
ALTER TABLE "purchase_order_items" DROP CONSTRAINT "purchase_order_items_product_id_fkey";

-- DropForeignKey
ALTER TABLE "purchase_order_items" DROP CONSTRAINT "purchase_order_items_strategy_id_fkey";

-- DropForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_supplier_id_fkey";

-- DropForeignKey
ALTER TABLE "receive_items" DROP CONSTRAINT "receive_items_po_item_id_fkey";

-- DropForeignKey
ALTER TABLE "receive_items" DROP CONSTRAINT "receive_items_receive_id_fkey";

-- DropForeignKey
ALTER TABLE "receives" DROP CONSTRAINT "receives_shipment_id_fkey";

-- DropForeignKey
ALTER TABLE "shipments" DROP CONSTRAINT "shipments_po_id_fkey";

-- DropForeignKey
ALTER TABLE "supplier_strategies" DROP CONSTRAINT "supplier_strategies_product_id_fkey";

-- DropForeignKey
ALTER TABLE "supplier_strategies" DROP CONSTRAINT "supplier_strategies_supplier_id_fkey";

-- DropTable
DROP TABLE "po_payments";

-- DropTable
DROP TABLE "purchase_order_items";

-- DropTable
DROP TABLE "purchase_orders";

-- DropTable
DROP TABLE "receive_items";

-- DropTable
DROP TABLE "receives";

-- DropTable
DROP TABLE "shipments";

-- DropTable
DROP TABLE "supplier_strategies";

-- DropTable
DROP TABLE "suppliers";

-- DropEnum
DROP TYPE "POStatus";

-- DropEnum
DROP TYPE "PaymentType";

-- DropEnum
DROP TYPE "ReceiveStatus";

-- DropEnum
DROP TYPE "ShipmentStatus";

-- DropEnum
DROP TYPE "SupplierStatus";

-- CreateTable
CREATE TABLE "error_logs" (
    "id" TEXT NOT NULL,
    "trace_id" TEXT,
    "username" TEXT,
    "ip_address" TEXT,
    "request_path" TEXT,
    "request_method" TEXT,
    "error_type" TEXT NOT NULL,
    "error_message" TEXT NOT NULL,
    "traceback_full" TEXT,
    "file_path" TEXT,
    "line_number" INTEGER,
    "severity" "ErrorSeverity" NOT NULL DEFAULT 'MEDIUM',
    "category" TEXT,
    "is_resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolved_at" TIMESTAMP(3),
    "resolved_by" TEXT,
    "error_hash" TEXT,
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "dev_mode" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "error_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_logs" (
    "id" TEXT NOT NULL,
    "trace_id" TEXT,
    "username" TEXT,
    "ip_address" TEXT,
    "module" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "summary" TEXT,
    "details" JSONB,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "status" "LogStatus" NOT NULL DEFAULT 'SUCCESS',
    "dev_mode" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_logs" (
    "id" TEXT NOT NULL,
    "trace_id" TEXT,
    "username" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "query_params" TEXT,
    "status_code" INTEGER NOT NULL,
    "response_time" INTEGER,
    "response_size" INTEGER,
    "dev_mode" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "error_logs_trace_id_idx" ON "error_logs"("trace_id");

-- CreateIndex
CREATE INDEX "error_logs_severity_idx" ON "error_logs"("severity");

-- CreateIndex
CREATE INDEX "error_logs_is_resolved_idx" ON "error_logs"("is_resolved");

-- CreateIndex
CREATE INDEX "error_logs_created_at_idx" ON "error_logs"("created_at");

-- CreateIndex
CREATE INDEX "error_logs_dev_mode_idx" ON "error_logs"("dev_mode");

-- CreateIndex
CREATE INDEX "business_logs_trace_id_idx" ON "business_logs"("trace_id");

-- CreateIndex
CREATE INDEX "business_logs_module_idx" ON "business_logs"("module");

-- CreateIndex
CREATE INDEX "business_logs_action_idx" ON "business_logs"("action");

-- CreateIndex
CREATE INDEX "business_logs_created_at_idx" ON "business_logs"("created_at");

-- CreateIndex
CREATE INDEX "business_logs_dev_mode_idx" ON "business_logs"("dev_mode");

-- CreateIndex
CREATE INDEX "access_logs_trace_id_idx" ON "access_logs"("trace_id");

-- CreateIndex
CREATE INDEX "access_logs_path_idx" ON "access_logs"("path");

-- CreateIndex
CREATE INDEX "access_logs_status_code_idx" ON "access_logs"("status_code");

-- CreateIndex
CREATE INDEX "access_logs_created_at_idx" ON "access_logs"("created_at");

-- CreateIndex
CREATE INDEX "access_logs_dev_mode_idx" ON "access_logs"("dev_mode");
