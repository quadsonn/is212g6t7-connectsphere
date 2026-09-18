import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class LoginDto {
  @IsEmail({}, { message: 'email must be a valid email address' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email: string;

  // Deliberately no length/complexity rules on login: those belong to
  // registration. Rejecting a short password here would tell an attacker the
  // password policy, and a valid-but-legacy password must still be able to
  // sign in.
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  password: string;
}
