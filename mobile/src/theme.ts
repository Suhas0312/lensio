/**
 * Lensio design tokens, derived from the logo:
 * a deep navy field, and the eye's cyan → violet → magenta gradient.
 * The gradient is used sparingly: primary actions and progress only.
 */
export const colors = {
  night: '#040722',      // logo background
  surface: '#0C1138',
  raised: '#151B4D',
  line: '#242B66',
  text: '#F3F4FF',
  muted: '#9CA2CE',
  faint: '#6A70A0',
  cyan: '#08B9DB',
  violet: '#7B61FF',
  magenta: '#C94EF2',
  success: '#3DD68C',
  warning: '#FFB547',
  danger: '#FF5C7A',
};

export const gradient = [colors.cyan, colors.violet, colors.magenta] as const;

export const font = {
  regular: 'Quicksand_500Medium',
  semibold: 'Quicksand_600SemiBold',
  bold: 'Quicksand_700Bold',
};

/** Modular scale, ratio 1.2 from 15px body. */
export const type = {
  caption: { fontFamily: font.semibold, fontSize: 12.5, lineHeight: 17 },
  body: { fontFamily: font.regular, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: font.bold, fontSize: 15, lineHeight: 22 },
  title: { fontFamily: font.bold, fontSize: 18, lineHeight: 24 },
  heading: { fontFamily: font.bold, fontSize: 22, lineHeight: 28 },
  display: { fontFamily: font.bold, fontSize: 31, lineHeight: 36, letterSpacing: -0.4 },
};

export const space = (n: number) => n * 4;
export const radius = { sm: 10, md: 16, lg: 24, pill: 999 };
