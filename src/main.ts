import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { UnauthorizedFilter } from './common/filters/unauthorized.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );
  app.useGlobalFilters(new UnauthorizedFilter());
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
