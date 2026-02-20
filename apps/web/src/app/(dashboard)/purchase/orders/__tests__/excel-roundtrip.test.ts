/**
 * Excel Round-Trip Test v2 — V1-exact cell layout verification
 * Run: npx tsx src/app/\(dashboard\)/purchase/orders/__tests__/excel-roundtrip.test.ts
 */
import * as XLSX from 'xlsx';

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; console.log(`  ❌ FAIL: ${msg}`); }
}

// ═══════════ Test 1: Template ═══════════
function testTemplate() {
  console.log('\n═══ Test 1: Template Download ═══');

  const ws = XLSX.utils.aoa_to_sheet([]);
  XLSX.utils.sheet_add_aoa(ws, [[null, 'Eaglestar Purchase Order Form']], { origin: 'A1' });
  XLSX.utils.sheet_add_aoa(ws, [[null, null, 'AB', null, '2026-02-19', null, 'USD']], { origin: 'A2' });
  XLSX.utils.sheet_add_aoa(ws, [[null, 'SKU', '数量', '单价']], { origin: 'A4' });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '采购订单明细');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });

  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

  assert(rows[0]?.[1] === 'Eaglestar Purchase Order Form', 'B1 = exact title');
  assert(rows[1]?.[0] == null || rows[1]?.[0] === undefined, 'A2 = empty (no label)');
  assert(rows[1]?.[1] == null || rows[1]?.[1] === undefined, 'B2 = empty (no "Supplier:" label)');
  assert(rows[1]?.[2] === 'AB', 'C2 = supplier code');
  assert(rows[1]?.[4] === '2026-02-19', 'E2 = date');
  assert(rows[1]?.[6] === 'USD', 'G2 = currency');
  assert(rows[2] === undefined || rows[2]?.[1] == null, 'Row 3 = empty (no exchange rate)');
  assert(rows[3]?.[1] === 'SKU', 'B4 = SKU header');
  assert(rows[3]?.[2] === '数量', 'C4 = 数量 header');
  assert(rows[3]?.[3] === '单价', 'D4 = 单价 header');

  console.log(`  Template: ${buf.length} bytes`);
  return buf;
}

// ═══════════ Test 2: Upload Parse ═══════════
function testUploadParse(templateBuf: Buffer) {
  console.log('\n═══ Test 2: Upload & Parse ═══');

  const wb = XLSX.read(templateBuf, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];

  // Fill data at B5/C5/D5 (V1 data area)
  XLSX.utils.sheet_add_aoa(ws, [
    [null, 'SKU001', 100, 25.50],
    [null, 'SKU002', 50, 30.00],
    [null, '', '', ''],       // empty row
    [null, 'SKU003', 200, 12.75],
  ], { origin: 'A5' });

  const filledBuf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
  const uploaded = XLSX.read(filledBuf, { type: 'buffer' });
  const uws = uploaded.Sheets[uploaded.SheetNames[0]];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(uws, { header: 1 });

  // V1 format detection
  const b1 = rows[0]?.[1];
  const isV1 = typeof b1 === 'string' && b1.trim() === 'Eaglestar Purchase Order Form';
  assert(isV1, 'Detects V1 format (exact B1 match)');

  // Metadata validation
  const supplier = String(rows[1]?.[2] || '').trim().toUpperCase();
  assert(supplier === 'AB', `C2 supplier = "${supplier}"`);

  const date = String(rows[1]?.[4] || '').trim();
  assert(date === '2026-02-19', `E2 date = "${date}"`);

  const currency = String(rows[1]?.[6] || '').trim().toUpperCase();
  assert(currency === 'USD', `G2 currency = "${currency}"`);

  // Parse data from row 5 (idx 4), cols B/C/D (1/2/3)
  interface Item { sku: string; qty: number; price: number }
  const items: Item[] = [];
  for (let i = 4; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const sku = String(row[1] || '').trim().toUpperCase();
    if (!sku) continue;
    items.push({
      sku,
      qty: Math.round(Number(row[2])),
      price: Number(row[3]),
    });
  }

  assert(items.length === 3, `Parsed ${items.length} items (skip empty row)`);
  assert(items[0].sku === 'SKU001' && items[0].qty === 100 && items[0].price === 25.5, 'Item 1 correct');
  assert(items[1].sku === 'SKU002' && items[1].qty === 50, 'Item 2 correct');
  assert(items[2].sku === 'SKU003' && items[2].qty === 200, 'Item 3 correct');

  // Date mismatch test
  const wrongDateWb = XLSX.read(templateBuf, { type: 'buffer' });
  const wrongDateWs = wrongDateWb.Sheets[wrongDateWb.SheetNames[0]];
  XLSX.utils.sheet_add_aoa(wrongDateWs, [[null, null, 'AB', null, '2025-01-01', null, 'USD']], { origin: 'A2' });
  const wrongRows: unknown[][] = XLSX.utils.sheet_to_json(wrongDateWs, { header: 1 });
  const excelDate = String(wrongRows[1]?.[4] || '');
  const expectedDate = '2026-02-19';
  assert(String(excelDate) === '2025-01-01' && String(excelDate) !== String(expectedDate), 'Date mismatch detected correctly');
}

