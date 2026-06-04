import type { CSSProperties } from 'react';

interface DealCard {
  x: string;
  y: string;
  rot: number;
  delay: number;
}

// 10 card backs: 4 to player, 3 to left opps, 3 to right opps.
// Coordinates are offsets from screen center (the da-stage origin).
const CARDS: DealCard[] = [
  // Player's hand — fly downward
  { x: '-6vw',  y: '24vh',  rot: -6,  delay: 0   },
  { x:  '0vw',  y: '27vh',  rot:  0,  delay: 100 },
  { x:  '6vw',  y: '24vh',  rot:  6,  delay: 200 },
  { x:  '2vw',  y: '29vh',  rot: -3,  delay: 300 },
  // Left opponents — fly upper-left
  { x: '-34vw', y: '-18vh', rot: -20, delay: 40  },
  { x: '-30vw', y: '-14vh', rot: -14, delay: 140 },
  { x: '-36vw', y: '-10vh', rot: -24, delay: 240 },
  // Right opponents — fly upper-right
  { x:  '34vw', y: '-18vh', rot:  20, delay: 40  },
  { x:  '30vw', y: '-14vh', rot:  14, delay: 140 },
  { x:  '36vw', y: '-10vh', rot:  24, delay: 240 },
];

interface Props {
  active: boolean;
}

export default function DealAnimation({ active }: Props) {
  if (!active) return null;

  return (
    <div className="da-overlay">
      <div className="da-stage">
        <div className="da-deck" />
        {CARDS.map((c, i) => (
          <div
            key={i}
            className="da-card"
            style={{
              '--da-x': c.x,
              '--da-y': c.y,
              '--da-r': `${c.rot}deg`,
              animationDelay: `${c.delay}ms`,
            } as CSSProperties}
          />
        ))}
        <p className="da-label">Роздача карт...</p>
      </div>
    </div>
  );
}
