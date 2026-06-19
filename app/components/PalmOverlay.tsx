/**
 * PalmOverlay — Camera overlay with hand positioning guide
 * Shows an SVG hand outline that guides the user to position their palm.
 * Animates with a pulsing glow effect.
 */

import React, { useEffect } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Colors, Animation } from '../constants/theme';

interface PalmOverlayProps {
  /** Whether scanning is in progress */
  isScanning?: boolean;
}

export function PalmOverlay({ isScanning = false }: PalmOverlayProps) {
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const OVERLAY_SIZE = SCREEN_WIDTH * 0.75;
  const pulseOpacity = useSharedValue(0.4);
  const scanProgress = useSharedValue(0);

  useEffect(() => {
    // Pulsing glow effect
    pulseOpacity.value = withRepeat(
      withTiming(0.8, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);

  useEffect(() => {
    if (isScanning) {
      scanProgress.value = withTiming(1, { duration: 3000 });
    } else {
      scanProgress.value = 0;
    }
  }, [isScanning]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  const scanLineStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: scanProgress.value * OVERLAY_SIZE }],
    opacity: isScanning ? 1 : 0,
  }));

  return (
    <View style={[styles.container, { width: OVERLAY_SIZE, height: OVERLAY_SIZE }]} testID="palm-overlay">
      {/* Hand outline guide */}
      <Animated.View style={[styles.handOutline, { width: OVERLAY_SIZE * 0.7, height: OVERLAY_SIZE * 0.85 }, pulseStyle]}>
        {/* Simplified hand shape using bordered views */}
        <View style={[styles.palmCircle, { width: OVERLAY_SIZE * 0.5, height: OVERLAY_SIZE * 0.5, borderRadius: OVERLAY_SIZE * 0.25 }]}>
          {/* Finger guides */}
          <View style={[styles.finger, styles.fingerIndex]} />
          <View style={[styles.finger, styles.fingerMiddle]} />
          <View style={[styles.finger, styles.fingerRing]} />
          <View style={[styles.finger, styles.fingerPinky]} />
          <View style={[styles.thumb]} />
        </View>
      </Animated.View>

      {/* Scanning line */}
      <Animated.View style={[styles.scanLine, scanLineStyle]} />

      {/* Corner markers */}
      <View style={[styles.corner, styles.topLeft]} />
      <View style={[styles.corner, styles.topRight]} />
      <View style={[styles.corner, styles.bottomLeft]} />
      <View style={[styles.corner, styles.bottomRight]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
  },
  handOutline: {
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  palmCircle: {
    borderWidth: 2,
    borderColor: Colors.purple,
    borderStyle: 'dashed',
    position: 'relative',
  },
  finger: {
    position: 'absolute',
    width: 20,
    height: 60,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.purple,
    borderStyle: 'dashed',
    top: -50,
  },
  fingerIndex: { left: '20%' },
  fingerMiddle: { left: '38%' },
  fingerRing: { left: '56%' },
  fingerPinky: { left: '72%', height: 45, top: -35 },
  thumb: {
    position: 'absolute',
    width: 22,
    height: 50,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: Colors.purple,
    borderStyle: 'dashed',
    left: -15,
    top: '20%',
    transform: [{ rotate: '-30deg' }],
  },
  scanLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: Colors.scanLine,
    shadowColor: Colors.scanGlow,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 10,
  },
  corner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: Colors.purple,
  },
  topLeft: {
    top: 0, left: 0,
    borderTopWidth: 2, borderLeftWidth: 2,
  },
  topRight: {
    top: 0, right: 0,
    borderTopWidth: 2, borderRightWidth: 2,
  },
  bottomLeft: {
    bottom: 0, left: 0,
    borderBottomWidth: 2, borderLeftWidth: 2,
  },
  bottomRight: {
    bottom: 0, right: 0,
    borderBottomWidth: 2, borderRightWidth: 2,
  },
});
