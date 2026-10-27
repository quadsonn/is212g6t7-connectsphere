import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';

import { AuthenticatedUser } from '../auth/jwt.strategy';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { EquipmentSubstitutionsService } from './equipment-substitutions.service';

/**
 * The Event Coordinator's answer to Technical Support's proposal for equipment
 * their CONFIRMED event lost. Only the event's own Coordinator may decide;
 * anyone else reads as "not found".
 */
@Controller('equipment-substitutions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EquipmentSubstitutionsController {
  constructor(private readonly substitutions: EquipmentSubstitutionsService) {}

  /** The reservation moves to the alternative. 409 if it no longer fits. */
  @Post(':id/accept')
  @Roles(Role.EVENT_COORDINATOR)
  @HttpCode(HttpStatus.OK)
  accept(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.substitutions.accept(user, id);
  }

  /** Acknowledges the problem; the event goes on. Final. */
  @Post(':id/decline')
  @Roles(Role.EVENT_COORDINATOR)
  @HttpCode(HttpStatus.OK)
  decline(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.substitutions.decline(user, id);
  }
}
