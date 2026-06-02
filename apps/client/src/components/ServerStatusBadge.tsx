import type { ServerStatus } from '../hooks/useServerStatus.ts';

export default function ServerStatusBadge({ status }: { status: ServerStatus }) {
  const label =
    status === 'checking' ? '⚪ Перевірка сервера…' :
    status === 'online'   ? '🟢 Сервер онлайн' :
                            '🔴 Сервер недоступний';
  return <p className={`server-status server-status--${status}`}>{label}</p>;
}
