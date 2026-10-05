import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

/** Columns a caller may sort the catalogue by. */
export enum EquipmentSortField {
  TYPE = 'type',
  LOCATION = 'location',
  TOTAL_QUANTITY = 'totalQuantity',
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

/**
 * US-29 AC-3 — locating an item without scrolling the whole list, "e.g. via
 * sorting or lookup by type". Both are provided, mirroring BrowseVenuesDto.
 */
export class BrowseEquipmentDto {
  /** Case-insensitive substring match on the equipment type. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  search?: string;

  @IsOptional()
  @IsEnum(EquipmentSortField, {
    message: `sortBy must be one of: ${Object.values(EquipmentSortField).join(', ')}`,
  })
  sortBy?: EquipmentSortField;

  @IsOptional()
  @IsEnum(SortOrder, { message: 'sortOrder must be asc or desc' })
  sortOrder?: SortOrder;
}
