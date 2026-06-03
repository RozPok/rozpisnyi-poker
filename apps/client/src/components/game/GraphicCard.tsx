import type { Card } from '@rozpisnyi-poker/shared';

const SUIT_SYMBOL: Record<string, string> = {
  spades:   '♠',
  hearts:   '♥',
  diamonds: '♦',
  clubs:    '♣',
  joker:    '★',
};

interface Props {
  card: Card;
  /** sm = 36×52 px, md = 48×68 px (default), lg = 60×84 px (trump display) */
  size?: 'sm' | 'md' | 'lg';
  faceDown?: boolean;
  /** Card visually lifted — indicates selection from hand */
  selected?: boolean;
  dimmed?: boolean;
  illegal?: boolean;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
}

export default function GraphicCard({
  card,
  size = 'md',
  faceDown = false,
  selected = false,
  dimmed = false,
  illegal = false,
  className = '',
  onClick,
  disabled = false,
}: Props) {
  const base = ['gcard', `gcard--${size}`, className].filter(Boolean);

  if (faceDown) {
    return <div className={[...base, 'gcard--back'].join(' ')} />;
  }

  const interactive = !!onClick && !disabled;
  const stateClasses = [
    selected    ? 'gcard--selected'     : '',
    dimmed      ? 'gcard--dimmed'       : '',
    illegal     ? 'gcard--illegal'      : '',
    interactive ? 'gcard--interactive'  : '',
  ].filter(Boolean);

  const handleClick = interactive ? onClick : undefined;
  const role = onClick ? 'button' : undefined;
  const tabIndex = interactive ? 0 : undefined;

  if (card.isJoker) {
    return (
      <div
        role={role}
        tabIndex={tabIndex}
        className={[...base, 'gcard--joker', ...stateClasses].join(' ')}
        onClick={handleClick}
      >
        <span className="gcard-corner">
          <span className="gcard-rank">Ж</span>
          <span className="gcard-suit">★</span>
        </span>
        <span className="gcard-center gcard-center--joker">★</span>
      </div>
    );
  }

  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
  const suitSymbol = SUIT_SYMBOL[card.suit] ?? '?';

  return (
    <div
      role={role}
      tabIndex={tabIndex}
      className={[...base, isRed ? 'gcard--red' : '', ...stateClasses].filter(Boolean).join(' ')}
      onClick={handleClick}
    >
      <span className="gcard-corner">
        <span className="gcard-rank">{card.rank}</span>
        <span className="gcard-suit">{suitSymbol}</span>
      </span>
      <span className="gcard-center">{suitSymbol}</span>
    </div>
  );
}
