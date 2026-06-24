/**
 * ScreenErrorBoundary — Catches render errors and shows a friendly fallback.
 * Wrap each screen with this to prevent white-screen crashes.
 */

import React, { Component, type ReactNode } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { Colors, Fonts, Spacing, BorderRadius } from '../constants/theme';

interface Props {
  children: ReactNode;
  /** Custom back action for the "Go Back" button */
  onGoBack?: () => void;
}

interface State {
  hasError: boolean;
}

export class ScreenErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ScreenErrorBoundary caught:', error.message, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container} testID="error-boundary-fallback">
          <Text style={styles.emoji}>✨</Text>
          <Text style={styles.title}>Something glitched</Text>
          <Text style={styles.message}>
            The stars aren&apos;t aligned right now. Let&apos;s try that again.
          </Text>
          <TouchableOpacity
            style={styles.button}
            onPress={this.handleReset}
            testID="error-retry-btn"
          >
            <Text style={styles.buttonText}>Try Again</Text>
          </TouchableOpacity>
          {this.props.onGoBack && (
            <TouchableOpacity
              style={styles.backButton}
              onPress={this.props.onGoBack}
              testID="error-back-btn"
            >
              <Text style={styles.backText}>Go Back</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  emoji: { fontSize: 48, marginBottom: Spacing.lg },
  title: {
    fontFamily: Fonts.ui.bold,
    fontSize: Fonts.sizes.heading,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  message: {
    fontFamily: Fonts.ui.regular,
    fontSize: Fonts.sizes.bodyLarge,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  button: {
    backgroundColor: Colors.purple,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xxxl,
    borderRadius: BorderRadius.full,
  },
  buttonText: {
    fontFamily: Fonts.ui.bold,
    fontSize: Fonts.sizes.bodyLarge,
    color: Colors.textPrimary,
  },
  backButton: { marginTop: Spacing.lg },
  backText: {
    fontFamily: Fonts.ui.medium,
    fontSize: Fonts.sizes.body,
    color: Colors.textTertiary,
    textDecorationLine: 'underline',
  },
});
