import {
  IsString, IsOptional, IsInt, IsDateString, IsEnum, Min, IsArray,
} from 'class-validator';

export enum InventoryAction {
  REC_CN = 'REC_CN',
  REC_CASE = 'REC_CASE',
  OUT_CASE = 'OUT_CASE',
  OUT_CN = 'OUT_CN',
  USED_CASE = 'USED_CASE',
  MOVE_DEMO = 'MOVE_DEMO',
}

export enum ProductType {
  PVALVE = 'PVALVE',
  DELIVERY_SYSTEM = 'DELIVERY_SYSTEM',
}

export enum InspectionResult {
  ACCEPT = 'ACCEPT',
  REJECT = 'REJECT',
}

export class CreateInventoryTransactionDto {
  @IsDateString()
  date: string;

  @IsEnum(InventoryAction)
  action: InventoryAction;

  @IsOptional() @IsString()
  batchNo?: string;

  @IsEnum(ProductType)
  productType: ProductType;

  @IsString()
  specNo: string;

  @IsOptional() @IsString()
  serialNo?: string;

  @IsInt() @Min(1)
  qty: number;

  @IsOptional() @IsDateString()
  expDate?: string;

  @IsOptional() @IsEnum(InspectionResult)
  inspection?: InspectionResult;

  @IsOptional() @IsString()
  notes?: string;

  @IsOptional() @IsString()
  caseId?: string;

  @IsOptional() @IsString()
  operator?: string;

  @IsOptional() @IsString()
  location?: string;

  @IsOptional() @IsArray()
  condition?: number[];
}

export class UpdateInventoryTransactionDto {
  @IsOptional() @IsDateString()
  date?: string;

  @IsOptional() @IsEnum(InventoryAction)
  action?: InventoryAction;

  @IsOptional() @IsString()
  batchNo?: string;

  @IsOptional() @IsEnum(ProductType)
  productType?: ProductType;

  @IsOptional() @IsString()
  specNo?: string;

  @IsOptional() @IsString()
  serialNo?: string;

  @IsOptional() @IsInt() @Min(1)
  qty?: number;

  @IsOptional() @IsDateString()
  expDate?: string;

  @IsOptional() @IsEnum(InspectionResult)
  inspection?: InspectionResult;

  @IsOptional() @IsString()
  notes?: string;

  @IsOptional() @IsString()
  caseId?: string;

  @IsOptional() @IsString()
  operator?: string;

  @IsOptional() @IsString()
  location?: string;

  @IsOptional() @IsArray()
  condition?: number[];
}
