import { useEffect, useRef, useState } from 'react';
import { api, setUnauthorizedHandler } from '../api';
import { Icon } from './Icons';

/**
 * Gates the whole app behind a single shared password — no accounts, this is
 * a single-user tool. Checks the session cookie on mount; on any 401 from
 * anywhere in the app (session expired mid-use), drops straight back here
 * via the onUnauthorized hook in api.ts rather than showing a raw error.
 */
export function LoginGate({ children }: { children: React.ReactNode }) {
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setUnauthorizedHandler(() => setAuthenticated(false));
    api
      .session()
      .then((s) => setAuthenticated(s.authenticated))
      .catch(() => setAuthenticated(false))
      .finally(() => setChecking(false));
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    if (!authenticated && !checking) inputRef.current?.focus();
  }, [authenticated, checking]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.login(password);
      setPassword('');
      setAuthenticated(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (checking) return null;

  if (!authenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <form onSubmit={submit} className="w-full max-w-sm">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/10 text-accent">
              <Icon.Shield className="h-5 w-5" />
            </div>
            <h1 className="text-title font-semibold tracking-[-0.01em]">Job Search HQ</h1>
            <p className="mt-1.5 text-meta text-ink-soft">Enter your password to continue.</p>
          </div>

          <input
            ref={inputRef}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete="current-password"
            disabled={submitting}
            className="field-input disabled:opacity-50"
          />
          {error && <p className="mt-2.5 text-micro text-rose">{error}</p>}
          <button
            type="submit"
            disabled={submitting || !password}
            className="btn-primary mt-4 w-full disabled:opacity-40"
          >
            {submitting ? 'Checking…' : 'Sign in'}
          </button>
        </form>
      </div>
    );
  }

  return <>{children}</>;
}
