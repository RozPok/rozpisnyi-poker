import type { GameRoom } from '@rozpisnyi-poker/shared';
import { TRUMP_SUIT_LABELS } from '@rozpisnyi-poker/shared';
import GraphicCard from './GraphicCard.tsx';

interface Props {
  room: GameRoom;
  myId: string;
  onMenuOpen: () => void;
}

export default function TopBar({ room, myId, onMenuOpen }: Props) {
  const ar = room.activeRound!;
  const gs = room.gameSheet!;

  const trumpSuit = ar.trumpSuit;
  const trumpCard = ar.trumpCard;
  const trumpIsRed = trumpSuit === 'hearts' || trumpSuit === 'diamonds';
  const trumpLabel  = trumpSuit ? TRUMP_SUIT_LABELS[trumpSuit] : 'Без козиря';

  // Sort players by score descending so the leader is always first
  const sorted = [...room.players].sort((a, b) => {
    const sa = gs.scores.find(s => s.playerId === a.id)?.total ?? 0;
    const sb = gs.scores.find(s => s.playerId === b.id)?.total ?? 0;
    return sb - sa;
  });

  return (
    <header className="gs-topbar">

      {/* Left: compact score strip */}
      <div className="gs-scores">
        {sorted.map(p => {
          const total = gs.scores.find(s => s.playerId === p.id)?.total ?? 0;
          return (
            <span
              key={p.id}
              className={`gs-score-pill${p.id === myId ? ' gs-score-pill--me' : ''}`}
            >
              <span className="gs-score-name">{p.name.slice(0, 5)}</span>
              <span className="gs-score-val">{total}</span>
            </span>
          );
        })}
      </div>

      {/* Center: round X/Y · N cards · trump */}
      <div className="gs-topbar-center">
        <span className="gs-round-badge">
          {ar.roundIndex + 1}<span className="gs-round-sep">/{gs.rounds.length}</span>
        </span>
        <span className="gs-cards-badge">{ar.cardsPerPlayer}к</span>
        {trumpCard ? (
          <GraphicCard card={trumpCard} size="sm" />
        ) : (
          <span
            className={[
              'gs-trump-text',
              trumpIsRed ? 'gs-trump-text--red' : trumpSuit ? '' : 'gs-trump-text--none',
            ].filter(Boolean).join(' ')}
          >
            {trumpLabel}
          </span>
        )}
      </div>

      {/* Right: menu button */}
      <button className="gs-menu-btn" onClick={onMenuOpen} aria-label="Меню">
        ☰
      </button>

    </header>
  );
}
