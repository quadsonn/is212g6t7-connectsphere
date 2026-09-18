import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsPositive, IsString, MaxLength } from 'class-validator';

/**
 * US-13 AC-3 — what a venue must have before it can be published.
 *
 * A stored draft is validated against this class, the same way an event draft
 * is validated against CreateEventRequestDto before submission (US-04). One
 * definition of "publishable", checked in one place.
 *
 * AMBIGUOUS: AC-3 says "all required fields (e.g. name, capacity)" without
 * giving the full list. Name, location and capacity are required — a venue
 * cannot be found or matched without them. Facilities, accessibility features,
 * supported layouts and operating hours stay optional: a venue may genuinely
 * have none recorded, and blocking publication on an empty list would be
 * inventing a rule.
 */
export class PublishableVenueDto {
  @IsString()
  @IsNotEmpty({ message: 'name is required before publishing' })
  @MaxLength(200)
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'location is required before publishing' })
  @MaxLength(300)
  location: string;

  @IsInt({ message: 'capacity is required before publishing' })
  @IsPositive({ message: 'capacity must be greater than zero' })
  @Type(() => Number)
  capacity: number;
}
