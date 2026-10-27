import type { FormEvent, RefObject } from 'react';
import { Icon } from '../Icons';

interface Props {
  password: string;
  onPassword: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
  submitting: boolean;
  error: string | null;
  inputRef: RefObject<HTMLInputElement>;
}

/** Matcha's split sign-in: wordmark panel + form. The state and submit handler live in LoginGate; this is only the layout. */
export function MatchaLogin({ password, onPassword, onSubmit, submitting, error, inputRef }: Props) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <section className="flex flex-col justify-between gap-10 bg-accent p-8 text-on-accent md:flex-1 md:p-14">
        <p className="mx-mono font-medium">Job Search HQ</p>
        <h1 className="mx-display-xl font-display-matcha font-normal">
          Job
          <br />
          Search
          <br />
          HQ
        </h1>
        <p className="mx-mono hidden md:block">Private · self-hosted</p>
      </section>

      <section className="flex flex-1 flex-col justify-center gap-8 px-8 py-12 md:px-16 lg:px-24">
        <div className="flex flex-col gap-3">
          <p className="mx-mono text-accent">Sign in</p>
          <h2 className="mx-display-lg font-display-matcha font-normal">Welcome back.</h2>
          <p className="text-subhead text-ink-soft">Enter your password to continue.</p>
        </div>
        <form onSubmit={onSubmit} className="flex w-full max-w-[420px] flex-col gap-4">
          <label className="flex flex-col gap-2">
            <span className="mx-mono text-ink-soft">Password</span>
            <input
              ref={inputRef}
              type="password"
              value={password}
              onChange={(e) => onPassword(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              disabled={submitting}
              className="field-input h-14 px-5 disabled:opacity-50"
            />
          </label>
          {error && <p className="text-micro text-rose">{error}</p>}
          <button type="submit" disabled={submitting || !password} className="btn-primary h-14 w-full text-subhead disabled:opacity-40">
            {submitting ? 'Checking…' : 'Sign in'}
            {!submitting && <Icon.Arrow className="h-4 w-4" />}
          </button>
        </form>
      </section>
    </div>
  );
}
