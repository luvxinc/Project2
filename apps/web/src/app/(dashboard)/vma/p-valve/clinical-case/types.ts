// ====== Clinical Case Types ======

export interface ClinicalCase {
  caseId: string;
  caseNo: string | null;
  siteId: string;
  patientId: string;
  caseDate: string;
  status: string;
  site?: { siteName: string };
  siteName: string;
}

export interface CaseTransaction {
  id: string;
  specNo: string;
  serialNo: string | null;
  qty: number;
  expDate: string | null;
  productType: string;
  batchNo: string | null;
}

export interface Site {
  siteId: string;
  siteName: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

export interface PickedProduct {
  serialNo: string;
  specNo: string;
  expDate: string;
  batchNo: string;
  qty: number;
}

export interface SpecOption {
  specification: string;
  model: string;
}

export interface DSOption {
  specification: string;
  model: string;
}

export interface LineItem {
  specNo: string;
  qty: number;
  picked: PickedProduct[];
  loading: boolean;
}

export interface CompletionItem {
  txnId: string;
  returned: boolean;
  accepted: boolean;
  returnCondition: number[];
  _dropdownOpen?: boolean;
}

export const CONDITIONAL_NOTES_ITEMS = [
  'Quantity received matches quantity shipped',
  'Packaging is in good condition and not damaged',
  'Sealing sticker is undamaged and remains hinged',
  'No strain or waterlogging',
  'No labels are missing or torn',
  'Printing is clear and no information missing',
  'No additional external labels',
  'Products are still within the expiration date',
  'Temperature displayed as "OK" and is not triggered',
];
