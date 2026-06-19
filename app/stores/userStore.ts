/**
 * User Store — Zustand store for user auth and subscription state
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface UserState {
  // User identity
  userId: string | null;
  isOnboarded: boolean;

  // Auth tokens
  token: string | null;
  refreshToken: string | null;
  tokenExpiresAt: string | null;

  // Subscription
  isPro: boolean;
  subscriptionExpiresAt: string | null;

  // Actions
  setUserId: (id: string) => void;
  setOnboarded: (value: boolean) => void;
  setAuth: (userId: string, token: string, refreshToken: string, expiresAt: string) => void;
  setTokens: (token: string, refreshToken: string, expiresAt: string) => void;
  clearAuth: () => void;
  setPro: (value: boolean) => void;
  setSubscriptionExpiry: (date: string | null) => void;
  reset: () => void;
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      userId: null,
      isOnboarded: false,
      token: null,
      refreshToken: null,
      tokenExpiresAt: null,
      isPro: false,
      subscriptionExpiresAt: null,

      setUserId: (id) => set({ userId: id }),
      setOnboarded: (value) => set({ isOnboarded: value }),
      setAuth: (userId, token, refreshToken, expiresAt) =>
        set({ userId, token, refreshToken, tokenExpiresAt: expiresAt }),
      setTokens: (token, refreshToken, expiresAt) =>
        set({ token, refreshToken, tokenExpiresAt: expiresAt }),
      clearAuth: () =>
        set({ token: null, refreshToken: null, tokenExpiresAt: null }),
      setPro: (value) => set({ isPro: value }),
      setSubscriptionExpiry: (date) => set({ subscriptionExpiresAt: date }),
      reset: () =>
        set({
          userId: null,
          isOnboarded: false,
          token: null,
          refreshToken: null,
          tokenExpiresAt: null,
          isPro: false,
          subscriptionExpiresAt: null,
        }),
    }),
    {
      name: 'palmi-user',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
