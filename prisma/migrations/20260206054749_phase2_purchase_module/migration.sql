-- CreateEnum
CREATE TYPE "SupplierStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "POStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'CONFIRMED', 'SHIPPED', 'PARTIAL', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('PENDING', 'IN_TRANSIT', 'ARRIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReceiveStatus" AS ENUM ('PENDING', 'INSPECTING', 'COMPLETED', 'ABNORMAL');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('WIRE', 'CHECK', 'ALIPAY', 'WECHAT', 'CASH', 'OTHER');

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact_name" TEXT,
    "contact_phone" TEXT,
    "contact_email" TEXT,
    "address" TEXT,
    "country" TEXT NOT NULL DEFAULT 'CN',
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "payment_terms" TEXT,
    "lead_time_days" INTEGER NOT NULL DEFAULT 30,
    "rating" INTEGER NOT NULL DEFAULT 3,
    "notes" TEXT,
    "status" "SupplierStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_strategies" (
    "id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "product_id" TEXT,
    "unit_cost" DECIMAL(12,5) NOT NULL DEFAULT 0,
    "min_order_qty" INTEGER NOT NULL DEFAULT 1,
    "pack_size" INTEGER NOT NULL DEFAULT 1,
    "lead_time_days" INTEGER,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_strategies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "po_number" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "status" "POStatus" NOT NULL DEFAULT 'DRAFT',
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "shipping_cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "other_cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "paid_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "order_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expected_date" TIMESTAMP(3),
    "completed_date" TIMESTAMP(3),
    "internal_notes" TEXT,
    "supplier_notes" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_items" (
    "id" TEXT NOT NULL,
    "po_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "product_id" TEXT,
    "strategy_id" TEXT,
    "description" TEXT,
    "quantity" INTEGER NOT NULL,
    "unit_cost" DECIMAL(12,5) NOT NULL,
    "line_total" DECIMAL(12,2) NOT NULL,
    "received_qty" INTEGER NOT NULL DEFAULT 0,
    "pending_qty" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipments" (
    "id" TEXT NOT NULL,
    "shipment_number" TEXT NOT NULL,
    "po_id" TEXT NOT NULL,
    "carrier" TEXT,
    "tracking_number" TEXT,
    "shipping_cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'PENDING',
    "shipped_date" TIMESTAMP(3),
    "eta_date" TIMESTAMP(3),
    "arrived_date" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receives" (
    "id" TEXT NOT NULL,
    "receive_number" TEXT NOT NULL,
    "shipment_id" TEXT,
    "receive_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "received_by_id" TEXT,
    "warehouse_code" TEXT,
    "status" "ReceiveStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "receives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receive_items" (
    "id" TEXT NOT NULL,
    "receive_id" TEXT NOT NULL,
    "po_item_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "expected_qty" INTEGER NOT NULL,
    "received_qty" INTEGER NOT NULL,
    "defect_qty" INTEGER NOT NULL DEFAULT 0,
    "unit_cost" DECIMAL(12,5) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receive_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "po_payments" (
    "id" TEXT NOT NULL,
    "po_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "payment_type" "PaymentType" NOT NULL DEFAULT 'WIRE',
    "payment_date" TIMESTAMP(3) NOT NULL,
    "reference_number" TEXT,
    "notes" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "po_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_code_key" ON "suppliers"("code");

-- CreateIndex
CREATE INDEX "suppliers_status_idx" ON "suppliers"("status");

-- CreateIndex
CREATE INDEX "suppliers_country_idx" ON "suppliers"("country");

-- CreateIndex
CREATE INDEX "supplier_strategies_sku_idx" ON "supplier_strategies"("sku");

-- CreateIndex
CREATE INDEX "supplier_strategies_supplier_id_idx" ON "supplier_strategies"("supplier_id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_strategies_supplier_id_sku_key" ON "supplier_strategies"("supplier_id", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_po_number_key" ON "purchase_orders"("po_number");

-- CreateIndex
CREATE INDEX "purchase_orders_supplier_id_idx" ON "purchase_orders"("supplier_id");

-- CreateIndex
CREATE INDEX "purchase_orders_status_idx" ON "purchase_orders"("status");

-- CreateIndex
CREATE INDEX "purchase_orders_order_date_idx" ON "purchase_orders"("order_date");

-- CreateIndex
CREATE INDEX "purchase_order_items_po_id_idx" ON "purchase_order_items"("po_id");

-- CreateIndex
CREATE INDEX "purchase_order_items_sku_idx" ON "purchase_order_items"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "shipments_shipment_number_key" ON "shipments"("shipment_number");

-- CreateIndex
CREATE INDEX "shipments_po_id_idx" ON "shipments"("po_id");

-- CreateIndex
CREATE INDEX "shipments_status_idx" ON "shipments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "receives_receive_number_key" ON "receives"("receive_number");

-- CreateIndex
CREATE INDEX "receives_shipment_id_idx" ON "receives"("shipment_id");

-- CreateIndex
CREATE INDEX "receives_receive_date_idx" ON "receives"("receive_date");

-- CreateIndex
CREATE INDEX "receive_items_receive_id_idx" ON "receive_items"("receive_id");

-- CreateIndex
CREATE INDEX "receive_items_po_item_id_idx" ON "receive_items"("po_item_id");

-- CreateIndex
CREATE INDEX "receive_items_sku_idx" ON "receive_items"("sku");

-- CreateIndex
CREATE INDEX "po_payments_po_id_idx" ON "po_payments"("po_id");

-- CreateIndex
CREATE INDEX "po_payments_payment_date_idx" ON "po_payments"("payment_date");

-- AddForeignKey
ALTER TABLE "supplier_strategies" ADD CONSTRAINT "supplier_strategies_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_strategies" ADD CONSTRAINT "supplier_strategies_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_strategy_id_fkey" FOREIGN KEY ("strategy_id") REFERENCES "supplier_strategies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receives" ADD CONSTRAINT "receives_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receive_items" ADD CONSTRAINT "receive_items_receive_id_fkey" FOREIGN KEY ("receive_id") REFERENCES "receives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receive_items" ADD CONSTRAINT "receive_items_po_item_id_fkey" FOREIGN KEY ("po_item_id") REFERENCES "purchase_order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_payments" ADD CONSTRAINT "po_payments_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
