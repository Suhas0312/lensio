import { Platform, useWindowDimensions } from 'react-native';

/** Whole-app width cap on big monitors, and a comfortable width for forms and reading pages. */
export const MAX_WEB_WIDTH = 100000; // no cap: the web app fills any monitor
export const READ_WIDTH = 760;
export const isWeb = Platform.OS === 'web';

const GAP = 12;

/**
 * Responsive layout: 2 frame columns on phones, 3–5 on tablets and computers.
 * Re-renders when the window is resized.
 */
export function useLayout() {
  const { width } = useWindowDimensions();
  const content = isWeb ? Math.min(width, MAX_WEB_WIDTH) : width;
  const cols = content >= 2200 ? 8 : content >= 1850 ? 7 : content >= 1500 ? 6 : content >= 1150 ? 5 : content >= 900 ? 4 : content >= 620 ? 3 : 2;
  const pad = content >= 1500 ? 40 : 20; // roomier margins on large monitors
  const cardW = Math.floor((content - pad * 2 - GAP * (cols - 1)) / cols);
  const readW = isWeb ? Math.min(content, READ_WIDTH) : content;
  return { width, content, cols, cardW, readW, pad, wide: content >= 900 };
}

/** Centres a column on the web; no effect on phones. */
export const webColumn = (max = READ_WIDTH) => (isWeb ? { width: '100%' as const, maxWidth: max, alignSelf: 'center' as const } : {});

/** @deprecated use useLayout() so layouts follow window resizes. */
export const screenWidth = () => (isWeb ? Math.min(typeof window !== 'undefined' ? window.innerWidth : 480, MAX_WEB_WIDTH) : 480);
