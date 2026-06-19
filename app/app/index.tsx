/**
 * Splash / Onboarding Screen
 * First screen users see. Animated Palmi logo + "Scan Your Palm" CTA.
 * If user is already onboarded, shows quick entry to camera.
 */

import React, { useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSpring,
  Easing,
  FadeIn,
  FadeInDown,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Colors, Fonts, Spacing, BorderRadius, Shadows, Animation } from '../constants/theme';
import { useUserStore } from '../stores/userStore';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function SplashScreen() {
  const router = useRouter();
  const { isOnboarded, setOnboarded } = useUserStore();

  const logoOpacity = useSharedValue(0);
  const logoScale = useSharedValue(0.8);
  const subtitleOpacity = useSharedValue(0);
  const ctaOpacity = useSharedValue(0);
  const ctaTranslateY = useSharedValue(30);

  useEffect(() => {
    // Staggered entrance animation
    logoOpacity.value = withTiming(1, { duration: 800 });
    logoScale.value = withSpring(1, Animation.spring);

    subtitleOpacity.value = withDelay(
      600,
      withTiming(1, { duration: 600 })
    );

    ctaOpacity.value = withDelay(
      1000,
      withTiming(1, { duration: 500 })
    );
    ctaTranslateY.value = withDelay(
      1000,
      withSpring(0, Animation.spring)
    );
  }, []);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));

  const subtitleStyle = useAnimatedStyle(() => ({
    opacity: subtitleOpacity.value,
  }));

  const ctaStyle = useAnimatedStyle(() => ({
    opacity: ctaOpacity.value,
    transform: [{ translateY: ctaTranslateY.value }],
  }));

  const handleStart = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setOnboarded(true);
    router.push('/capture');
  };

  return (
    <View style={styles.container} testID="splash-screen">
      {/* Background gradient effect */}
      <View style={styles.glowOrb} />

      {/* Logo area */}
      <Animated.View style={[styles.logoContainer, logoStyle]}>
        <Text style={styles.palmEmoji}>✋</Text>
        <Text style={styles.logoText}>palmi</Text>
      </Animated.View>

      {/* Subtitle */}
      <Animated.View style={[styles.subtitleContainer, subtitleStyle]}>
        <Text style={styles.subtitle}>what does your palm already know about you?</Text>
      </Animated.View>

      {/* CTA */}
      <Animated.View style={[styles.ctaContainer, ctaStyle]}>
        <TouchableOpacity
          style={styles.ctaButton}
          onPress={handleStart}
          activeOpacity={0.85}
          testID="start-scan-btn"
        >
          <Text style={styles.ctaText}>Read My Palm ✋</Text>
        </TouchableOpacity>

        <Text style={styles.disclaimer}>
          Real AI palm analysis · takes 10 seconds
        </Text>
      </Animated.View>

      {/* Settings gear */}
      <TouchableOpacity
        style={styles.settingsBtn}
        onPress={() => router.push('/settings')}
        testID="settings-btn"
      >
        <Text style={styles.settingsIcon}>⚙️</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  glowOrb: {
    position: 'absolute',
    top: SCREEN_HEIGHT * 0.15,
    width: SCREEN_WIDTH * 0.8,
    height: SCREEN_WIDTH * 0.8,
    borderRadius: SCREEN_WIDTH * 0.4,
    backgroundColor: Colors.purpleGlow,
    opacity: 0.15,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  palmEmoji: {
    fontSize: 72,
    marginBottom: Spacing.md,
  },
  logoText: {
    fontFamily: Fonts.ui.bold,
    fontSize: Fonts.sizes.hero,
    color: Colors.textPrimary,
    letterSpacing: -1,
  },
  subtitleContainer: {
    marginBottom: Spacing.xxxl,
  },
  subtitle: {
    fontFamily: Fonts.reading.regular,
    fontSize: Fonts.sizes.title,
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },
  ctaContainer: {
    position: 'absolute',
    bottom: SCREEN_HEIGHT * 0.12,
    alignItems: 'center',
    width: '100%',
  },
  ctaButton: {
    backgroundColor: Colors.purple,
    paddingVertical: Spacing.md + 2,
    paddingHorizontal: Spacing.xxxl,
    borderRadius: BorderRadius.full,
    minWidth: 240,
    alignItems: 'center',
    ...Shadows.glow,
  },
  ctaText: {
    fontFamily: Fonts.ui.bold,
    fontSize: Fonts.sizes.bodyLarge,
    color: Colors.textPrimary,
    letterSpacing: 0.5,
  },
  disclaimer: {
    fontFamily: Fonts.ui.regular,
    fontSize: Fonts.sizes.caption,
    color: Colors.textTertiary,
    marginTop: Spacing.md,
  },
  settingsBtn: {
    position: 'absolute',
    top: 60,
    right: 20,
    padding: Spacing.sm,
  },
  settingsIcon: {
    fontSize: 24,
  },
});
