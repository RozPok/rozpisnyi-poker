import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getHapticsEnabled,
  setHapticsEnabled,
  selectionChanged,
  impactLight,
  impactMedium,
  impactHeavy,
  notificationSuccess,
} from './telegramHaptics.ts';

function makeMockHF() {
  return {
    impactOccurred: vi.fn(),
    notificationOccurred: vi.fn(),
    selectionChanged: vi.fn(),
  };
}

beforeEach(() => {
  localStorage.clear();
  delete (window as Window & { Telegram?: unknown }).Telegram;
});

// ─── Preference persistence ───────────────────────────────────────────────────

describe('getHapticsEnabled', () => {
  it('returns true by default (no localStorage key)', () => {
    expect(getHapticsEnabled()).toBe(true);
  });

  it('returns false after setHapticsEnabled(false)', () => {
    setHapticsEnabled(false);
    expect(getHapticsEnabled()).toBe(false);
  });

  it('returns true after toggling back on', () => {
    setHapticsEnabled(false);
    setHapticsEnabled(true);
    expect(getHapticsEnabled()).toBe(true);
  });
});

// ─── Safe outside Telegram ────────────────────────────────────────────────────

describe('safe outside Telegram (no window.Telegram)', () => {
  it('impactLight does not throw', () => { expect(() => impactLight()).not.toThrow(); });
  it('impactMedium does not throw', () => { expect(() => impactMedium()).not.toThrow(); });
  it('impactHeavy does not throw', () => { expect(() => impactHeavy()).not.toThrow(); });
  it('notificationSuccess does not throw', () => { expect(() => notificationSuccess()).not.toThrow(); });
  it('selectionChanged does not throw', () => { expect(() => selectionChanged()).not.toThrow(); });
});

// ─── Calls correct Telegram API ───────────────────────────────────────────────

describe('calls Telegram HapticFeedback when enabled', () => {
  let hf: ReturnType<typeof makeMockHF>;

  beforeEach(() => {
    hf = makeMockHF();
    (window as Window & { Telegram: unknown }).Telegram = { WebApp: { HapticFeedback: hf } as any };
  });

  it('impactLight → impactOccurred("light")', () => {
    impactLight();
    expect(hf.impactOccurred).toHaveBeenCalledWith('light');
  });

  it('impactMedium → impactOccurred("medium")', () => {
    impactMedium();
    expect(hf.impactOccurred).toHaveBeenCalledWith('medium');
  });

  it('impactHeavy → impactOccurred("heavy")', () => {
    impactHeavy();
    expect(hf.impactOccurred).toHaveBeenCalledWith('heavy');
  });

  it('notificationSuccess → notificationOccurred("success")', () => {
    notificationSuccess();
    expect(hf.notificationOccurred).toHaveBeenCalledWith('success');
  });

  it('selectionChanged → selectionChanged()', () => {
    selectionChanged();
    expect(hf.selectionChanged).toHaveBeenCalled();
  });
});

// ─── Disabled setting is a no-op ─────────────────────────────────────────────

describe('no-op when haptics disabled', () => {
  let hf: ReturnType<typeof makeMockHF>;

  beforeEach(() => {
    hf = makeMockHF();
    (window as Window & { Telegram: unknown }).Telegram = { WebApp: { HapticFeedback: hf } as any };
    setHapticsEnabled(false);
  });

  it('impactLight is silent', () => {
    impactLight();
    expect(hf.impactOccurred).not.toHaveBeenCalled();
  });

  it('impactMedium is silent', () => {
    impactMedium();
    expect(hf.impactOccurred).not.toHaveBeenCalled();
  });

  it('impactHeavy is silent', () => {
    impactHeavy();
    expect(hf.impactOccurred).not.toHaveBeenCalled();
  });

  it('notificationSuccess is silent', () => {
    notificationSuccess();
    expect(hf.notificationOccurred).not.toHaveBeenCalled();
  });

  it('selectionChanged is silent', () => {
    selectionChanged();
    expect(hf.selectionChanged).not.toHaveBeenCalled();
  });
});
