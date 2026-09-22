import { useEffect, useRef, useState } from 'react';

export interface ClaudeStreamLine {
  stream: 'out' | 'err' | 'meta' | 'done';
  line: string;
}

/**
 * Minimal live-run watcher for a runId returned by any /api/claude/* POST —
 * same SSE mechanism TerminalPanel drives inline, pulled out here so a page
 * that just wants "start a run, show its lines, know when it's done" (the
 * Role page's Review panel) doesn't have to duplicate the EventSource
 * lifecycle. TerminalPanel keeps its own copy — it has extra concerns
 * (resume, progress bars, provider choice) this doesn't need.
 */
export function useClaudeRun(onDone?: () => void) {
  const [lines, setLines] = useState<ClaudeStreamLine[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sourceRef = useRef<EventSource | null>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => () => sourceRef.current?.close(), []);

  const start = (runId: string) => {
    setError(null);
    setLines([]);
    setRunning(true);

    const source = new EventSource(`/api/claude/stream/${runId}`);
    sourceRef.current = source;

    source.onmessage = (event) => {
      const payload: ClaudeStreamLine = JSON.parse(event.data);
      if (payload.stream === 'done') {
        source.close();
        sourceRef.current = null;
        setRunning(false);
        onDoneRef.current?.();
        return;
      }
      setLines((prev) => [...prev, payload]);
    };
    source.onerror = () => {
      source.close();
      sourceRef.current = null;
      setRunning(false);
      setError('Lost connection to the process.');
    };
  };

  return { lines, running, error, start };
}
