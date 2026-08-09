import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PasswordHashService } from '../../domain/services/password-hash.service';

/** Argon2id com parâmetros do P7 (INCONSISTENCIAS): memoryCost ~64 MB, timeCost 3. */
@Injectable()
export class Argon2PasswordHashService extends PasswordHashService {
  private readonly options: argon2.HashOptions = {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  };

  async hash(password: string): Promise<string> {
    return argon2.hash(password, this.options);
  }

  async verify(password: string, hash: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }
}
