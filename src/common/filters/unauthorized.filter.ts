import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  UnauthorizedException,
} from '@nestjs/common';
import { Response } from 'express';

/**
 * AC-8: "denied and redirected to login".
 *
 * A REST API cannot redirect a programmatic client, so the server denies with
 * 401 and tells the caller where to authenticate — via the standard
 * WWW-Authenticate header and a loginUrl in the body. Performing the redirect
 * is the frontend's job; this makes the instruction explicit rather than
 * implied. AMBIGUOUS — see the note in the US-02 summary.
 */
@Catch(UnauthorizedException)
export class UnauthorizedFilter implements ExceptionFilter {
  catch(exception: UnauthorizedException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const body = exception.getResponse();

    response
      .status(401)
      .setHeader('WWW-Authenticate', 'Bearer realm="connectsphere"')
      .json({
        ...(typeof body === 'string' ? { message: body } : body),
        loginUrl: '/auth/login',
      });
  }
}
