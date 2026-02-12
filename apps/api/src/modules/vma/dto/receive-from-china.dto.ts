import { IsString, IsOptional, IsArray, ValidateNested, IsNumber, IsEnum, Min } from 'class-validator';
import { Type } from 'class-transformer';

export enum ProductType {
  PVALVE = 'PVALVE',
  DELIVERY_SYSTEM = 'DELIVERY_SYSTEM',
}

export enum InspectionResult {
  ACCEPT = 'ACCEPT',
  REJECT = 'REJECT',
}

/**
 * 9 conditional inspection items — indices match PDF checkbox pairs.
 * If an item index is present in the array, that item FAILED inspection.
 */
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

/** One product line in the receiving modal */
export class ReceiveProductLineDto {
  @IsEnum(ProductType)
  productType: ProductType;

  @IsString()
  productModel: string; // specification

  @IsString()
  serialNo: string;

  @IsNumber()
  @Min(1)
  qty: number;

  @IsEnum(InspectionResult)
  productCondition: InspectionResult;

  /** Indices (0-8) of failed conditional notes items */
  @IsArray()
  failedNoteIndices: number[];

  @IsEnum(InspectionResult)
  result: InspectionResult;

  @IsString()
  inspectionBy: string;

  @IsOptional()
  @IsString()
  expDate?: string; // YYYY-MM-DD
}

/** Full payload from the Receive from China modal */
export class ReceiveFromChinaDto {
  @IsString()
  batchNo: string;

  @IsOptional()
  @IsString()
  poNo?: string;

  @IsString()
  dateShipped: string; // YYYY-MM-DD

  @IsString()
  dateTimeReceived: string; // YYYY-MM-DD HH:MM PST

  @IsString()
  operator: string;

  @IsOptional()
  @IsString()
  comments?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiveProductLineDto)
  products: ReceiveProductLineDto[];
}
