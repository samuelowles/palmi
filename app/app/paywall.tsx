/**
 * Paywall Screen — RevenueCat subscription purchase modal
 * Triggered at peak curiosity (Life Line reveal, Compare access).
 * $1.99/week with 3-day free trial.
 */

import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { paywallCopyFor } from './paywallCopy';
import Animated, { FadeIn, FadeInDown, FadeInUp, SlideInUp } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { GlassCard } from '../components/GlassCard';
import { Colors, Fonts, Spacing, BorderRadius, Shadows } from '../constants/theme';
import { Pricing } from '../constants/config';
import { purchasePro, restorePurchases } from '../services/revenue';
import { useUserStore } from '../stores/userStore';

const FEATURES = [
  { emoji: '🔮', title: 'Your Life Line', desc: 'The one line everyone\'s scared to read' },
  { emoji: '💕', title: 'Love & Future Predictions', desc: 'What\'s actually coming for you next' },
  { emoji: '👯', title: 'Bestie Match', desc: 'Find out if you\'re actually compatible fr' },
  { emoji: '🔄', title: 'Weekly Palm Insight', desc: 'A new reading every week, just for you' },
  { emoji: '📖', title: 'Palm Journal', desc: 'Rescan & track how your lines evolve' },
];

export default function PaywallScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ source?: string | string[] }>();
  const rawSource = Array.isArray(params.source) ? params.source[0] : params.source;
  const headerCopy = paywallCopyFor(rawSource);
  const { isPro } = useUserStore();
  const [isLoading, setIsLoading] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  useEffect(() => {
    if (isPro) { router.back(); }
  }, [isPro]);

  const handlePurchase = async () => {
    setIsLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    try {
      const success = await purchasePro();
      if (success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.back();
      }
    } catch (error) {
      Alert.alert('Purchase Failed', 'Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestore = async () => {
    setIsRestoring(true);
    try {
      const restored = await restorePurchases();
      if (restored) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Restored!', 'Your Pro access has been restored.');
        router.back();
      } else {
        Alert.alert('Nothing to Restore', 'No previous purchases found.');
      }
    } catch (error) {
      Alert.alert('Restore Failed', 'Please try again.');
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <View style={styles.container} testID="paywall-screen">
      {/* Close button */}
      <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()} testID="paywall-close-btn">
        <Text style={styles.closeBtnText}>✕</Text>
      </TouchableOpacity>

      {/* Header */}
      <Animated.View entering={FadeIn.delay(100)} style={styles.header}>
        <Text style={styles.emoji}>🔮</Text>
        <Text style={styles.title}>{headerCopy.title}</Text>
        <Text style={styles.subtitle}>{headerCopy.subtitle}</Text>
      </Animated.View>

      {/* Feature list */}
      <Animated.View entering={FadeInDown.delay(300)} style={styles.features}>
        {FEATURES.map((f, i) => (
          <Animated.View key={f.title} entering={FadeInDown.delay(400 + i * 100)} style={styles.featureRow}>
            <Text style={styles.featureEmoji}>{f.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.featureTitle}>{f.title}</Text>
              <Text style={styles.featureDesc}>{f.desc}</Text>
            </View>
          </Animated.View>
        ))}
      </Animated.View>

      {/* Pricing card with parallax blur backdrop + slide-up entrance */}
      <Animated.View entering={SlideInUp.delay(600).springify().damping(18)} style={styles.priceWrap}>
        <Animated.View entering={FadeIn.delay(400)} style={styles.parallaxBlur} pointerEvents="none">
          <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
        </Animated.View>
        <GlassCard glowing style={styles.priceCard} testID="price-card">
          <Text style={styles.priceLabel}>PALMI PRO</Text>
          <Text style={styles.price}>{Pricing.weeklyPrice}<Text style={styles.pricePer}>/week</Text></Text>
          <Text style={styles.trial}>{Pricing.trialCopy}, then {Pricing.priceCopy} · Cancel anytime</Text>
        </GlassCard>
      </Animated.View>

      {/* CTA */}
      <Animated.View entering={FadeInUp.delay(1000)} style={styles.ctaArea}>
        <TouchableOpacity style={styles.purchaseBtn} onPress={handlePurchase} disabled={isLoading} activeOpacity={0.85} testID="purchase-btn">
          {isLoading ? <ActivityIndicator color={Colors.background} /> : <Text style={styles.purchaseBtnText}>Try Free for {Pricing.trialDays} Days</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.restoreBtn} onPress={handleRestore} disabled={isRestoring} testID="restore-btn">
          <Text style={styles.restoreBtnText}>{isRestoring ? 'Restoring...' : 'Restore Purchases'}</Text>
        </TouchableOpacity>
        <Text style={styles.legal}>
          {Pricing.legalAutoRenew}
        </Text>
        <Text style={styles.legal}>
          For entertainment purposes · Real AI, not templates
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, paddingHorizontal: Spacing.lg, paddingTop: 60 },
  closeBtn: { position: 'absolute', top: 60, right: 20, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  closeBtnText: { fontSize: 16, color: Colors.textSecondary },
  header: { alignItems: 'center', marginBottom: Spacing.xl },
  emoji: { fontSize: 56, marginBottom: Spacing.md },
  title: { fontFamily: Fonts.ui.bold, fontSize: Fonts.sizes.heading, color: Colors.textPrimary, textAlign: 'center' },
  subtitle: { fontFamily: Fonts.reading.regular, fontSize: Fonts.sizes.bodyLarge, color: Colors.textSecondary, marginTop: Spacing.sm },
  features: { marginBottom: Spacing.xl },
  featureRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
  featureEmoji: { fontSize: 28, marginRight: Spacing.md, width: 40, textAlign: 'center' },
  featureTitle: { fontFamily: Fonts.ui.semiBold, fontSize: Fonts.sizes.body, color: Colors.textPrimary },
  featureDesc: { fontFamily: Fonts.ui.regular, fontSize: Fonts.sizes.caption, color: Colors.textSecondary },
  priceCard: { alignItems: 'center', marginBottom: Spacing.xl },
  priceWrap: { position: 'relative' },
  parallaxBlur: {
    position: 'absolute',
    top: -Spacing.xl,
    left: -Spacing.xl,
    right: -Spacing.xl,
    bottom: -Spacing.xl,
    borderRadius: BorderRadius.lg + Spacing.sm,
    overflow: 'hidden',
    zIndex: -1,
  },
  priceLabel: { fontFamily: Fonts.ui.medium, fontSize: Fonts.sizes.caption, color: Colors.textAccent, letterSpacing: 2, textTransform: 'uppercase', marginBottom: Spacing.sm },
  price: { fontFamily: Fonts.ui.bold, fontSize: Fonts.sizes.hero, color: Colors.textPrimary },
  pricePer: { fontFamily: Fonts.ui.regular, fontSize: Fonts.sizes.subtitle, color: Colors.textSecondary },
  trial: { fontFamily: Fonts.ui.regular, fontSize: Fonts.sizes.caption, color: Colors.gold, marginTop: Spacing.sm },
  ctaArea: { alignItems: 'center' },
  purchaseBtn: { backgroundColor: Colors.purple, width: '100%', paddingVertical: Spacing.md + 2, borderRadius: BorderRadius.full, alignItems: 'center', ...Shadows.glow },
  purchaseBtnText: { fontFamily: Fonts.ui.bold, fontSize: Fonts.sizes.bodyLarge, color: Colors.textPrimary },
  restoreBtn: { paddingVertical: Spacing.md },
  restoreBtnText: { fontFamily: Fonts.ui.regular, fontSize: Fonts.sizes.caption, color: Colors.textTertiary, textDecorationLine: 'underline' },
  legal: { fontFamily: Fonts.ui.regular, fontSize: 10, color: Colors.textTertiary, textAlign: 'center', paddingHorizontal: Spacing.md, lineHeight: 14 },
});
