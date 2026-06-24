/**
 * Compare Screen — Bestie palm compatibility
 * Parses friend share links, fetches readings, and displays real synergy results.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Share,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { GlassCard } from '../components/GlassCard';
import { CompatibilityCard } from '../components/CompatibilityCard';
import { Colors, Fonts, Spacing, BorderRadius, Shadows } from '../constants/theme';
import { useReadingStore } from '../stores/readingStore';
import { useUserStore } from '../stores/userStore';
import { Config } from '../constants/config';
import { comparePalms, getReading, SynergyResult } from '../services/api';

/** Extract a UUID from a Palmi deep link or raw string */
function extractReadingId(input: string): string | null {
  const uuidRe = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  const match = input.match(uuidRe);
  return match ? match[0] : null;
}

type ScreenState =
  | { phase: 'input' }
  | { phase: 'loading' }
  | { phase: 'result'; synergy: SynergyResult }
  | { phase: 'error'; message: string };

export default function CompareScreen() {
  const router = useRouter();
  const { currentReading } = useReadingStore();
  const { isPro } = useUserStore();
  const [friendLink, setFriendLink] = useState('');
  const [state, setState] = useState<ScreenState>({ phase: 'input' });

  // Entitlement gate: non-Pro users are redirected to the paywall.
  // Mirrors the gate in reading.tsx so deep links / stale state can't bypass.
  useEffect(() => {
    if (!isPro) {
      router.replace('/paywall');
    }
  }, [isPro, router]);

  const myReadingId = currentReading?.id;
  const shareLink = myReadingId
    ? `${Config.scheme}://compare/${myReadingId}`
    : `${Config.scheme}://compare/demo`;

  const handleShareLink = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await Share.share({
      message: `i dare you to scan your palm and compare with mine 😈✋\n\n${shareLink}`,
    }).catch(() => {});
  };

  const handleCopyLink = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Clipboard.setStringAsync(shareLink);
    Alert.alert('Copied!', 'Share link copied to clipboard');
  };

  const handleCompare = useCallback(async () => {
    const friendReadingId = extractReadingId(friendLink);
    if (!friendReadingId) {
      Alert.alert('Hmm', 'That doesn\'t look like a valid Palmi link. Ask your friend to send you their link.');
      return;
    }

    if (!myReadingId) {
      Alert.alert('No Reading', 'You need to scan your palm first before comparing.');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setState({ phase: 'loading' });

    try {
      // Fetch the friend's reading
      const friendReading = await getReading(friendReadingId);

      // Run the synergy comparison
      const synergy = await comparePalms({
        readingIdA: myReadingId,
        readingIdB: friendReading.id,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setState({ phase: 'result', synergy });
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setState({
        phase: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Couldn\'t compare readings. Try again.',
      });
    }
  }, [friendLink, myReadingId]);

  const handleTryAgain = () => {
    setState({ phase: 'input' });
    setFriendLink('');
  };

  return (
    <View style={styles.container} testID="compare-screen">
      {/* Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} testID="compare-back-btn">
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
      </View>

      <Animated.View entering={FadeIn} style={styles.header}>
        <Text style={styles.title}>Palm Match 👯</Text>
        <Text style={styles.subtitle}>
          Are you actually compatible? Let's find out
        </Text>
      </Animated.View>

      {state.phase === 'input' && (
        <Animated.View entering={FadeInDown.delay(200)}>
          {/* Share your link */}
          <GlassCard style={styles.shareCard} testID="share-link-card">
            <Text style={styles.cardTitle}>Send your link</Text>
            <Text style={styles.cardDesc}>Dare them to scan their palm 😈</Text>
            <TouchableOpacity
              style={styles.shareBtn}
              onPress={handleShareLink}
              activeOpacity={0.85}
              testID="share-link-btn"
            >
              <Text style={styles.shareBtnText}>Send the Challenge 📤</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleCopyLink} testID="copy-link-btn">
              <Text style={styles.copyText}>copy link instead</Text>
            </TouchableOpacity>
          </GlassCard>

          {/* Enter friend's link */}
          <GlassCard style={styles.inputCard}>
            <Text style={styles.cardTitle}>Got their link?</Text>
            <TextInput
              style={styles.input}
              placeholder="Paste your friend's Palmi link..."
              placeholderTextColor={Colors.textTertiary}
              value={friendLink}
              onChangeText={setFriendLink}
              autoCapitalize="none"
              autoCorrect={false}
              testID="friend-link-input"
            />
            <TouchableOpacity
              style={[
                styles.compareBtn,
                !friendLink && styles.compareBtnDisabled,
              ]}
              onPress={handleCompare}
              disabled={!friendLink}
              testID="run-compare-btn"
            >
              <Text style={styles.compareBtnText}>See Your Match ✋</Text>
            </TouchableOpacity>
          </GlassCard>
        </Animated.View>
      )}

      {state.phase === 'loading' && (
        <Animated.View entering={FadeIn} style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.purple} />
          <Text style={styles.loadingText}>Reading your palms together...</Text>
        </Animated.View>
      )}

      {state.phase === 'result' && (
        <Animated.View entering={FadeInDown.springify()}>
          <CompatibilityCard
            personA={state.synergy.personA}
            personB={state.synergy.personB}
            score={state.synergy.score}
            matchLabel={state.synergy.matchLabel}
          />
          <TouchableOpacity
            style={styles.shareResultBtn}
            onPress={handleShareLink}
            testID="share-result-btn"
          >
            <Text style={styles.shareResultText}>Share Result 📤</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.tryAgainBtn}
            onPress={handleTryAgain}
            testID="compare-another-btn"
          >
            <Text style={styles.tryAgainText}>Compare With Someone Else</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {state.phase === 'error' && (
        <Animated.View entering={FadeIn} style={styles.errorContainer}>
          <Text style={styles.errorEmoji}>😅</Text>
          <Text style={styles.errorText}>{state.message}</Text>
          <TouchableOpacity
            style={styles.tryAgainBtn}
            onPress={handleTryAgain}
            testID="error-try-again-btn"
          >
            <Text style={styles.tryAgainText}>Try Again</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: Spacing.lg,
    paddingTop: 60,
  },
  headerRow: { marginBottom: Spacing.md },
  backText: {
    fontFamily: Fonts.ui.medium,
    fontSize: Fonts.sizes.body,
    color: Colors.textSecondary,
  },
  header: { alignItems: 'center', marginBottom: Spacing.xl },
  title: {
    fontFamily: Fonts.ui.bold,
    fontSize: Fonts.sizes.heading,
    color: Colors.textPrimary,
  },
  subtitle: {
    fontFamily: Fonts.reading.regular,
    fontSize: Fonts.sizes.body,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  shareCard: { marginBottom: Spacing.lg },
  inputCard: { marginBottom: Spacing.lg },
  cardTitle: {
    fontFamily: Fonts.ui.semiBold,
    fontSize: Fonts.sizes.subtitle,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  cardDesc: {
    fontFamily: Fonts.ui.regular,
    fontSize: Fonts.sizes.body,
    color: Colors.textSecondary,
    marginBottom: Spacing.lg,
  },
  shareBtn: {
    backgroundColor: Colors.purple,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    ...Shadows.glow,
  },
  shareBtnText: {
    fontFamily: Fonts.ui.bold,
    fontSize: Fonts.sizes.body,
    color: Colors.textPrimary,
  },
  copyText: {
    fontFamily: Fonts.ui.regular,
    fontSize: Fonts.sizes.caption,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginTop: Spacing.md,
    textDecorationLine: 'underline',
  },
  input: {
    fontFamily: Fonts.ui.regular,
    fontSize: Fonts.sizes.body,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: Colors.borderCard,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.lg,
  },
  compareBtn: {
    backgroundColor: Colors.gold,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
  },
  compareBtnDisabled: { opacity: 0.4 },
  compareBtnText: {
    fontFamily: Fonts.ui.bold,
    fontSize: Fonts.sizes.body,
    color: Colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontFamily: Fonts.ui.medium,
    fontSize: Fonts.sizes.bodyLarge,
    color: Colors.textSecondary,
    marginTop: Spacing.lg,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  errorEmoji: { fontSize: 48, marginBottom: Spacing.lg },
  errorText: {
    fontFamily: Fonts.ui.medium,
    fontSize: Fonts.sizes.bodyLarge,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  shareResultBtn: {
    backgroundColor: Colors.purple,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    marginTop: Spacing.xl,
    ...Shadows.glow,
  },
  shareResultText: {
    fontFamily: Fonts.ui.bold,
    fontSize: Fonts.sizes.bodyLarge,
    color: Colors.textPrimary,
  },
  tryAgainBtn: {
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  tryAgainText: {
    fontFamily: Fonts.ui.medium,
    fontSize: Fonts.sizes.body,
    color: Colors.textTertiary,
    textDecorationLine: 'underline',
  },
});
