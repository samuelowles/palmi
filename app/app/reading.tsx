/**
 * Reading Screen — Display palm reading results
 * Free lines (Heart + Head) shown immediately.
 * Life Line + deep insights behind blur/paywall.
 */

import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, Share, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { GlassCard } from '../components/GlassCard';
import { BlurOverlay } from '../components/BlurOverlay';
import { Colors, Fonts, Spacing, BorderRadius, Animation } from '../constants/theme';
import { useReadingStore, PalmLine } from '../stores/readingStore';
import { useUserStore } from '../stores/userStore';

function LineCard({ line, index, isPro, onUnlock }: { line: PalmLine; index: number; isPro: boolean; onUnlock: () => void }) {
  const isLocked = line.isPremium && !isPro;
  return (
    <Animated.View entering={FadeInDown.delay(index * Animation.stagger + 300).springify()}>
      <GlassCard style={styles.lineCard} glowing={!isLocked && line.strength >= 80} testID={`line-card-${line.type}`}>
        <View style={styles.lineHeader}>
          <Text style={styles.lineEmoji}>{line.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.lineLabel}>{line.label}</Text>
            <Text style={styles.lineArchetype}>{line.archetype}</Text>
          </View>
          <View style={styles.strengthBadge}>
            <Text style={styles.strengthText}>{line.strength}%</Text>
          </View>
        </View>
        <Text style={styles.shortSummary}>{line.shortSummary}</Text>
        <View style={{ position: 'relative', minHeight: 80 }}>
          <Text style={[styles.fullReading, isLocked && { opacity: 0.15 }]}>{line.fullReading}</Text>
          {isLocked && <BlurOverlay onUnlock={onUnlock} />}
        </View>
      </GlassCard>
    </Animated.View>
  );
}

export default function ReadingScreen() {
  const router = useRouter();
  const { currentReading } = useReadingStore();
  const { isPro } = useUserStore();

  useEffect(() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }, []);

  // Preserve original line order — premium gating is per-line via isLocked, not via grouping
  const allLines = useMemo(() => {
    return currentReading?.lines ?? [];
  }, [currentReading]);

  const handleUnlock = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push('/paywall'); };
  const handleShare = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Share.share({ message: `${currentReading?.archetypeEmoji} apparently i'm "${currentReading?.archetype}" — what are you?\n\nscan your palm free: getpalmi.com` }).catch(() => {});
  };
  const handleCompare = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push(isPro ? '/compare' : '/paywall'); };

  if (!currentReading) return (
    <View style={styles.container}><Text style={styles.errorText}>No reading found</Text>
      <TouchableOpacity onPress={() => router.back()}><Text style={styles.errorLink}>Go back</Text></TouchableOpacity>
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} testID="reading-screen">
      <Animated.View entering={FadeIn.delay(100)} style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} testID="reading-back-btn"><Text style={styles.backBtnText}>←</Text></TouchableOpacity>
        <Text style={styles.archetypeEmoji}>{currentReading.archetypeEmoji}</Text>
        <Text style={styles.archetypeLabel}>You are</Text>
        <Text style={styles.archetypeTitle}>{currentReading.archetype}</Text>
      </Animated.View>
      <Animated.View entering={FadeInDown.delay(200)}>
        <GlassCard style={styles.summaryCard} testID="overall-summary"><Text style={styles.summaryText}>{currentReading.overallSummary}</Text></GlassCard>
      </Animated.View>
      {allLines.map((line, i) => <LineCard key={line.type} line={line} index={i} isPro={isPro} onUnlock={handleUnlock} />)}
      <Animated.View entering={FadeInDown.delay(allLines.length * Animation.stagger + 500)} style={styles.actions}>
        <TouchableOpacity style={styles.shareBtn} onPress={handleShare} activeOpacity={0.8} testID="share-btn"><Text style={styles.shareBtnText}>Share Your Reading ✨</Text></TouchableOpacity>
        <TouchableOpacity style={styles.compareBtn} onPress={handleCompare} activeOpacity={0.8} testID="compare-btn"><Text style={styles.compareBtnText}>Match With a Friend 👯</Text></TouchableOpacity>
      </Animated.View>
      <TouchableOpacity style={styles.scanAgainBtn} onPress={() => router.push('/capture')} testID="scan-again-btn"><Text style={styles.scanAgainText}>Scan Another Palm</Text></TouchableOpacity>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingTop: 60, paddingBottom: Spacing.xl },
  header: { alignItems: 'center', marginBottom: Spacing.xl },
  backBtn: { position: 'absolute', left: 0, top: 0, width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  backBtnText: { fontSize: 24, color: Colors.textPrimary },
  archetypeEmoji: { fontSize: 64, marginBottom: Spacing.sm },
  archetypeLabel: { fontFamily: Fonts.ui.regular, fontSize: Fonts.sizes.body, color: Colors.textSecondary, marginBottom: Spacing.xs },
  archetypeTitle: { fontFamily: Fonts.reading.regular, fontSize: Fonts.sizes.display, color: Colors.textPrimary, textAlign: 'center' },
  summaryCard: { marginBottom: Spacing.lg },
  summaryText: { fontFamily: Fonts.reading.regular, fontSize: Fonts.sizes.bodyLarge, color: Colors.textSecondary, lineHeight: 24, textAlign: 'center' },
  lineCard: { marginBottom: Spacing.md },
  lineHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
  lineEmoji: { fontSize: 32, marginRight: Spacing.md },
  lineLabel: { fontFamily: Fonts.ui.semiBold, fontSize: Fonts.sizes.subtitle, color: Colors.textPrimary },
  lineArchetype: { fontFamily: Fonts.ui.regular, fontSize: Fonts.sizes.caption, color: Colors.textAccent },
  strengthBadge: { backgroundColor: 'rgba(132,94,247,0.15)', paddingVertical: Spacing.xs, paddingHorizontal: Spacing.md, borderRadius: BorderRadius.full },
  strengthText: { fontFamily: Fonts.ui.bold, fontSize: Fonts.sizes.caption, color: Colors.purple },
  shortSummary: { fontFamily: Fonts.ui.regular, fontSize: Fonts.sizes.body, color: Colors.textSecondary, lineHeight: 20, marginBottom: Spacing.md },
  fullReading: { fontFamily: Fonts.reading.regular, fontSize: Fonts.sizes.body, color: Colors.textPrimary, lineHeight: 22 },
  actions: { marginTop: Spacing.lg, gap: Spacing.md },
  shareBtn: { backgroundColor: Colors.purple, paddingVertical: Spacing.md, borderRadius: BorderRadius.full, alignItems: 'center' },
  shareBtnText: { fontFamily: Fonts.ui.bold, fontSize: Fonts.sizes.bodyLarge, color: Colors.textPrimary },
  compareBtn: { borderWidth: 1.5, borderColor: Colors.gold, paddingVertical: Spacing.md, borderRadius: BorderRadius.full, alignItems: 'center' },
  compareBtnText: { fontFamily: Fonts.ui.bold, fontSize: Fonts.sizes.bodyLarge, color: Colors.gold },
  scanAgainBtn: { alignItems: 'center', marginTop: Spacing.xl },
  scanAgainText: { fontFamily: Fonts.ui.medium, fontSize: Fonts.sizes.body, color: Colors.textTertiary, textDecorationLine: 'underline' },
  errorText: { fontFamily: Fonts.ui.medium, fontSize: Fonts.sizes.bodyLarge, color: Colors.textSecondary },
  errorLink: { fontFamily: Fonts.ui.medium, fontSize: Fonts.sizes.body, color: Colors.purple, marginTop: Spacing.md },
});
