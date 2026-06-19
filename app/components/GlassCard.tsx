/**
 * GlassCard — Frosted glass card component
 * Core reusable container for the Palmi design system.
 * Glassmorphism: translucent background + blur + subtle border glow.
 */

import React from 'react';
import { StyleSheet, View, ViewProps } from 'react-native';
import { BlurView } from 'expo-blur';
import { Colors, BorderRadius, Spacing, Shadows } from '../constants/theme';

interface GlassCardProps extends ViewProps {
  /** Intensity of the blur effect (0-100) */
  intensity?: number;
  /** Whether to show the purple glow border */
  glowing?: boolean;
  /** Custom padding override */
  padding?: number;
  /** Test ID for accessibility */
  testID?: string;
}

export function GlassCard({
  children,
  intensity = 40,
  glowing = false,
  padding = Spacing.lg,
  style,
  testID,
  ...props
}: GlassCardProps) {
  return (
    <View
      testID={testID}
      style={[
        styles.container,
        glowing && styles.glowing,
        { padding },
        style,
      ]}
      {...props}
    >
      <BlurView
        intensity={intensity}
        tint="dark"
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.backgroundCard,
    borderWidth: 1,
    borderColor: Colors.borderCard,
    ...Shadows.card,
  },
  glowing: {
    borderColor: Colors.borderFocused,
    ...Shadows.glow,
  },
  content: {
    position: 'relative',
    zIndex: 1,
  },
});
