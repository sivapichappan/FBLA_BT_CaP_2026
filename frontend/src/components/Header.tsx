/**
 * Top navigation — auth-aware: shows Sign in/Join when signed out, the
 * username + sign-out when signed in. NavLink gives the current page an
 * underline (and aria-current for screen readers). Also hosts the dark-mode
 * toggle: a pressed-state button (aria-pressed) wired to lib/theme.ts.
 */

import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { toggleTheme, useTheme } from "../lib/theme";

/** Sun/moon toggle. aria-pressed announces the state; the label names the
 *  action so screen readers hear "Dark mode, toggle button, pressed". */
function ThemeToggle() {
  const theme = useTheme();
  const dark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-pressed={dark}
      aria-label="Dark mode"
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-ink-soft transition-colors hover:border-accent-600 hover:text-ink"
    >
      {dark ? (
        /* moon */
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      ) : (
        /* sun */
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      )}
    </button>
  );
}

function navClass({ isActive }: { isActive: boolean }) {
  // Animated underline: an ::after bar wipes in from the left on hover and stays
  // on the active page (origin-left scaleX, zeroed by the global reduced-motion
  // rule so it just appears/disappears for those users).
  return `relative font-serif transition-colors after:absolute after:-bottom-1 after:left-0 after:h-[2px] after:w-full after:origin-left after:bg-accent-600 after:transition-transform after:duration-300 hover:after:scale-x-100 ${
    isActive
      ? "text-ink after:scale-x-100"
      : "text-ink-soft hover:text-ink after:scale-x-0"
  }`;
}

export function Header() {
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/85 backdrop-blur-sm">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Link
          to="/"
          className="font-display text-2xl font-semibold tracking-tight text-ink"
          aria-label="LocalLens home"
        >
          Local<span className="text-accent-700">Lens</span>
        </Link>

        <nav aria-label="Primary" className="flex items-center gap-5">
          <NavLink to="/" className={navClass} end>
            Discover
          </NavLink>
          <NavLink to="/search" className={navClass}>
            Search
          </NavLink>
          <NavLink to="/deals" className={navClass}>
            Deals
          </NavLink>
          <NavLink to="/plan" className={navClass}>
            Plan a day
          </NavLink>
          <NavLink to="/favorites" className={navClass}>
            Favorites
          </NavLink>
          {(user?.role === "owner" || user?.role === "admin") && (
            <NavLink to="/owner" className={navClass}>
              Owner
            </NavLink>
          )}

          <ThemeToggle />

          {user ? (
            <span className="flex items-center gap-3 border-l border-border pl-5">
              <Link
                to="/profile"
                className="hidden font-mono text-xs text-ink-soft hover:text-accent-700 sm:inline"
                aria-label="My profile"
              >
                @{user.username}
              </Link>
              <button
                type="button"
                onClick={logout}
                className="rounded-md border border-border px-3 py-1.5 font-serif text-sm text-ink-soft hover:border-accent-600 hover:text-ink"
              >
                Sign out
              </button>
            </span>
          ) : (
            <span className="flex items-center gap-2 border-l border-border pl-5">
              <Link
                to="/login"
                className="font-serif text-ink-soft hover:text-ink"
              >
                Sign in
              </Link>
              <Link
                to="/register"
                className="rounded-md bg-accent-700 px-3 py-1.5 font-serif text-sm text-cream hover:bg-accent-600"
              >
                Join
              </Link>
            </span>
          )}
        </nav>
      </div>
    </header>
  );
}
