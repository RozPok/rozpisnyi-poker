// ─── Minimal Telegram WebApp types ───────────────────────────────────────────

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramHapticFeedback {
  impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
  notificationOccurred(type: 'error' | 'success' | 'warning'): void;
  selectionChanged(): void;
}

interface TelegramWebApp {
  ready(): void;
  expand(): void;
  /** Telegram client version string, e.g. "6.9" — available since Bot API 6.0 */
  version?: string;
  isVersionAtLeast?(version: string): boolean;
  initDataUnsafe: {
    user?: TelegramUser;
  };
  HapticFeedback?: TelegramHapticFeedback;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp: TelegramWebApp;
    };
  }
}

// ─── Public helpers ───────────────────────────────────────────────────────────

/** True when the app is running inside the Telegram Mini App WebView. */
export function isTelegram(): boolean {
  return typeof window !== 'undefined' && !!window.Telegram?.WebApp;
}

/**
 * Signal to Telegram that the app is ready and expand to full height.
 * Safe to call in normal browsers — isTelegram() guards the calls.
 */
export function initTelegram(): void {
  if (!isTelegram()) return;
  window.Telegram!.WebApp.ready();
  window.Telegram!.WebApp.expand();
}

/** Returns the Telegram user from initDataUnsafe, or null outside Telegram. */
export function getTelegramUser(): TelegramUser | null {
  if (!isTelegram()) return null;
  return window.Telegram!.WebApp.initDataUnsafe?.user ?? null;
}

/**
 * Derive a stable player ID from a Telegram user ID.
 * Prefixed with "tg:" to avoid collisions with UUID-based IDs.
 */
export function telegramPlayerId(userId: number): string {
  return `tg:${userId}`;
}
