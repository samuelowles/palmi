import { describe, it, expect, beforeEach, vi } from 'vitest';

// AsyncStorage depends on window, which doesn't exist in Node.
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
    removeItem: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
  },
}));

import { useReadingStore, type PalmReading, type PalmLine } from '../readingStore';

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

const defaultLine: PalmLine = {
  type: 'life',
  label: 'Life Line',
  strength: 85,
  archetype: 'Vital',
  emoji: '💪',
  shortSummary: 'Strong life line',
  fullReading: 'Your life line is prominent and well-defined.',
  isPremium: false,
};

function createTestLine(overrides: Partial<PalmLine> = {}): PalmLine {
  return { ...defaultLine, ...overrides };
}

function createTestReading(
  id: string,
  overrides: Partial<PalmReading> = {},
): PalmReading {
  return {
    id,
    userId: 'user-test-1',
    imageUri: 'file:///test-image.jpg',
    lines: [createTestLine()],
    overallSummary: 'A promising palm reading.',
    archetype: 'The Seeker',
    archetypeEmoji: '🔮',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Initial state snapshot
// ---------------------------------------------------------------------------

const INITIAL_STATE = {
  currentReading: null,
  isAnalyzing: false,
  analyzeProgress: 0,
  error: null,
  readings: [],
} as const;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useReadingStore', () => {
  beforeEach(() => {
    useReadingStore.setState(INITIAL_STATE);
  });

  // --- Initial state -------------------------------------------------------

  it('should have correct initial state', () => {
    const state = useReadingStore.getState();

    expect(state.currentReading).toBeNull();
    expect(state.isAnalyzing).toBe(false);
    expect(state.analyzeProgress).toBe(0);
    expect(state.error).toBeNull();
    expect(state.readings).toEqual([]);
  });

  // --- setCurrentReading ---------------------------------------------------

  it('should store a reading with setCurrentReading', () => {
    const reading = createTestReading('r-001');

    useReadingStore.getState().setCurrentReading(reading);

    const state = useReadingStore.getState();
    expect(state.currentReading).not.toBeNull();
    expect(state.currentReading!.id).toBe('r-001');
    expect(state.currentReading!.archetype).toBe('The Seeker');
    expect(state.currentReading!.lines).toHaveLength(1);
  });

  it('should clear current reading when setCurrentReading is called with null', () => {
    const reading = createTestReading('r-001');
    useReadingStore.getState().setCurrentReading(reading);
    expect(useReadingStore.getState().currentReading).not.toBeNull();

    useReadingStore.getState().setCurrentReading(null);

    expect(useReadingStore.getState().currentReading).toBeNull();
  });

  // --- setAnalyzing --------------------------------------------------------

  it('should transition isAnalyzing from true to false', () => {
    useReadingStore.getState().setAnalyzing(true);
    expect(useReadingStore.getState().isAnalyzing).toBe(true);

    useReadingStore.getState().setAnalyzing(false);
    expect(useReadingStore.getState().isAnalyzing).toBe(false);
  });

  // --- setProgress ---------------------------------------------------------

  it('should update analyzeProgress with setProgress', () => {
    useReadingStore.getState().setProgress(0.5);
    expect(useReadingStore.getState().analyzeProgress).toBe(0.5);

    useReadingStore.getState().setProgress(1);
    expect(useReadingStore.getState().analyzeProgress).toBe(1);
  });

  it('should handle edge case progress values', () => {
    useReadingStore.getState().setProgress(0);
    expect(useReadingStore.getState().analyzeProgress).toBe(0);

    useReadingStore.getState().setProgress(1);
    expect(useReadingStore.getState().analyzeProgress).toBe(1);
  });

  // --- setError ------------------------------------------------------------

  it('should set error with a message', () => {
    useReadingStore.getState().setError('Analysis failed');

    expect(useReadingStore.getState().error).toBe('Analysis failed');
  });

  it('should clear error when set to null', () => {
    useReadingStore.getState().setError('Some error');
    expect(useReadingStore.getState().error).toBe('Some error');

    useReadingStore.getState().setError(null);

    expect(useReadingStore.getState().error).toBeNull();
  });

  // --- addReading ----------------------------------------------------------

  it('should prepend readings with addReading', () => {
    const r1 = createTestReading('r-001');
    const r2 = createTestReading('r-002');

    useReadingStore.getState().addReading(r1);
    useReadingStore.getState().addReading(r2);

    const readings = useReadingStore.getState().readings;
    expect(readings).toHaveLength(2);
    // Most recent is first
    expect(readings[0].id).toBe('r-002');
    expect(readings[1].id).toBe('r-001');
  });

  it('should preserve the reading order when adding many readings', () => {
    const readings = Array.from({ length: 10 }, (_, i) =>
      createTestReading(`r-${String(i + 1).padStart(3, '0')}`),
    );

    for (const r of readings) {
      useReadingStore.getState().addReading(r);
    }

    const stored = useReadingStore.getState().readings;
    expect(stored).toHaveLength(10);
    // r-010 was added last, should be first
    expect(stored[0].id).toBe('r-010');
    expect(stored[9].id).toBe('r-001');
  });

  it('should cap readings at 50 entries', () => {
    // Add 55 readings
    for (let i = 1; i <= 55; i++) {
      const id = `r-${String(i).padStart(3, '0')}`;
      useReadingStore.getState().addReading(createTestReading(id));
    }

    const stored = useReadingStore.getState().readings;
    expect(stored).toHaveLength(50);

    // The 55th reading added (r-055) should be at index 0 (most recent)
    expect(stored[0].id).toBe('r-055');
    // The 6th reading added (r-006) should be at index 49 (oldest retained)
    expect(stored[49].id).toBe('r-006');

    // The first 5 readings (r-001 through r-005) should have been evicted
    const ids = stored.map((r) => r.id);
    expect(ids).not.toContain('r-001');
    expect(ids).not.toContain('r-002');
    expect(ids).not.toContain('r-003');
    expect(ids).not.toContain('r-004');
    expect(ids).not.toContain('r-005');
  });

  // --- clearCurrent --------------------------------------------------------

  it('should reset current reading, analyzing, progress, and error with clearCurrent', () => {
    // Set up a reading in progress
    const reading = createTestReading('r-001');
    useReadingStore.getState().setCurrentReading(reading);
    useReadingStore.getState().setAnalyzing(true);
    useReadingStore.getState().setProgress(0.75);
    useReadingStore.getState().setError('network error');

    // Clear current (simulates finishing or aborting)
    useReadingStore.getState().clearCurrent();

    const state = useReadingStore.getState();
    expect(state.currentReading).toBeNull();
    expect(state.isAnalyzing).toBe(false);
    expect(state.analyzeProgress).toBe(0);
    expect(state.error).toBeNull();

    // Readings history should be untouched
    expect(state.readings).toHaveLength(0);
  });

  it('should preserve readings history when clearCurrent is called', () => {
    const reading = createTestReading('r-keep');
    useReadingStore.getState().addReading(reading);
    useReadingStore.getState().setCurrentReading(createTestReading('r-current'));
    useReadingStore.getState().setAnalyzing(true);

    useReadingStore.getState().clearCurrent();

    const state = useReadingStore.getState();
    expect(state.currentReading).toBeNull();
    expect(state.isAnalyzing).toBe(false);
    // readings array must survive clearCurrent
    expect(state.readings).toHaveLength(1);
    expect(state.readings[0].id).toBe('r-keep');
  });

  // --- Complex interactions -------------------------------------------------

  it('should handle multiple rapid state changes correctly', () => {
    const reading = createTestReading('r-final');

    // Simulate a rapid sequence as would happen during an analysis flow
    useReadingStore.getState().setAnalyzing(true);
    useReadingStore.getState().setProgress(0.2);
    useReadingStore.getState().setProgress(0.5);
    useReadingStore.getState().setProgress(0.8);
    useReadingStore.getState().setProgress(1);
    useReadingStore.getState().setCurrentReading(reading);
    useReadingStore.getState().setAnalyzing(false);
    useReadingStore.getState().addReading(reading);

    const state = useReadingStore.getState();
    expect(state.currentReading!.id).toBe('r-final');
    expect(state.isAnalyzing).toBe(false);
    expect(state.analyzeProgress).toBe(1);
    expect(state.error).toBeNull();
    expect(state.readings).toHaveLength(1);
  });
});
