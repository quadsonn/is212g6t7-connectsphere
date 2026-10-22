import { Controller, Get, Header, Param, Patch, Query, UseGuards } from '@nestjs/common';

import { AuthenticatedUser } from '../auth/jwt.strategy';
import { Action, Resource } from '../common/access/permission.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import { NotificationsInboxService } from './notifications-inbox.service';

/**
 * Notifications page — the logged-in user's own notifications. Every role
 * holds NOTIFICATION / READ at OWN scope; the service scopes every query to
 * the caller. Literal routes are declared before `:id`.
 */
@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationsController {
  constructor(private readonly inbox: NotificationsInboxService) {}

  /** The caller's notifications, newest first; `?limit=&cursor=` pages (US-40). */
  @Get()
  @RequirePermission(Resource.NOTIFICATION, Action.READ)
  @Header('Cache-Control', 'no-store')
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListNotificationsDto) {
    return this.inbox.list(user, query);
  }

  /** The bell's unread count. */
  @Get('unread-count')
  @RequirePermission(Resource.NOTIFICATION, Action.READ)
  @Header('Cache-Control', 'no-store')
  unreadCount(@CurrentUser() user: AuthenticatedUser) {
    return this.inbox.unreadCount(user);
  }

  /** Mark all of the caller's notifications read. */
  @Patch('read-all')
  @RequirePermission(Resource.NOTIFICATION, Action.READ)
  markAllRead(@CurrentUser() user: AuthenticatedUser) {
    return this.inbox.markAllRead(user);
  }

  /** Mark one of the caller's notifications unread again. */
  @Patch(':id/unread')
  @RequirePermission(Resource.NOTIFICATION, Action.READ)
  markUnread(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.inbox.markUnread(user, id);
  }

  /** Mark one of the caller's notifications read. */
  @Patch(':id/read')
  @RequirePermission(Resource.NOTIFICATION, Action.READ)
  markRead(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.inbox.markRead(user, id);
  }
}
