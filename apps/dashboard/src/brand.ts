/** Product branding. Change here to rebrand the dashboard. */
export const BRAND = {
  name: 'mymorphix Mailer',
  shortName: 'Mailer',
} as const;

/** Sets the browser tab title for a page. */
export const pageTitle = (title?: string): string => (title ? `${title} · ${BRAND.name}` : BRAND.name);

/** Replaces the internal placeholder product name used in shared docs. */
export const brandText = (text: string): string => text.replace(/MAIL_PLATFORM/g, BRAND.name);
