/**
 * Sign-in. Server errors (bad credentials, the §8.6 lockout's 429) surface as
 * friendly inline messages — the lockout message is part of the live demo.
 */

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { usePageTitle } from "../lib/usePageTitle";

export function Login() {
  usePageTitle("Sign in");
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Sign-in failed. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container-page flex justify-center py-16">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-warm sm:p-8"
      >
        <h1 className="font-display text-3xl font-semibold text-ink">
          Welcome back
        </h1>
        <p className="mt-1 font-serif text-ink-soft">
          Sign in to save favorites, review, and redeem deals.
        </p>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-md border border-accent-600/40 bg-cream px-3 py-2 font-serif text-sm text-accent-700"
          >
            {error}
          </p>
        )}

        <label
          htmlFor="email"
          className="mt-5 block font-serif text-sm text-ink-soft"
        >
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-md border border-border bg-cream px-3 py-2 font-serif"
        />

        <label
          htmlFor="password"
          className="mt-4 block font-serif text-sm text-ink-soft"
        >
          Password
        </label>
        <input
          id="password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-md border border-border bg-cream px-3 py-2 font-serif"
        />

        <button
          type="submit"
          disabled={busy}
          className="mt-6 w-full rounded-md bg-accent-700 py-2.5 font-serif font-medium text-cream hover:bg-accent-600 disabled:opacity-60"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <p className="mt-4 text-center font-serif text-sm text-ink-soft">
          New here?{" "}
          <Link
            to="/register"
            className="text-accent-700 underline-offset-2 hover:underline"
          >
            Create an account
          </Link>
        </p>
      </form>
    </main>
  );
}
