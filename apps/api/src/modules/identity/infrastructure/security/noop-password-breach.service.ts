import { Injectable } from '@nestjs/common';
import { PasswordBreachService } from '../../domain/services/password-breach.service';

/** Usado quando PASSWORD_BREACH_CHECK_ENABLED=false (testes/offline). */
@Injectable()
export class NoopPasswordBreachService extends PasswordBreachService {
  isBreached(): Promise<boolean> {
    return Promise.resolve(false);
  }
}
