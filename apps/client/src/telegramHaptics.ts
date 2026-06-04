import type { TelegramHapticFeedback } from './telegram.ts';
import { recordHaptic } from './debugStore.ts';

const HAPTICS_KEY = 'poker:vibration';

// Dev-only logging — stripped in production builds by Vite tree-shaking.
const DEV = import.meta.env.DEV;
function devLog(...args: unknown[]): void {
  if (DEV) console.log('[haptics]', ...args);
}

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
  devLog('selectionChanged — enabled:', isEnabled(), '| hf available:', !!hf());
  if (!isEnabled()) { recordHaptic('selectionChanged', 'skipped'); return; }
  const feedback = hf();
  if (!feedback) { recordHaptic('selectionChanged', 'no-api'); return; }
  try { feedback.selectionChanged(); recordHaptic('selectionChanged', 'success'); }
  catch (e) { recordHaptic('selectionChanged', 'error'); devLog('selectionChanged error:', e); }
}

export function impactLight(): void {
  devLog('impactLight — enabled:', isEnabled(), '| hf available:', !!hf());
  if (!isEnabled()) { recordHaptic('impactLight', 'skipped'); return; }
  const feedback = hf();
  if (!feedback) { recordHaptic('impactLight', 'no-api'); return; }
  try { feedback.impactOccurred('light'); recordHaptic('impactLight', 'success'); }
  catch (e) { recordHaptic('impactLight', 'error'); devLog('impactLight error:', e); }
}

export function impactMedium(): void {
  devLog('impactMedium — enabled:', isEnabled(), '| hf available:', !!hf());
  if (!isEnabled()) { recordHaptic('impactMedium', 'skipped'); return; }
  const feedback = hf();
  if (!feedback) { recordHaptic('impactMedium', 'no-api'); return; }
  try { feedback.impactOccurred('medium'); recordHaptic('impactMedium', 'success'); }
  catch (e) { recordHaptic('impactMedium', 'error'); devLog('impactMedium error:', e); }
}

export function impactHeavy(): void {
  devLog('impactHeavy — enabled:', isEnabled(), '| hf available:', !!hf());
  if (!isEnabled()) { recordHaptic('impactHeavy', 'skipped'); return; }
  const feedback = hf();
  if (!feedback) { recordHaptic('impactHeavy', 'no-api'); return; }
  try { feedback.impactOccurred('heavy'); recordHaptic('impactHeavy', 'success'); }
  catch (e) { recordHaptic('impactHeavy', 'error'); devLog('impactHeavy error:', e); }
}

export function notificationSuccess(): void {
  devLog('notificationSuccess — enabled:', isEnabled(), '| hf available:', !!hf());
  if (!isEnabled()) { recordHaptic('notificationSuccess', 'skipped'); return; }
  const feedback = hf();
  if (!feedback) { recordHaptic('notificationSuccess', 'no-api'); return; }
  try { feedback.notificationOccurred('success'); recordHaptic('notificationSuccess', 'success'); }
  catch (e) { recordHaptic('notificationSuccess', 'error'); devLog('notificationSuccess error:', e); }
}
