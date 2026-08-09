import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AppConfigModule } from '../config/app-config.module';
import { AppConfigService } from '../config/app-config.service';
import { JwtTokenService, JWT_ISSUER } from './jwt-token.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        privateKey: config.jwtPrivateKeyPem,
        publicKey: config.jwtPublicKeyPem,
        signOptions: { algorithm: 'ES256', issuer: JWT_ISSUER },
        verifyOptions: { algorithms: ['ES256'], issuer: JWT_ISSUER },
      }),
    }),
  ],
  providers: [JwtTokenService, JwtAuthGuard],
  exports: [JwtTokenService, JwtAuthGuard],
})
export class SecurityModule {}
