/**
 * Capture Screen — Camera with palm overlay guide
 * Uses expo-camera to capture the palm photo, then sends for analysis.
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as ImageManipulator from 'expo-image-manipulator';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
} from 'react-native-reanimated';
import { PalmOverlay } from '../components/PalmOverlay';
import { Colors, Fonts, Spacing, BorderRadius, Shadows, Animation } from '../constants/theme';
import { Config } from '../constants/config';
import { useReadingStore } from '../stores/readingStore';
import { readPalm } from '../services/api';

export default function CaptureScreen() {
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
  const router = useRouter();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [isCapturing, setIsCapturing] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  const { setCurrentReading, setAnalyzing, setProgress, setError, addReading } =
    useReadingStore();

  // Scanning text animation
  const scanTextOpacity = useSharedValue(1);
  const progressRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const scanTextStyle = useAnimatedStyle(() => ({
    opacity: scanTextOpacity.value,
  }));

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || isCapturing) return;

    try {
      setIsCapturing(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

      // Capture photo
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
      });

      if (!photo?.uri) {
        throw new Error('Failed to capture photo');
      }

      // Compress image
      const manipulated = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: Config.maxImageWidth } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      if (!manipulated.base64) {
        throw new Error('Failed to process image');
      }

      // Start scanning animation
      setIsScanning(true);
      setAnalyzing(true);
      setProgress(0);

      // Animate scanning text
      scanTextOpacity.value = withRepeat(
        withSequence(
          withTiming(0.3, { duration: 800 }),
          withTiming(1, { duration: 800 })
        ),
        -1
      );

      // Progress — monotonic staged animation (never reaches 1 until API resolves)
      let step = 0;
      progressRef.current = setInterval(() => {
        step++;
        setProgress(Math.min(0.4, 0.05 + step * 0.08)); // 5 steps to ~0.4
      }, 500);

      // Send to API
      const reading = await readPalm({
        imageBase64: manipulated.base64,
      });

      if (progressRef.current) {
        clearInterval(progressRef.current);
      }
      setProgress(1);

      // Success haptic
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Store reading
      setCurrentReading(reading);
      addReading(reading);
      setAnalyzing(false);

      // Navigate to reading
      router.push('/reading');
    } catch (error) {
      setIsScanning(false);
      setAnalyzing(false);
      setError(error instanceof Error ? error.message : 'Something went wrong');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

      Alert.alert(
        'Hmm, Try Again',
        'We couldn\'t read your palm clearly. Try better lighting and hold still for a sec 🤚',
        [{ text: 'Try Again', onPress: () => setIsCapturing(false) }]
      );
    } finally {
      setIsCapturing(false);
    }
  }, [isCapturing]);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (progressRef.current) {
        clearInterval(progressRef.current);
      }
    };
  }, []);

  // Permission not yet determined
  if (!permission) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color={Colors.purple} />
      </View>
    );
  }

  // Permission denied
  if (!permission.granted) {
    return (
      <View style={styles.container} testID="camera-permission-screen">
        <Text style={styles.permissionEmoji}>📷</Text>
        <Text style={styles.permissionTitle}>One Quick Thing</Text>
        <Text style={styles.permissionText}>
          We need your camera to read your palm — it only takes a few seconds
        </Text>
        <TouchableOpacity
          style={styles.permissionBtn}
          onPress={requestPermission}
          testID="grant-camera-btn"
          accessibilityLabel="Grant camera permission"
        >
          <Text style={styles.permissionBtnText}>Let's Go</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container} testID="capture-screen">
      {/* Camera view */}
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing="back"
      >
        {/* Dark overlay with cutout feel */}
        <View style={styles.cameraOverlay}>
          {/* Top bar with instructions */}
          <Animated.View entering={FadeInDown.delay(300)} style={styles.instructions}>
            <Text style={styles.instructionText}>
              {isScanning ? 'Reading your lines...' : 'Hold your palm up — let\'s see what it says ✨'}
            </Text>
          </Animated.View>

          {/* Palm overlay guide */}
          <PalmOverlay isScanning={isScanning} />

          {/* Bottom controls */}
          <View style={styles.controls}>
            {/* Back button */}
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => router.back()}
              testID="capture-back-btn"
              accessibilityLabel="Go back"
            >
              <Text style={styles.backBtnText}>✕</Text>
            </TouchableOpacity>

            {/* Capture button */}
            <TouchableOpacity
              style={[
                styles.captureBtn,
                isCapturing && styles.captureBtnDisabled,
              ]}
              onPress={handleCapture}
              disabled={isCapturing || isScanning}
              activeOpacity={0.7}
              testID="capture-btn"
              accessibilityLabel="Capture palm photo"
            >
              {isCapturing ? (
                <ActivityIndicator color={Colors.background} size="small" />
              ) : (
                <View style={styles.captureBtnInner} />
              )}
            </TouchableOpacity>

            {/* Spacer for centering */}
            <View style={styles.backBtn} />
          </View>
        </View>
      </CameraView>

      {/* Scanning overlay */}
      {isScanning && (
        <Animated.View
          entering={FadeIn}
          exiting={FadeOut}
          style={styles.scanOverlay}
        >
          <Animated.Text style={[styles.scanText, scanTextStyle]}>
            ✨ Your palm is revealing something...
          </Animated.Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  camera: {
    flex: 1,
    width: '100%',
  },
  cameraOverlay: {
    flex: 1,
    justifyContent: 'space-between',
    paddingTop: 80,
    paddingBottom: 60,
  },
  instructions: {
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  instructionText: {
    fontFamily: Fonts.ui.medium,
    fontSize: Fonts.sizes.bodyLarge,
    color: Colors.textPrimary,
    textAlign: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backBtnText: {
    fontSize: 18,
    color: Colors.textPrimary,
  },
  captureBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.textPrimary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: Colors.purple,
    ...Shadows.glow,
  },
  captureBtnDisabled: {
    opacity: 0.5,
  },
  captureBtnInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.textPrimary,
  },
  scanOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 10, 15, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanText: {
    fontFamily: Fonts.ui.semiBold,
    fontSize: Fonts.sizes.subtitle,
    color: Colors.purple,
  },
  // Permission screen styles
  permissionEmoji: {
    fontSize: 64,
    marginBottom: Spacing.lg,
  },
  permissionTitle: {
    fontFamily: Fonts.ui.bold,
    fontSize: Fonts.sizes.heading,
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },
  permissionText: {
    fontFamily: Fonts.ui.regular,
    fontSize: Fonts.sizes.bodyLarge,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  permissionBtn: {
    backgroundColor: Colors.purple,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xxxl,
    borderRadius: BorderRadius.full,
    ...Shadows.glow,
  },
  permissionBtnText: {
    fontFamily: Fonts.ui.bold,
    fontSize: Fonts.sizes.bodyLarge,
    color: Colors.textPrimary,
  },
});
