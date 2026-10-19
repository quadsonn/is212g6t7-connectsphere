import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

import { INBOX_LIMIT } from '../notifications-inbox.service';

/** US-40 — GET /notifications paging. Both optional: no query is the first page. */
export class ListNotificationsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit must be a whole number' })
  @Min(1, { message: 'limit must be at least 1' })
  @Max(INBOX_LIMIT, { message: `limit must be at most ${INBOX_LIMIT}` })
  limit?: number;

  /** The id of the last notification already shown. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  cursor?: string;
}
