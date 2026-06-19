/**
 * Reading Store — Zustand store for palm reading state
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface PalmLine {
  type: 'heart' | 'head' | 'life' | 'fate';
  label: string;
  strength: number; // 0-100
  archetype: string;
  emoji: string;
  shortSummary: string;
  fullReading: string;
  isPremium: boolean;
}

export interface PalmReading {
  id: string;
  userId: string;
  imageUri: string;
  lines: PalmLine[];
  overallSummary: string;
  archetype: string;
  archetypeEmoji: string;
  createdAt: string;
}

export interface ReadingState {
  // Current reading in progress
  currentReading: PalmReading | null;
  isAnalyzing: boolean;
  analyzeProgress: number; // 0-1
  error: string | null;

  // Reading history
  readings: PalmReading[];

  // Actions
  setCurrentReading: (reading: PalmReading | null) => void;
  setAnalyzing: (value: boolean) => void;
  setProgress: (value: number) => void;
  setError: (error: string | null) => void;
  addReading: (reading: PalmReading) => void;
  clearCurrent: () => void;
}

export const useReadingStore = create<ReadingState>()(
  persist(
    (set) => ({
      currentReading: null,
      isAnalyzing: false,
      analyzeProgress: 0,
      error: null,
      readings: [],

      setCurrentReading: (reading) => set({ currentReading: reading }),
      setAnalyzing: (value) => set({ isAnalyzing: value }),
      setProgress: (value) => set({ analyzeProgress: value }),
      setError: (error) => set({ error }),
      addReading: (reading) =>
        set((state) => ({
          readings: [reading, ...state.readings].slice(0, 50),
        })),
      clearCurrent: () =>
        set({ currentReading: null, isAnalyzing: false, analyzeProgress: 0, error: null }),
    }),
    {
      name: 'palmi-readings',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        readings: state.readings.map((reading) => ({
          ...reading,
          lines: reading.lines.map((line) =>
            line.isPremium
              ? { ...line, fullReading: '' }
              : line
          ),
        })),
      }),
    }
  )
);
