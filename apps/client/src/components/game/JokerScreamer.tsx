import { useEffect, useState } from 'react';

/**
 * Test-Lab-only jumpscare. Flashes a full-screen image for ~850 ms once per deal
 * when the Joker (Жопа) was dealt to any player. Renders nothing in normal games —
 * it is only mounted by GameScreen when `room.mode === 'test'`.
 *
 * "Once per deal" is enforced by keying the effect on `dealKey` (the round index):
 * the effect only re-runs when a new deal arrives, never on incidental re-renders.
 */

const DURATION_MS = 850;

interface Props {
  /** Round index — changes on every new deal so the screamer re-arms exactly once. */
  dealKey: number;
  /** True when the Joker was dealt to some player this deal. */
  jokerDealt: boolean;
}

export default function JokerScreamer({ dealKey, jokerDealt }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!jokerDealt) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), DURATION_MS);
    // Cleanup runs on the next deal and on unmount → overlay never gets stuck.
    return () => {
      clearTimeout(t);
      setVisible(false);
    };
  }, [dealKey, jokerDealt]);

  if (!visible) return null;

  return (
    <div className="joker-screamer" aria-hidden="true">
      <img src="/assets/joker-screamer.webp" alt="" />
    </div>
  );
}
