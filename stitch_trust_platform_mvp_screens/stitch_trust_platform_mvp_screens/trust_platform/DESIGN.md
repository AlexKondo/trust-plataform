---
name: Trust Platform
colors:
  surface: '#faf8ff'
  surface-dim: '#d2d9f4'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3ff'
  surface-container: '#eaedff'
  surface-container-high: '#e2e7ff'
  surface-container-highest: '#dae2fd'
  on-surface: '#131b2e'
  on-surface-variant: '#434655'
  inverse-surface: '#283044'
  inverse-on-surface: '#eef0ff'
  outline: '#747686'
  outline-variant: '#c4c5d7'
  surface-tint: '#2151da'
  primary: '#0037b0'
  on-primary: '#ffffff'
  primary-container: '#1d4ed8'
  on-primary-container: '#cad3ff'
  inverse-primary: '#b7c4ff'
  secondary: '#006a61'
  on-secondary: '#ffffff'
  secondary-container: '#86f2e4'
  on-secondary-container: '#006f66'
  tertiary: '#7f2500'
  on-tertiary: '#ffffff'
  tertiary-container: '#a73400'
  on-tertiary-container: '#ffc9b7'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dce1ff'
  primary-fixed-dim: '#b7c4ff'
  on-primary-fixed: '#001551'
  on-primary-fixed-variant: '#0039b5'
  secondary-fixed: '#89f5e7'
  secondary-fixed-dim: '#6bd8cb'
  on-secondary-fixed: '#00201d'
  on-secondary-fixed-variant: '#005049'
  tertiary-fixed: '#ffdbcf'
  tertiary-fixed-dim: '#ffb59c'
  on-tertiary-fixed: '#390c00'
  on-tertiary-fixed-variant: '#832700'
  background: '#faf8ff'
  on-background: '#131b2e'
  surface-variant: '#dae2fd'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 30px
    fontWeight: '700'
    lineHeight: 38px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-bold:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  button:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  container-max-width: 440px
  gutter: 1rem
  margin-mobile: 1.25rem
  stack-gap: 1.5rem
  section-padding: 2rem
---

## Brand & Style

This design system centers on a **Corporate Modern** aesthetic, prioritizing clarity, security, and precision. It is engineered to evoke feelings of reliability and institutional stability, specifically tailored for the fintech sector. 

The visual language is characterized by high-quality typography, intentional white space, and a rejection of decorative clutter. By using a minimalist approach with structured geometric elements, the UI remains functional and unobtrusive, ensuring that the user's focus is always on financial data and security status. The personality is professional, straightforward, and highly organized.

## Colors

The palette is anchored by a deep blue to establish authority and trust. A subtle teal accent is utilized sparingly to highlight success states or critical action paths without overwhelming the primary brand color. 

- **Primary (Deep Blue):** Used for primary buttons, active states, and the logo wordmark.
- **Secondary (Teal):** Used for security indicators (like the shield-check icon) and success notifications.
- **Neutrals:** A near-black text color ensures WCAG AA accessibility, while a very light gray is used for section backgrounds to create subtle visual separation from the white main surface.

## Typography

The design system utilizes **Inter** exclusively to leverage its systematic, utilitarian nature. The scale is designed for legibility on digital screens, with a slight negative letter-spacing on headlines to maintain a compact, premium feel.

All system text must be in **Brazilian Portuguese**.
- Use "Entrar" or "Acessar" for login actions.
- Use "Continuar" for primary form progression.
- Headlines should be concise and direct (e.g., "Verifique sua identidade").

## Layout & Spacing

The layout follows a **Fixed Grid** philosophy for the core application experience. The primary content is contained within a centered card with a maximum width of 440px to ensure focus and reduce eye strain.

- **Grid:** On desktop, the card is centered horizontally and vertically. 
- **Rhythm:** A 4px/8px incremental scale is used for all spacing.
- **Mobile:** The layout transitions to a fluid model with 20px (1.25rem) side margins. The card becomes full-width but maintains its internal padding.
- **Margins:** Generous white space (32px+) should surround the main card to emphasize the "clean" aesthetic.

## Elevation & Depth

Visual hierarchy is achieved through **Tonal Layers** combined with **Ambient Shadows**.

- **Shadows:** Use a single, highly diffused shadow for the main card: `0px 10px 25px -5px rgba(15, 23, 42, 0.08)`. This creates a sense of lift without appearing heavy or dated.
- **Outlines:** Use a subtle 1px border (`#E2E8F0`) on input fields and secondary containers to define boundaries against the light gray background sections.
- **Depth:** The background uses `#F8FAFC`, while the foreground cards and inputs use pure `#FFFFFF` to create a "floating" effect.

## Shapes

The shape language is consistently "Rounded". 

- **Containers:** The main card and input fields use a 12px (0.75rem) corner radius.
- **Buttons:** Follow the 12px radius to match the card and inputs, creating a cohesive "box-set" look.
- **Icons:** The shield-check logo should feature slightly rounded terminals to align with the UI components.

## Components

### Buttons
- **Primary:** Solid `#1D4ED8` with white text. Full-width inside forms. High-density padding (12px vertical).
- **Secondary:** Transparent background with a 1px border of `#E2E8F0` and `#0F172A` text.

### Input Fields
- **Default:** White background, `#E2E8F0` border, 12px radius. 
- **Focus:** 2px solid `#1D4ED8` border with no "glow" effect, just a crisp color change.
- **Labels:** Small, bolded near-black text sitting directly above the input.

### The Card
- The main container for all workflows. It must contain the logo and wordmark at the top center.
- Internal padding should be a minimum of 32px (2rem) to maintain the "generous white space" requirement.

### Branding Elements
- **Wordmark:** "Trust Platform" in Inter Bold, `#1D4ED8`.
- **Logo:** A minimalist shield with a checkmark inside, colored in `#0D9488` (Teal), positioned above or to the left of the wordmark.