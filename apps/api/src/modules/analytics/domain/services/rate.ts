/**
 * IP-020 — cálculo de taxa/conversão, isolado como função pura e testável.
 *
 * Toda taxa exposta pela API (conversão de funil, completude, cancelamento,
 * disputa, sucesso de pagamento, adoção) passa por esta função — nunca uma
 * divisão solta escrita duas vezes de formas ligeiramente diferentes. Não
 * lança para denominador zero (um período/segmento sem dados é uma
 * ocorrência normal em produção, não um erro) — devolve `null`, que o
 * cliente (API/UI) trata como "sem dados suficientes", nunca como `0%`
 * (0% e "sem dados" são fatos de negócio diferentes).
 */
export function calculateRate(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) {
    return null;
  }
  if (denominator <= 0) {
    return null;
  }
  if (numerator < 0) {
    return null;
  }
  return roundTo(numerator / denominator, 4);
}

/** Arredondamento decimal determinístico (evita ruído de ponto flutuante em relatórios). */
export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
