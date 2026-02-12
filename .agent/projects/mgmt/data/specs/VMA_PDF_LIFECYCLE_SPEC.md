# VMA PDF Lifecycle Policy — On-Demand Generation, Zero Persistence

> **Status**: ✅ IMPLEMENTED  
> **Priority**: HIGH  
> **Type**: Backend Refactor  
> **Date**: 2026-02-12  

## 1. Policy Statement

All VMA PDF endpoints MUST follow the **On-Demand, Zero-Persistence** lifecycle:

```
User clicks download
    → Backend generates PDF in memory (ByteArray)
    → HTTP response streams PDF to browser
    → No file is written to disk
    → No cleanup needed
```

**No PDF file shall be persisted on the server filesystem.**

## 2. Current State Audit

| Endpoint | Behavior | Disk Write | Cleanup | Status |
|---|---|---|---|---|
| `GET /vma/clinical-cases/{id}/pdf` | In-memory `ByteArray` → stream | ❌ None | N/A | ✅ Compliant |
| `POST /vma/inventory-transactions/receive-from-china` | In-memory `ByteArray` → stream | ❌ None | N/A | ✅ Compliant |
| `GET /vma/inventory-transactions/receive-pdf/{id}` | In-memory `ByteArray` → stream | ❌ None | N/A | ✅ Compliant |
| `POST /vma/training-records/smart-fill` | DB writes only, no PDF | ❌ None | N/A | ✅ Compliant |
| `GET /vma/training-sessions/{trainingNo}/pdf` | On-the-fly `ByteArray` → stream | ❌ None | N/A | ✅ Compliant |

## 3. Required Changes

### 3.1 `VmaSmartFillService.smartFill()`

**Current**: Generates PDFs → calls `savePdf()` to write individual + merged PDF to `generated-pdfs/` → returns JSON with `downloadUrl` pointing to static file.

**Target**: Generates merged PDF in memory → returns PDF `ByteArray` directly in HTTP response (like clinical case endpoint).

**Design Decision**: The smart-fill response changes from a 2-step flow (JSON → separate download) to a single-step flow (direct PDF blob response). The frontend will receive the PDF blob directly from the POST response.

### 3.2 `VmaTrainingController.downloadPdf()`

**Current**: Reads pre-saved PDF from `generated-pdfs/` directory (V3 or V2 fallback).

**Target**: Receives session identifier → regenerates PDF on-the-fly from database → streams response. OR: Remove this endpoint entirely if smart-fill returns PDF directly.

### 3.3 `VmaPdfGeneratorService.savePdf()`

**Target**: Deprecate and remove. All callers must use in-memory `ByteArray` only.

### 3.4 `generated-pdfs/` Directory

**Target**: Remove directory creation in `VmaPdfGeneratorService.init {}`. Clean up any existing files.

## 4. Frontend Impact

### Training Smart Fill (`/vma/training/page.tsx`)

**Current flow**:
```
POST /smart-fill → JSON { downloadUrl: "/vma/training-records/download/xyz.pdf" }
User clicks "Download" → GET /training-records/download/xyz.pdf → PDF blob
```

**New flow**:
```
POST /smart-fill → response includes both session summary JSON AND triggers PDF download
```

**Implementation**: Smart-fill returns JSON with sessions info. A separate "Download All" action calls a new endpoint that regenerates the merged PDF on-the-fly.

### Training Records (`/vma/training-records/page.tsx`)

**Current flow**:
```
Click download → GET /training-records/download/training_{trainingNo}.pdf → static file
```

**New flow**:
```
Click download → GET /training-records/{trainingNo}/pdf → on-the-fly generation → PDF blob
```

## 5. Files to Modify

| File | Action |
|---|---|
| `VmaSmartFillService.kt` | Remove `savePdf()` calls, return session summary only |
| `VmaTrainingController.kt` | Replace `downloadPdf()` with on-the-fly generation endpoint |
| `VmaPdfGeneratorService.kt` | Remove `savePdf()` method and `outputDir` / `init {}` block |
| `training/page.tsx` | Update smart-fill response handling |
| `training-records/page.tsx` | Update download URL to new endpoint |

## 6. Acceptance Criteria

- [x] No PDF file is ever written to disk
- [x] All PDF downloads work correctly from the browser
- [x] `generated-pdfs/` directory is no longer created or referenced
- [x] Smart Fill generates training records AND user can download PDF
- [x] Individual training record PDF download works on-the-fly
- [x] All existing compliant endpoints remain unchanged
