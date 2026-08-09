import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'trust:isPublic';

/**
 * Marca rota como pública (sem Bearer token). O padrão da plataforma é
 * fail secure: tudo exige autenticação, exceto o que declarar @Public().
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
