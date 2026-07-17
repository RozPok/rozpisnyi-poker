import { useEffect, useRef, useState } from 'react';

/**
 * Test-Lab-only jumpscare. When `active` becomes true for a new deal, it waits
 * `delayMs`, then flashes a full-screen image for `durationMs`, exactly once per
 * deal. Renders nothing in normal games — GameScreen only mounts it when
 * `room.mode === 'test'`.
 *
 * `active` is the *personal* trigger computed by the parent:
 *   isTestLab && (my own hand contains the Joker) && (my hand is visible).
 * So it fires only for the player who actually holds the Joker, and only once
 * the hand is revealed (after the Темна/Відкрита choice, bid, or — for
 * no-trump/misere/golden — right after the deal).
 *
 * "Once per deal" is enforced with a ref keyed on `dealKey` (the round index):
 * after firing for a deal it never re-arms for that same deal, no matter how
 * many times the component re-renders or `active` toggles.
 */

interface Props {
  /** True only when THIS player should see the screamer this deal (see above). */
  active: boolean;
  /** Round index — changes on every new deal so the screamer re-arms once. */
  dealKey: number;
  /** Delay after `active` becomes true before the image shows. Default 2000 ms. */
  delayMs?: number;
  /** How long the image stays visible. Default 850 ms. */
  durationMs?: number;
}

export default function JokerScreamer({
  active,
  dealKey,
  delayMs = 2000,
  durationMs = 850,
}: Props) {
  const [visible, setVisible] = useState(false);
  const firedForDealRef = useRef<number | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  };

  // New deal → reset arming state and hide any in-flight overlay.
  useEffect(() => {
    firedForDealRef.current = null;
    setVisible(false);
    return clearTimers;
  }, [dealKey]);

  // Arm exactly once per deal, the moment `active` becomes true.
  useEffect(() => {
    if (!active) return;
    if (firedForDealRef.current === dealKey) return; // already fired this deal
    firedForDealRef.current = dealKey;
    const showT = setTimeout(() => {
      setVisible(true);
      const hideT = setTimeout(() => setVisible(false), durationMs);
      timersRef.current.push(hideT);
    }, delayMs);
    timersRef.current.push(showT);
  }, [active, dealKey, delayMs, durationMs]);

  // Belt-and-braces: never leave a timer running after unmount.
  useEffect(() => clearTimers, []);

  if (!visible) return null;

  return (
    <div className="joker-screamer" aria-hidden="true">
      <img src="/assets/joker-screamer.webp" alt="" />
    </div>
  );
}
