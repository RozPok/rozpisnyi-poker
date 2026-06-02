import { useState, useEffect } from 'react';

export type ServerStatus = 'checking' | 'online' | 'offline';

export function useServerStatus(): ServerStatus {
  const [status, setStatus] = useState<ServerStatus>('checking');
  useEffect(() => {
    fetch('/health')
      .then(r => {
        if (!r.ok) throw new Error('not ok');
        return r.json() as Promise<{ status: string }>;
      })
      .then(data => setStatus(data.status === 'ok' ? 'online' : 'offline'))
      .catch(() => setStatus('offline'));
  }, []);
  return status;
}
