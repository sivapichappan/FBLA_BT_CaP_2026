/**
 * "Sign in with Google" button, backed by Google Identity Services (GIS).
 *
 * We load the GIS script ON DEMAND (not in index.html) so a dropped connection
 * never blocks the rest of the auth page — the email/password form keeps working
 * (§13 resilience). GIS renders Google's own button; on success it hands back a
 * signed ID token (the "credential"), which we pass up to be exchanged for our
 * app session.
 *
 * Renders nothing when no client id is configured (local dev without the env)
 * or if the Google script can't load — so there's never a broken/dead button.
 */

import { useEffect, useRef, useState } from "react";

const CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
const GIS_SRC = "https://accounts.google.com/gsi/client";

// Minimal shape of the GIS bits we use (the script ships no npm types).
interface GoogleId {
  initialize: (cfg: {
    client_id: string;
    callback: (r: { credential: string }) => void;
  }) => void;
  renderButton: (parent: HTMLElement, opts: Record<string, unknown>) => void;
}

function gis(): GoogleId | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).google?.accounts?.id ?? null;
}

// Load the script at most once per page, even with two auth routes mounting it.
let scriptPromise: Promise<void> | null = null;
function loadGis(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    if (gis()) return resolve();
    const s = document.createElement("script");
    s.src = GIS_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Google script failed to load"));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export function GoogleSignInButton({
  onCredential,
  onError,
}: {
  onCredential: (credential: string) => void;
  onError?: (message: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Keep the latest callback so the once-initialized GIS always calls the
  // current handler (avoids a stale closure if the parent re-renders).
  const cbRef = useRef(onCredential);
  cbRef.current = onCredential;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;
    loadGis()
      .then(() => {
        const id = gis();
        if (cancelled || !id || !ref.current) return;
        id.initialize({
          client_id: CLIENT_ID,
          callback: (r) => cbRef.current(r.credential),
        });
        id.renderButton(ref.current, {
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          width: 320,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setFailed(true);
        onError?.("Google sign-in is unavailable right now.");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // No client id, or the script never loaded → render nothing (form still works).
  if (!CLIENT_ID || failed) return null;
  return <div ref={ref} className="flex justify-center" />;
}
