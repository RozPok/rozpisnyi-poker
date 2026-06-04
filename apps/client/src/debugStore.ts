// Lightweight in-memory store for the temporary debug panel.
// Written by haptics helpers and DealAnimation; read by DebugModal.

export type HapticResult = 'success' | 'skipped' | 'no-api' | 'error';

export interface HapticTrace {
  fn: string;
  result: HapticResult;
  time: number;
}

export interface DealAnimTrace {
  event: 'started' | 'ended';
  time: number;
}

interface DebugStore {
  lastHaptic: HapticTrace | null;
  lastDealAnim: DealAnimTrace | null;
}

const store: DebugStore = { lastHaptic: null, lastDealAnim: null };

export function recordHaptic(fn: string, result: HapticResult): void {
  store.lastHaptic = { fn, result, time: Date.now() };
}

export function recordDealAnim(event: 'started' | 'ended'): void {
  store.lastDealAnim = { event, time: Date.now() };
}

export function getDebugStore(): DebugStore {
  return store;
}
