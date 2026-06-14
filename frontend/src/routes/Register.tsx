/**
 * Account creation. Client-side checks (password length/match) give instant
 * feedback; the server re-validates everything (§12) — client checks are UX,
 * never the security boundary.
 */

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { usePageTitle } from "../lib/usePageTitle";

export function Register() {
  usePageTitle("Join");
  const { register } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [asOwner, setAsOwner] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8)
      return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords don't match.");
    setBusy(true);
    try {
      await register({ email, password, role: asOwner ? "owner" : "user" });
      navigate("/");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Registration failed. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container-page flex justify-center py-16">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md rounded-lg border border-border bg-surface p-8 shadow-warm"
      >
        <h1 className="font-display text-3xl font-semibold text-ink">
          Join LocalLens
        </h1>
        <p className="mt-1 font-serif text-ink-soft">
          Free, for locals and business owners alike.
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
          htmlFor="reg-email"
          className="mt-5 block font-serif text-sm text-ink-soft"
        >
          Email
        </label>
        <input
          id="reg-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-md border border-border bg-cream px-3 py-2 font-serif"
        />

        <label
          htmlFor="reg-password"
          className="mt-4 block font-serif text-sm text-ink-soft"
        >
          Password <span className="font-mono text-xs">(8+ characters)</span>
        </label>
        <input
          id="reg-password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-md border border-border bg-cream px-3 py-2 font-serif"
        />

        <label
          htmlFor="reg-confirm"
          className="mt-4 block font-serif text-sm text-ink-soft"
        >
          Confirm password
        </label>
        <input
          id="reg-confirm"
          type="password"
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="mt-1 w-full rounded-md border border-border bg-cream px-3 py-2 font-serif"
        />

        <label className="mt-4 flex items-center gap-2 font-serif text-sm text-ink-soft">
          <input
            type="checkbox"
            checked={asOwner}
            onChange={(e) => setAsOwner(e.target.checked)}
          />
          I'm a business owner
        </label>

        <button
          type="submit"
          disabled={busy}
          className="mt-6 w-full rounded-md bg-accent-700 py-2.5 font-serif font-medium text-cream hover:bg-accent-600 disabled:opacity-60"
        >
          {busy ? "Creating account…" : "Create account"}
        </button>

        <p className="mt-4 text-center font-serif text-sm text-ink-soft">
          Already a member?{" "}
          <Link
            to="/login"
            className="text-accent-700 underline-offset-2 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </form>
    </main>
  );
}
