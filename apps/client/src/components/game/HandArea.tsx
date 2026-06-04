import { useRef } from 'react';
import type { CSSProperties } from 'react';
import type { Card } from '@rozpisnyi-poker/shared';
import GraphicCard from './GraphicCard.tsx';

interface Props {
  cards: Card[];
  phase: 'bidding' | 'playing';
  /** False during dark-round / not-yet-chosen bidding phase */
  showCards: boolean;
  isMyTurn: boolean;
  isLegal: (card: Card) => boolean;
  isComplete: boolean;
  /** True while a completed trick is being displayed — no card may be played */
  trickResolving?: boolean;
  /** True while the deal animation is running — cards are not interactive */
  isDealing?: boolean;
  /** True while cards are slide-revealing after the deal animation — visual only */
  isHandRevealing?: boolean;
  /** Card that is in-flight to the table; hidden in hand until server confirms */
  hiddenCard?: Card | null;
  /** Called with the card AND the card-wrapper DOMRect for the fly animation */
  onCardClick: (card: Card, rect: DOMRect) => void;
}

export default function HandArea({
  cards,
  phase,
  showCards,
  isMyTurn,
  isLegal,
  isComplete,
  trickResolving = false,
  isDealing = false,
  isHandRevealing = false,
  hiddenCard = null,
  onCardClick,
}: Props) {
  const wrapRefs = useRef<(HTMLDivElement | null)[]>([]);
  if (!showCards) {
    return (
      <div className="ha-hidden">
        <span className="ha-hidden-label">Карти приховані до замовлення</span>
      </div>
    );
  }

  return (
    <div className="ha-root">
      <div className="ha-cards">
        {cards.map((card, idx) => {
          const legal    = phase === 'playing' ? isLegal(card) : true;
          const playable = phase === 'playing' && isMyTurn && legal && !isComplete && !trickResolving && !isDealing;
          const dimmed   = phase === 'playing' && isMyTurn && !legal && !isComplete && !trickResolving && !isDealing;
          const illegal  = dimmed;
          const isHidden = hiddenCard !== null
            && card.suit === hiddenCard.suit
            && card.rank === hiddenCard.rank
            && card.isJoker === hiddenCard.isJoker;

          return (
            <div
              key={`${card.suit}:${card.rank}:${idx}`}
              ref={el => { wrapRefs.current[idx] = el; }}
              className={`ha-card-wrap${isHandRevealing ? ' ha-card-wrap--revealing' : ''}`}
              style={{
                ...fanStyle(idx, cards.length),
                ...(isHandRevealing ? { '--ri': idx } as CSSProperties : {}),
                visibility: isHidden ? 'hidden' : 'visible',
              }}
            >
              <GraphicCard
                card={card}
                size="md"
                dimmed={dimmed}
                illegal={illegal}
                onClick={playable ? () => {
                  const rect = wrapRefs.current[idx]?.getBoundingClientRect() ?? new DOMRect();
                  onCardClick(card, rect);
                } : undefined}
                disabled={!playable}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** CSS transform for a fan spread. Cards rotate around their bottom-center. */
function fanStyle(index: number, total: number): CSSProperties {
  const marginLeft = index === 0 ? 0 : total <= 5 ? -10 : total <= 8 ? -16 : -20;
  if (total <= 1) return { position: 'relative', marginLeft: `${marginLeft}px` };

  const norm  = (index / (total - 1)) * 2 - 1;           // -1..+1
  const angle = norm * Math.min(14, total * 1.8);          // max ±14°
  const droop = norm * norm * 5;                           // parabolic vertical offset

  return {
    position: 'relative',
    marginLeft: `${marginLeft}px`,
    transform: `rotate(${angle}deg) translateY(${droop}px)`,
    transformOrigin: 'bottom center',
    zIndex: index + 1,
  };
}