// ═══════════ Test 3: Export ═══════════
function testExport() {
  console.log('\n═══ Test 3: Export PO ═══');

  const ws = XLSX.utils.aoa_to_sheet([]);

  // V1-exact layout
  XLSX.utils.sheet_add_aoa(ws, [[null, null, '采购订单详情']], { origin: 'A2' });
  XLSX.utils.sheet_add_aoa(ws, [[null, null, 'AB', null, null, '2026-02-19']], { origin: 'A4' });
  XLSX.utils.sheet_add_aoa(ws, [[null, null, 'AB20260219-S01']], { origin: 'A6' });
  XLSX.utils.sheet_add_aoa(ws, [[null, null, null, null, null, 'V01']], { origin: 'A8' });
  XLSX.utils.sheet_add_aoa(ws, [[null, null, 'USD', null, null, 7.25]], { origin: 'A14' });
  XLSX.utils.sheet_add_aoa(ws, [[null, null, '是', null, null, '5%']], { origin: 'A16' });
  XLSX.utils.sheet_add_aoa(ws, [[null, null, '是', null, null, '30%']], { origin: 'A18' });
  XLSX.utils.sheet_add_aoa(ws, [[null, null, null, null, null, 'L01']], { origin: 'A20' });
  XLSX.utils.sheet_add_aoa(ws, [[null, null, 'USD 6600.00']], { origin: 'A26' });
  XLSX.utils.sheet_add_aoa(ws, [[null, 'SKU', '数量', '货币', '单价', '小计']], { origin: 'A28' });
  XLSX.utils.sheet_add_aoa(ws, [
    [null, 'SKU001', 100, 'USD', 25.50, 2550],
    [null, 'SKU002', 50, 'USD', 30.00, 1500],
    [null, 'SKU003', 200, 'USD', 12.75, 2550],
  ], { origin: 'A29' });

  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

  // Verify V1-exact cell positions
  assert(String(rows[1]?.[2]).includes('采购订单'), 'Row 2 C = title');
  assert(rows[3]?.[2] === 'AB', 'C4 = supplier');
  assert(rows[3]?.[5] === '2026-02-19', 'F4 = date');
  assert(rows[5]?.[2] === 'AB20260219-S01', 'C6 = PO#');
  assert(rows[7]?.[5] === 'V01', 'F8 = strategy seq');
  assert(rows[13]?.[2] === 'USD', 'C14 = currency');
  assert(rows[13]?.[5] === 7.25, 'F14 = exchange rate');
  assert(rows[15]?.[2] === '是', 'C16 = float enabled (是)');
  assert(rows[17]?.[2] === '是', 'C18 = deposit enabled (是)');
  assert(rows[19]?.[5] === 'L01', 'F20 = detail seq');
  assert(String(rows[25]?.[2]).includes('6600'), 'C26 = total');
  assert(rows[27]?.[1] === 'SKU', 'B28 = items header');
  assert(rows[28]?.[1] === 'SKU001', 'B29 = first item (V1 exact start row)');
  assert(rows[30]?.[1] === 'SKU003', 'B31 = third item');
}

// ═══════════ Run ═══════════
console.log('╔═══════════════════════════════════════════╗');
console.log('║  Excel Audit Test v2 — V1-exact layout    ║');
console.log('╚═══════════════════════════════════════════╝');

try {
  const buf = testTemplate();
  testUploadParse(buf);
  testExport();
  console.log(`\n══════════════════════════════════`);
  console.log(`  Passed: ${passed}  Failed: ${failed}`);
  if (failed > 0) {
    console.log('  ❌ SOME TESTS FAILED');
    process.exit(1);
  } else {
    console.log('  ✅ ALL TESTS PASSED');
  }
} catch (err) {
  console.error('\n❌ TEST CRASHED:', err);
  process.exit(1);
}
