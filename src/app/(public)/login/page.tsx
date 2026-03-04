'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type LoginState = {
  error: string | null;
  pending: boolean;
};

export default function LoginPage() {
  const router = useRouter();
  const [state, setState] = useState<LoginState>({ error: null, pending: false });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const username = String(formData.get('username') ?? '').trim();
    const password = String(formData.get('password') ?? '');

    setState({ error: null, pending: true });

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setState({ error: body?.error ?? 'Unable to sign in. Please retry.', pending: false });
        return;
      }

      router.replace('/dashboard');
      router.refresh();
    } catch {
      setState({ error: 'Network error. Please retry.', pending: false });
    }
  }

  return (
    <main>
      <h1>Sign in</h1>
      <form onSubmit={onSubmit}>
        <label htmlFor="username">Username</label>
        <input id="username" name="username" type="text" autoComplete="username" required />

        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />

        {state.error ? <p role="alert">{state.error}</p> : null}

        <button type="submit" disabled={state.pending}>
          {state.pending ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
      <p>
        Need an account? <Link href="/signup">Create one</Link>
      </p>
    </main>
  );
}
