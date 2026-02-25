-- Fix deposit payment_no uniqueness: V1 batch payments create multiple rows
-- with the same pmt_no (one per PO). The V22 constraint (payment_type, payment_no)
-- WHERE payment_type != 'logistics' prevents this.
--
-- Split into:
--   1. Prepay: unique (payment_type, payment_no) — each transaction has unique tran_no
--   2. Deposit/PO: unique (payment_type, payment_no, po_num) — batch shares pmt_no
--   3. Logistics: unchanged (already has own constraint with logistic_num)

-- Step 1: Drop the overly strict constraint
DROP INDEX IF EXISTS uq_payments_type_no;

-- Step 2: Prepay keeps strict uniqueness (each prepay transaction has unique payment_no)
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_prepay_no
    ON payments (payment_type, payment_no)
    WHERE payment_type = 'prepay';

-- Step 3: Deposit/PO allow shared payment_no across different POs (batch payment)
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_deposit_po_no
    ON payments (payment_type, payment_no, po_num)
    WHERE payment_type IN ('deposit', 'po');
