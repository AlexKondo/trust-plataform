import type { Messages } from './pt-BR';

/**
 * IP-002 — secondary test locale (en-US), proving the catalog architecture
 * end to end. `satisfies Messages` makes a missing/extra key a TypeScript
 * error at compile time — the two catalogs can never silently drift apart.
 * Canonical brand vocabulary (Trust Member, Trust Score, Trust Passport, ...)
 * is intentionally NOT part of this catalog: those identifiers stay
 * language-neutral per 04_APPROVED_PRODUCT_DECISIONS.
 */
export const messages = {
  nav: {
    home: 'Home',
    trustScore: 'Trust Score',
    trustPassport: 'Trust Passport',
    verifications: 'Verifications',
    marketplace: 'Marketplace',
    conversations: 'Conversations',
    orders: 'Orders',
    moderation: 'Moderation',
    settings: 'Settings',
    logout: 'Log out',
  },
  common: {
    save: 'Save',
    cancel: 'Cancel',
    loading: 'Loading...',
    genericError: 'Something went wrong. Please try again.',
  },
  settings: {
    sectionTitle: 'Language',
    sectionDescription: 'Choose which language you want to see the platform in.',
    pageTitle: 'Language',
    pageSubtitle: 'Your preference is saved to your account and applies on any device.',
    current: 'Current language',
    savedMessage: 'Language updated.',
    errorMessage: 'Could not save the language right now.',
  },
  levels: {
    UNVERIFIED: 'Unverified',
    BRONZE: 'Bronze',
    SILVER: 'Silver',
    GOLD: 'Gold',
    PLATINUM: 'Platinum',
  },
  orderStatus: {
    CREATED: 'Created',
    AWAITING_SCHEDULING: 'Awaiting scheduling',
    SCHEDULED: 'Scheduled',
    AWAITING_EXECUTION: 'Awaiting execution',
    IN_PROGRESS: 'In progress',
    AWAITING_CUSTOMER_CONFIRMATION: 'Awaiting your confirmation',
    CUSTOMER_CONFIRMED: 'Confirmed by customer',
    COMPLETED: 'Completed',
    CLOSED: 'Closed',
    CANCELLED: 'Cancelled',
    DISPUTE_OPEN: 'In dispute',
    DISPUTE_RESOLVED: 'Dispute resolved',
    REFUNDED: 'Refunded',
  },
} satisfies Messages;
