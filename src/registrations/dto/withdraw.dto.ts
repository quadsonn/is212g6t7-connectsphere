import { Equals } from 'class-validator';

/**
 * US-36 AC-2 — withdrawal needs an explicit confirmation. The client shows
 * the prompt; cancelling it simply sends nothing, and a request without
 * `confirm: true` is refused, so the registration cannot be withdrawn by
 * accident.
 */
export class WithdrawDto {
  @Equals(true, { message: 'withdrawal must be confirmed (confirm: true)' })
  confirm: boolean;
}
