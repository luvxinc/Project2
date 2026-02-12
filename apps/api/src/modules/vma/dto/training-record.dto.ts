import { IsString, IsOptional, IsInt, IsDateString } from 'class-validator';

export class CreateTrainingRecordDto {
  @IsString()
  employeeNo: string;

  @IsString()
  sopNo: string;

  @IsString()
  sopVersion: string;

  @IsOptional()
  @IsDateString()
  completedAt?: string;

  @IsOptional()
  @IsString()
  trainerId?: string;

  @IsDateString()
  trainingDate: string;

  @IsOptional()
  @IsString()
  trainingNo?: string;

  @IsOptional()
  @IsString()
  trainingLocation?: string;

  @IsOptional()
  @IsInt()
  trainingDuration?: number;
}

export class UpdateTrainingRecordDto {
  @IsOptional()
  @IsDateString()
  completedAt?: string;

  @IsOptional()
  @IsString()
  trainerId?: string;

  @IsOptional()
  @IsDateString()
  trainingDate?: string;

  @IsOptional()
  @IsString()
  trainingNo?: string;

  @IsOptional()
  @IsString()
  trainingLocation?: string;

  @IsOptional()
  @IsInt()
  trainingDuration?: number;
}
