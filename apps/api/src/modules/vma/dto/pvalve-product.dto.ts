import { IsString, IsOptional, IsNumber, IsBoolean, IsArray } from 'class-validator';

// ================================
// P-Valve Product DTOs
// ================================

export class CreatePValveProductDto {
  @IsString()
  model: string;

  @IsString()
  specification: string;

  @IsOptional()
  @IsNumber()
  diameterA?: number;

  @IsOptional()
  @IsNumber()
  diameterB?: number;

  @IsOptional()
  @IsNumber()
  diameterC?: number;

  @IsOptional()
  @IsNumber()
  expandedLengthD?: number;

  @IsOptional()
  @IsNumber()
  expandedLengthE?: number;

  @IsOptional()
  @IsNumber()
  crimpedTotalLength?: number;
}

export class UpdatePValveProductDto {
  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsNumber()
  diameterA?: number;

  @IsOptional()
  @IsNumber()
  diameterB?: number;

  @IsOptional()
  @IsNumber()
  diameterC?: number;

  @IsOptional()
  @IsNumber()
  expandedLengthD?: number;

  @IsOptional()
  @IsNumber()
  expandedLengthE?: number;

  @IsOptional()
  @IsNumber()
  crimpedTotalLength?: number;
}

// ================================
// Delivery System Product DTOs
// ================================

export class CreateDeliverySystemProductDto {
  @IsString()
  model: string;

  @IsString()
  specification: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fitPValveSpecs?: string[]; // P-Valve specification codes this DS fits
}

export class UpdateDeliverySystemProductDto {
  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fitPValveSpecs?: string[]; // Replace all fit relationships
}

// ================================
// Fit Relationship DTO
// ================================

export class UpdateFitRelationshipDto {
  @IsString()
  deliverySystemSpec: string;

  @IsArray()
  @IsString({ each: true })
  pvalveSpecs: string[];
}
