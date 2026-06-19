/**
 * Palmi Design System — Theme Tokens
 * Dark mode only. Gen-Z spiritual aesthetic.
 */

export const Colors = {
  // Backgrounds
  background: '#0A0A0F',
  backgroundElevated: '#12121A',
  backgroundCard: 'rgba(255, 255, 255, 0.06)',

  // Accents
  purple: '#845EF7',
  purpleLight: '#A78BFA',
  purpleDark: '#6C3FD1',
  purpleGlow: 'rgba(132, 94, 247, 0.3)',
  gold: '#F7C948',
  goldLight: '#FBBF24',
  goldDark: '#D4A017',

  // Semantic
  success: '#51CF66',
  warning: '#FF922B',
  error: '#FF6B6B',

  // Text
  textPrimary: '#FFFFFF',
  textSecondary: 'rgba(255, 255, 255, 0.6)',
  textTertiary: 'rgba(255, 255, 255, 0.35)',
  textAccent: '#845EF7',

  // Borders
  borderCard: 'rgba(255, 255, 255, 0.08)',
  borderFocused: 'rgba(132, 94, 247, 0.5)',
  borderSubtle: 'rgba(255, 255, 255, 0.04)',

  // Scan animation
  scanLine: '#845EF7',
  scanGlow: 'rgba(132, 94, 247, 0.6)',
  scanParticle: '#A78BFA',

  // Compatibility
  compatHigh: '#51CF66',
  compatMedium: '#F7C948',
  compatLow: '#FF6B6B',
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
} as const;

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const Fonts = {
  // UI Font — Space Grotesk
  ui: {
    regular: 'SpaceGrotesk_400Regular',
    medium: 'SpaceGrotesk_500Medium',
    semiBold: 'SpaceGrotesk_600SemiBold',
    bold: 'SpaceGrotesk_700Bold',
  },
  // Reading Font — DM Serif Display
  reading: {
    regular: 'DMSerifDisplay_400Regular',
  },
  sizes: {
    caption: 12,
    body: 14,
    bodyLarge: 16,
    subtitle: 18,
    title: 22,
    heading: 28,
    display: 36,
    hero: 48,
  },
} as const;

export const Shadows = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  glow: {
    shadowColor: Colors.purple,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 12,
  },
  subtle: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
} as const;

export const Animation = {
  spring: {
    damping: 15,
    stiffness: 150,
    mass: 1,
  },
  springBouncy: {
    damping: 10,
    stiffness: 200,
    mass: 0.8,
  },
  timing: {
    fast: 200,
    normal: 300,
    slow: 500,
    reveal: 800,
  },
  stagger: 100, // ms between staggered items
} as const;

// Archetype emojis — used as design elements
export const Archetypes = {
  empath: { emoji: '🌙', label: 'The Empath' },
  guardian: { emoji: '🛡️', label: 'The Guardian' },
  wildCard: { emoji: '♠️', label: 'The Wild Card' },
  healer: { emoji: '💫', label: 'The Healer' },
  visionary: { emoji: '🔥', label: 'The Visionary' },
  seeker: { emoji: '🌊', label: 'The Seeker' },
} as const;
