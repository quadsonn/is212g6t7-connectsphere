import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

/** Columns a caller may sort the catalogue by. */
export enum VenueSortField {
  NAME = 'name',
  CAPACITY = 'capacity',
  LOCATION = 'location',
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

/**
 * US-15 AC-3 — locating one venue without scrolling the whole list.
 *
 * AMBIGUOUS: the AC asks for "sorting or basic name lookup"; both are provided
 * since neither alone covers browsing well. Deliberately NOT included:
 *
 *  - Pagination. No AC calls for it and the catalogue is small, but it is the
 *    obvious next need — see the US-15 summary.
 *  - Filtering by capacity, layout or accessibility. That is venue
 *    *suitability* matching, which is a later story, not browsing.
 */
export class BrowseVenuesDto {
  /**
   * Case-insensitive substring match on the venue name.
   *
   * AMBIGUOUS: name only, as the AC says "name lookup". Searching location
   * too would be a small change, but it is a change in what the customer
   * asked for.
   */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  search?: string;

  @IsOptional()
  @IsEnum(VenueSortField, {
    message: `sortBy must be one of: ${Object.values(VenueSortField).join(', ')}`,
  })
  sortBy?: VenueSortField;

  @IsOptional()
  @IsEnum(SortOrder, { message: 'sortOrder must be asc or desc' })
  sortOrder?: SortOrder;
}
