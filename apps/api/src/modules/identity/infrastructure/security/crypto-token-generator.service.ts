import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import {
  GeneratedToken,
  TokenGeneratorService,
} from '../../domain/services/token-generator.service';

/** Tokens de 256 bits (base64url) com persistência apenas do SHA-256 (P7/DOC-002). */
@Injectable()
export class CryptoTokenGeneratorService extends TokenGeneratorService {
  generate(): GeneratedToken {
    const token = randomBytes(32).toString('base64url');
    return { token, tokenHash: this.hash(token) };
  }

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
