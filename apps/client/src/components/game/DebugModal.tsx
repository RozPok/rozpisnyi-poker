import { useState, useEffect } from 'react';
import { isTelegram } from '../../telegram.ts';
import {
  getHapticsEnabled,
  impactLight,
  impactMedium,
  selectionChanged,
  notificationSuccess,
} from '../../telegramHaptics.ts';
import { getDebugStore } from '../../debugStore.ts';

interface Props {
  onClose: () => void;
  /** Triggers a visual DealAnimation test without touching game state */
  onTestDealAnim: () => void;
}

function fmtTime(ts: number | null | undefined): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('uk-UA', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export default function DebugModal({ onClose, onTestDealAnim }: Props) {
  // Refresh every 500 ms so newly-fired haptic/anim records appear promptly.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 500);
    return () => clearInterval(id);
  }, []);

  const store          = getDebugStore();
  const tgAvailable    = isTelegram();
  const hfAvailable    = !!window.Telegram?.WebApp?.HapticFeedback;
  const tgVersion      = window.Telegram?.WebApp?.version ?? 'n/a';
  const reducedMotion  = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const vibration      = getHapticsEnabled();
  const url            = window.location.href;
  const ua             = navigator.userAgent.length > 72
    ? navigator.userAgent.slice(0, 72) + '…'
    : navigator.userAgent;

  function testHaptics() {
    impactLight();
    setTimeout(() => impactMedium(),          200);
    setTimeout(() => selectionChanged(),       400);
    setTimeout(() => notificationSuccess(),    600);
  }

  function testAndClose() {
    onClose();
    // Small delay so the modal unmounts before the animation overlay mounts
    setTimeout(onTestDealAnim, 80);
  }

  const haptic     = store.lastHaptic;
  const dealAnim   = store.lastDealAnim;

  return (
    <div className="dbg-overlay" onClick={onClose}>
      <div className="dbg-modal" onClick={e => e.stopPropagation()}>

        <p className="dbg-title">Діагностика</p>

        {/* ── Telegram / haptics ── */}
        <div className="dbg-grid">
          <Row label="isTelegram"      value={tgAvailable ? 'yes' : 'no'}  ok={tgAvailable} />
          <Row label="Telegram version" value={tgVersion} />
          <Row label="HapticFeedback"  value={hfAvailable ? 'yes' : 'no ⚠'} ok={hfAvailable} warn={!hfAvailable} />
          <Row label="vibration"       value={vibration ? 'on' : 'off'}    ok={vibration} />
          <Row label="reducedMotion"   value={reducedMotion ? 'yes ⚠' : 'no'} warn={reducedMotion} ok={!reducedMotion} />
        </div>

        <div className="dbg-divider" />

        {/* ── Last haptic call ── */}
        <div className="dbg-grid">
          <Row label="lastHaptic"
               value={haptic ? `${haptic.fn}` : '—'} />
          <Row label="haptic time"
               value={fmtTime(haptic?.time)} />
          <Row label="haptic result"
               value={haptic?.result ?? '—'}
               ok={haptic?.result === 'success'}
               warn={!!haptic && haptic.result !== 'success'} />
        </div>

        <div className="dbg-divider" />

        {/* ── Last deal animation ── */}
        <div className="dbg-grid">
          <Row label="lastDealAnim"
               value={dealAnim ? dealAnim.event : '—'}
               ok={dealAnim?.event === 'started'} />
          <Row label="dealAnim time"
               value={fmtTime(dealAnim?.time)} />
        </div>

        <div className="dbg-divider" />

        {/* ── Environment ── */}
        <div className="dbg-grid">
          <span className="dbg-key">URL</span>
          <span className="dbg-val dbg-wrap">{url}</span>
          <span className="dbg-key">UA</span>
          <span className="dbg-val dbg-wrap">{ua}</span>
        </div>

        {/* ── Action buttons ── */}
        <div className="dbg-actions">
          <button className="dbg-btn" onClick={testHaptics}>
            Тест вібрації
          </button>
          <button className="dbg-btn" onClick={testAndClose}>
            Тест анімації
          </button>
        </div>

        <button className="dbg-close" onClick={onClose}>Закрити</button>
      </div>
    </div>
  );
}

// ── small helper component ────────────────────────────────────────────────────

function Row({ label, value, ok, warn }: {
  label: string;
  value: string;
  ok?: boolean;
  warn?: boolean;
}) {
  const cls = ['dbg-val', ok ? 'dbg-ok' : '', warn ? 'dbg-warn' : '']
    .filter(Boolean).join(' ');
  return (
    <>
      <span className="dbg-key">{label}</span>
      <span className={cls}>{value}</span>
    </>
  );
}
