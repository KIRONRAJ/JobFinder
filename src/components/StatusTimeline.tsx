import type { Status } from '../types';
import { STATUS_DOT } from './Badges';

function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function StatusTimeline({ history }: { history: { status: Status; at: number }[] }) {
  if (history.length < 2) return null;
  return (
    <div className="flex items-center gap-1">
      {history.map((h, i) => (
        <span key={i} className="flex items-center gap-1">
          <span
            title={`${h.status} — ${formatDate(h.at)}`}
            className={`dot ${STATUS_DOT[h.status]}`}
          />
          {i < history.length - 1 && <span className="h-px w-3 bg-line" />}
        </span>
      ))}
    </div>
  );
}
