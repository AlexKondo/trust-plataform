/**
 * IP-012 — exceções de domínio do módulo Growth (Trust Points / Referral / Cashback).
 * Mesma convenção das demais IPs: exceção tipada, nunca `Error` genérico.
 */
export class GrowthValidationException extends Error {}

export class InsufficientPointsBalanceException extends GrowthValidationException {}

export class SelfReferralException extends GrowthValidationException {}

export class ReferralAlreadyAttributedException extends GrowthValidationException {}

export class CampaignNotActiveException extends GrowthValidationException {}
