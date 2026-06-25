/**
 * Cashier mode: the counter-side of the deal loop. A customer shows their
 * redemption code; the owner types it, sees deal + customer + status, and
 * marks it used in one tap. Codes for businesses the owner doesn't own read
 * as "not found" (the API enforces this — no probing other shops).
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState } from "../../components/ui";
import { ApiError, ownerApi } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { usePageTitle } from "../../lib/usePageTitle";
import type { CodeVerification } from "../../types";

const STATUS_DISPLAY: Record<
  CodeVerification["status"],
  { label: string; tone: string }
> = {
  valid: { label: "✓ Valid — not yet used", tone: "text-verified" },
  marked_used: { label: "✓ Marked as used", tone: "text-verified" },
  already_used: { label: "✕ Already used", tone: "text-accent-700" },
  not_found: { label: "✕ Code not found", tone: "text-accent-700" },
};

export function Verify() {
  usePageTitle("Verify a code");
  const { user } = useAuth();
  const [code, setCode] = useState("");
  const [result, setResult] = useState<CodeVerification | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function check(markUsed: boolean) {
    if (code.trim().length < 4) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await ownerApi.verifyCode(code.trim(), markUsed));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Verification failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!user || (user.role !== "owner" && user.role !== "admin"))
    return (
      <main className="container-page py-8">
        <EmptyState title="Owners only">
          <Link to="/login" className="text-accent-700 underline">
            Sign in as an owner
          </Link>{" "}
          to verify customer codes.
        </EmptyState>
      </main>
    );

  return (
    <main className="container-page max-w-xl py-8">
      <h1 className="font-display text-3xl font-semibold text-ink">
        Verify a customer code
      </h1>
      <p className="mt-1 font-serif text-ink-soft">
        Ask the customer for the code from their Deals page, type it in, and
        mark it used once you've honored the discount.
      </p>

      <form
        className="mt-5 rounded-lg border border-border bg-surface p-6"
        onSubmit={(e) => {
          e.preventDefault();
          check(false);
        }}
      >
        <label
          htmlFor="verify-code"
          className="block font-serif text-sm text-ink-soft"
        >
          Redemption code
        </label>
        <input
          id="verify-code"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            setResult(null);
          }}
          maxLength={16}
          placeholder="e.g. CAFE1A2B"
          autoComplete="off"
          className="mt-1 w-full rounded-md border border-border bg-cream px-4 py-3 text-center font-mono text-2xl tracking-[0.3em] text-ink"
        />
        <div className="mt-4 flex gap-3">
          <button
            type="submit"
            disabled={busy || code.trim().length < 4}
            className="flex-1 rounded-md border border-border py-2.5 font-serif font-medium text-ink hover:border-accent-600 disabled:opacity-50"
          >
            Check
          </button>
          <button
            type="button"
            onClick={() => check(true)}
            disabled={busy || code.trim().length < 4}
            className="flex-1 rounded-md bg-accent-700 py-2.5 font-serif font-medium text-cream hover:bg-accent-600 disabled:opacity-50"
          >
            Check & mark used
          </button>
        </div>
      </form>

      {error && (
        <p role="alert" className="mt-4 font-serif text-accent-700">
          {error}
        </p>
      )}

      {result && (
        <div
          role="status"
          className="mt-5 rounded-lg border border-border bg-surface p-6"
        >
          <p
            className={`font-display text-2xl font-semibold ${STATUS_DISPLAY[result.status].tone}`}
          >
            {STATUS_DISPLAY[result.status].label}
          </p>
          {result.status !== "not_found" && (
            <dl className="mt-3 space-y-1 font-serif text-ink">
              <div className="flex justify-between gap-4">
                <dt className="text-ink-soft">Deal</dt>
                <dd>
                  {result.deal_title} (−{result.discount_pct}%)
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-soft">Business</dt>
                <dd>{result.business_name}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-soft">Customer</dt>
                <dd>@{result.customer}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-soft">Redeemed</dt>
                <dd>
                  {result.redeemed_at &&
                    new Date(result.redeemed_at).toLocaleString()}
                </dd>
              </div>
              {result.verified_at && (
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-soft">Used on</dt>
                  <dd>{new Date(result.verified_at).toLocaleString()}</dd>
                </div>
              )}
            </dl>
          )}
          {result.status === "valid" && (
            <button
              type="button"
              onClick={() => check(true)}
              disabled={busy}
              className="mt-4 w-full rounded-md bg-accent-700 py-2.5 font-serif font-medium text-cream hover:bg-accent-600 disabled:opacity-50"
            >
              Mark as used
            </button>
          )}
        </div>
      )}
    </main>
  );
}
