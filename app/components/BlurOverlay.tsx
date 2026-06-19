/**
 * BlurOverlay — Premium content blur + unlock prompt
 * Covers pro-only content with a frosted glass effect and CTA button.
 */

import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { BlurView } from 'expo-blur';
import { Colors, Fonts, Spacing, BorderRadius } from '../constants/theme';
import { Pricing } from '../constants/config';

interface BlurOverlayProps {
  /** Text shown above the unlock button */
  title?: string;
  /** CTA button text */
  buttonText?: string;
  /** Called when unlock button is pressed */
  onUnlock: () => void;
}

export function BlurOverlay({
  title = 'Your life line is hidden 👀',
  buttonText = `Reveal It — ${Pricing.trialCopy}`,
  onUnlock,
}: BlurOverlayProps) {
  return (
    <View style={styles.container} testID="blur-overlay">
      <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.content}>
        <Text style={styles.lockIcon}>🔮</Text>
        <Text style={styles.title}>{title}</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={onUnlock}
          activeOpacity={0.8}
          testID="blur-overlay-unlock-btn"
        >
          <Text style={styles.buttonText}>{buttonText}</Text>
        </TouchableOpacity>
        <Text style={styles.caption}>Then {Pricing.priceCopy} · {Pricing.coffeeFrame} · cancel anytime</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  lockIcon: {
    fontSize: 48,
    marginBottom: Spacing.md,
  },
  title: {
    fontFamily: Fonts.ui.semiBold,
    fontSize: Fonts.sizes.title,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  button: {
    backgroundColor: Colors.purple,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.full,
    minWidth: 220,
    alignItems: 'center',
    shadowColor: Colors.purple,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
  },
  buttonText: {
    fontFamily: Fonts.ui.bold,
    fontSize: Fonts.sizes.bodyLarge,
    color: Colors.textPrimary,
  },
  caption: {
    fontFamily: Fonts.ui.regular,
    fontSize: Fonts.sizes.caption,
    color: Colors.textTertiary,
    marginTop: Spacing.sm,
  },
});
