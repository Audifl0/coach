'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type SignupState = {
  error: string | null;
  pending: boolean;
};

export default function SignupPage() {
  const router = useRouter();
  const [state, setState] = useState<SignupState>({ error: null, pending: false });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const username = String(formData.get('username') ?? '').trim();
    const password = String(formData.get('password') ?? '');

    setState({ error: null, pending: true });

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setState({
          error: body?.error ?? 'Unable to create account. Please retry.',
          pending: false,
        });
        return;
      }

      const loginResponse = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (!loginResponse.ok) {
        const body = (await loginResponse.json().catch(() => null)) as { error?: string } | null;
        setState({
          error: body?.error ?? 'Account created, but automatic sign-in failed.',
          pending: false,
        });
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
      <h1>Create your account</h1>
      <form onSubmit={onSubmit}>
        <label htmlFor="username">Username</label>
        <input id="username" name="username" type="text" autoComplete="username" required />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />

        {state.error ? <p role="alert">{state.error}</p> : null}

        <button type="submit" disabled={state.pending}>
          {state.pending ? 'Creating account...' : 'Sign up'}
        </button>
      </form>
      <p>
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </main>
  );
}
