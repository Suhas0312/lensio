import { Image, ImageStyle, StyleProp } from 'react-native';

// Extracted from the brand artwork by scripts/extract_logo.py (transparent PNGs, @3x).
const SRC = {
  mark: require('../../assets/brand/mark.png'),          // eye symbol
  wordmark: require('../../assets/brand/wordmark.png'),  // "Lensio"
  lockup: require('../../assets/brand/lockup.png'),      // eye + wordmark + tagline
  tagline: require('../../assets/brand/tagline.png'),    // "Your lens Our world"
};
const RATIO = { mark: 1044 / 759, wordmark: 1719 / 483, lockup: 1719 / 1461, tagline: 1293 / 144 };

/** Brand logo. Designed for dark backgrounds only: the wordmark is white. */
export function Logo({ variant = 'wordmark', height = 28, style }: { variant?: keyof typeof SRC; height?: number; style?: StyleProp<ImageStyle> }) {
  return (
    <Image
      source={SRC[variant]}
      style={[{ height, width: height * RATIO[variant] }, style]}
      resizeMode="contain"
      accessibilityRole="image"
      accessibilityLabel="Lensio"
    />
  );
}
