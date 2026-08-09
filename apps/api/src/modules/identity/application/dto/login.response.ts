export interface LoginResponse {
  accessToken: string;
  /** Token opaco de 256 bits (não JWT — decisão P7); rotacionado a cada refresh. */
  refreshToken: string;
  /** Segundos até o access token expirar (900 = 15 min). */
  expiresIn: number;
}
