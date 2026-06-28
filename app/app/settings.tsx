/**
 * Settings Screen — Restore purchases, legal links, subscription management
 * Apple mandates: Restore Purchases, Privacy Policy, Terms of Service, Subscription Management.
 */

import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Linking, Alert, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { GlassCard } from '../components/GlassCard';
import { Colors, Fonts, Spacing, BorderRadius } from '../constants/theme';
import { useUserStore } from '../stores/userStore';
import { restorePurchases } from '../services/revenue';
import { openSubscriptions } from '../services/deepLinks';
import { PAYWALL_ROUTE } from './paywallSource';

function SettingsRow({ icon, label, onPress, testID }: { icon: string; label: string; onPress: () => void; testID: string }) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7} testID={testID}>
      <Text style={styles.rowIcon}>{icon}</Text>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowChevron}>›</Text>
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const { isPro } = useUserStore();

  const handleRestore = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const restored = await restorePurchases();
      Alert.alert(restored ? 'Restored!' : 'Nothing Found', restored ? 'Your Pro access is back.' : 'No previous purchases found.');
    } catch { Alert.alert('Error', 'Failed to restore. Try again.'); }
  };

  const openSubscriptionsHandler = () => { openSubscriptions(); };
  const openPrivacy = () => Linking.openURL('https://getpalmi.com/privacy');
  const openTerms = () => Linking.openURL('https://getpalmi.com/terms');

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} testID="settings-screen">
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} testID="settings-back-btn"><Text style={styles.backText}>← Back</Text></TouchableOpacity>
      </View>
      <Text style={styles.title}>Settings</Text>

      {/* Subscription status */}
      <Animated.View entering={FadeInDown.delay(100)}>
        <GlassCard glowing={isPro} style={styles.statusCard} testID="subscription-status">
          <Text style={styles.statusEmoji}>{isPro ? '✨' : '✋'}</Text>
          <Text style={styles.statusTitle}>{isPro ? 'Palmi Pro' : 'Basic Reading'}</Text>
          <Text style={styles.statusDesc}>{isPro ? 'You have full access to all features' : 'Your life line is still hidden'}</Text>
          {!isPro && (
            <TouchableOpacity style={styles.upgradeBtn} onPress={() => router.push('/paywall')} testID="settings-upgrade-btn">
              <Text style={styles.upgradeBtnText}>See Your Full Reading</Text>
            </TouchableOpacity>
          )}
        </GlassCard>
      </Animated.View>

      {/* Settings rows */}
      <Animated.View entering={FadeInDown.delay(200)}>
        <GlassCard style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <SettingsRow icon="🔄" label="Restore Purchases" onPress={handleRestore} testID="restore-purchases-btn" />
          {isPro && <SettingsRow icon="💳" label="Manage Subscription" onPress={openSubscriptionsHandler} testID="manage-sub-btn" />}
        </GlassCard>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(250)}>
        <GlassCard style={styles.section}>
          <Text style={styles.sectionTitle}>My Readings</Text>
          <SettingsRow
            icon="📖"
            label="Past Readings"
            onPress={() => router.push(isPro ? '/reading' : PAYWALL_ROUTE.history)}
            testID="past-readings-btn"
          />
        </GlassCard>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(300)}>
        <GlassCard style={styles.section}>
          <Text style={styles.sectionTitle}>Legal</Text>
          <SettingsRow icon="🔒" label="Privacy Policy" onPress={openPrivacy} testID="privacy-policy-btn" />
          <SettingsRow icon="📄" label="Terms of Service" onPress={openTerms} testID="terms-btn" />
        </GlassCard>
      </Animated.View>

      <Text style={styles.disclaimer}>Palmi is for entertainment purposes. Readings are AI-generated and should not be taken as professional advice.</Text>
      <Text style={styles.version}>Palmi v1.0.0</Text>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingTop: 60 },
  headerRow: { marginBottom: Spacing.md },
  backText: { fontFamily: Fonts.ui.medium, fontSize: Fonts.sizes.body, color: Colors.textSecondary },
  title: { fontFamily: Fonts.ui.bold, fontSize: Fonts.sizes.heading, color: Colors.textPrimary, marginBottom: Spacing.xl },
  statusCard: { alignItems: 'center', marginBottom: Spacing.lg },
  statusEmoji: { fontSize: 40, marginBottom: Spacing.sm },
  statusTitle: { fontFamily: Fonts.ui.bold, fontSize: Fonts.sizes.title, color: Colors.textPrimary },
  statusDesc: { fontFamily: Fonts.ui.regular, fontSize: Fonts.sizes.body, color: Colors.textSecondary, textAlign: 'center', marginTop: Spacing.xs },
  upgradeBtn: { backgroundColor: Colors.purple, paddingVertical: Spacing.sm + 2, paddingHorizontal: Spacing.xl, borderRadius: BorderRadius.full, marginTop: Spacing.lg },
  upgradeBtnText: { fontFamily: Fonts.ui.bold, fontSize: Fonts.sizes.body, color: Colors.textPrimary },
  section: { marginBottom: Spacing.lg },
  sectionTitle: { fontFamily: Fonts.ui.semiBold, fontSize: Fonts.sizes.caption, color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: Spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.borderSubtle },
  rowIcon: { fontSize: 20, marginRight: Spacing.md, width: 28, textAlign: 'center' },
  rowLabel: { fontFamily: Fonts.ui.medium, fontSize: Fonts.sizes.body, color: Colors.textPrimary, flex: 1 },
  rowChevron: { fontSize: 20, color: Colors.textTertiary },
  version: { fontFamily: Fonts.ui.regular, fontSize: Fonts.sizes.caption, color: Colors.textTertiary, textAlign: 'center', marginTop: Spacing.xl },
  disclaimer: { fontFamily: Fonts.ui.regular, fontSize: Fonts.sizes.caption, color: Colors.textTertiary, textAlign: 'center', marginTop: Spacing.xl, paddingHorizontal: Spacing.lg, lineHeight: 18 },
});
