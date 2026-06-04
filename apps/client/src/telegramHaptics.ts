import type { TelegramHapticFeedback } from './telegram.ts';

const HAPTICS_KEY = 'poker:vibration';

function hf(): TelegramHapticFeedback | undefined {
  return window.Telegram?.WebApp?.HapticFeedback;
}

function isEnabled(): boolean {
  try {
    const v = localStorage.getItem(HAPTICS_KEY);
    return v === null ? true : v === 'true';
  } catch {
    return true;
  }
}

export function getHapticsEnabled(): boolean {
  return isEnabled();
}

export function setHapticsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(HAPTICS_KEY, String(enabled));
  } catch {}
}

export function selectionChanged(): void {
  if (!isEnabled()) return;
  try { hf()?.selectionChanged(); } catch {}
}

export function impactLight(): void {
  if (!isEnabled()) return;
  try { hf()?.impactOccurred('light'); } catch {}
}

export function impactMedium(): void {
  if (!isEnabled()) return;
  try { hf()?.impactOccurred('medium'); } catch {}
}

export function impactHeavy(): void {
  if (!isEnabled()) return;
  try { hf()?.impactOccurred('heavy'); } catch {}
}

export function notificationSuccess(): void {
  if (!isEnabled()) return;
  try { hf()?.notificationOccurred('success'); } catch {}
}
