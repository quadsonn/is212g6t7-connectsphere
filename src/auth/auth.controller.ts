import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuthService, JwtPayload } from './auth.service';
import { AuthenticatedUser } from './jwt.strategy';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';

/**
 * E1 — US-01. Endpoints per CLAUDE.md §7.
 *
 * No business logic here (CLAUDE.md §3.2): the controller only binds HTTP to
 * AuthService and declares which routes are protected.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto): Promise<LoginResponseDto> {
    return this.authService.login(dto);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    const payload: JwtPayload = {
      sub: user.userId,
      role: user.role,
      jti: user.jti,
      exp: user.exp,
    };
    return this.authService.logout(payload);
  }

  /**
   * A protected route, used to demonstrate AC-3 and AC-4. Kept in the auth
   * module so US-01 does not reach into other modules.
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}
