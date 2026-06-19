/**
 * CompatibilityCard — Shareable bestie comparison card
 * Displays two palm archetypes, compatibility score, and match label.
 * Designed to be screenshot-friendly with Palmi branding.
 */

import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { GlassCard } from './GlassCard';
import { Colors, Fonts, Spacing, BorderRadius } from '../constants/theme';

interface PersonData {
  name: string;
  archetype: string;
  emoji: string;
}

interface CompatibilityCardProps {
  personA: PersonData;
  personB: PersonData;
  score: number; // 0-100
  matchLabel: string; // e.g., "Cosmic Soulmates"
}

function getScoreColor(score: number): string {
  if (score >= 75) return Colors.compatHigh;
  if (score >= 50) return Colors.compatMedium;
  return Colors.compatLow;
}

export function CompatibilityCard({
  personA,
  personB,
  score,
  matchLabel,
}: CompatibilityCardProps) {
  const scoreColor = getScoreColor(score);

  return (
    <GlassCard
      glowing
      padding={Spacing.xl}
      style={styles.card}
      testID="compatibility-card"
    >
      {/* Header */}
      <Text style={styles.header}>bestie match 💫</Text>

      {/* Two person row */}
      <View style={styles.matchRow}>
        {/* Person A */}
        <View style={styles.person}>
          <Text style={styles.emoji}>{personA.emoji}</Text>
          <Text style={styles.name} numberOfLines={1}>{personA.name}</Text>
          <Text style={styles.archetype}>{personA.archetype}</Text>
        </View>

        {/* Score center */}
        <View style={styles.scoreContainer}>
          <Text style={[styles.score, { color: scoreColor }]}>{score}%</Text>
          <View style={[styles.scoreLine, { backgroundColor: scoreColor }]} />
        </View>

        {/* Person B */}
        <View style={styles.person}>
          <Text style={styles.emoji}>{personB.emoji}</Text>
          <Text style={styles.name} numberOfLines={1}>{personB.name}</Text>
          <Text style={styles.archetype}>{personB.archetype}</Text>
        </View>
      </View>

      {/* Match label */}
      <View style={[styles.matchBadge, { borderColor: scoreColor }]}>
        <Text style={[styles.matchLabel, { color: scoreColor }]}>{matchLabel}</Text>
      </View>

      {/* Branding watermark */}
      <Text style={styles.watermark}>palmi ✋ scan yours free</Text>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    alignItems: 'center',
  },
  header: {
    fontFamily: Fonts.ui.medium,
    fontSize: Fonts.sizes.body,
    color: Colors.textSecondary,
    textTransform: 'lowercase',
    letterSpacing: 2,
    marginBottom: Spacing.lg,
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: Spacing.lg,
  },
  person: {
    flex: 1,
    alignItems: 'center',
  },
  emoji: {
    fontSize: 40,
    marginBottom: Spacing.sm,
  },
  name: {
    fontFamily: Fonts.ui.semiBold,
    fontSize: Fonts.sizes.body,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  archetype: {
    fontFamily: Fonts.ui.regular,
    fontSize: Fonts.sizes.caption,
    color: Colors.textSecondary,
  },
  scoreContainer: {
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
  },
  score: {
    fontFamily: Fonts.ui.bold,
    fontSize: Fonts.sizes.display,
    marginBottom: Spacing.xs,
  },
  scoreLine: {
    width: 40,
    height: 2,
    borderRadius: 1,
  },
  matchBadge: {
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  matchLabel: {
    fontFamily: Fonts.reading.regular,
    fontSize: Fonts.sizes.subtitle,
    textAlign: 'center',
  },
  watermark: {
    fontFamily: Fonts.ui.medium,
    fontSize: Fonts.sizes.caption,
    color: Colors.textTertiary,
    letterSpacing: 1,
  },
});
