/**
 * Top navigation — auth-aware: shows Sign in/Join when signed out, the
 * username + sign-out when signed in. NavLink gives the current page an
 * underline (and aria-current for screen readers). Also hosts the dark-mode
 * toggle.
 *
 * Responsive: the full nav shows at >=lg (1024px). Below that the links are
 * replaced by a hamburger that opens <MobileMenu> (a full-screen overlay), so
 * the row never overflows on phones/tablets. Desktop and overlay render the
 * SAME link set from navLinks.ts.
 */

import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { MobileMenu } from "./MobileMenu";
import { PRIMARY_LINKS, ownerLink } from "./navLinks";
import { ThemeToggle } from "./ThemeToggle";

function navClass({ isActive }: { isActive: boolean }) {
  // Animated underline: an ::after bar wipes in from the left on hover and stays
  // on the active page (origin-left scaleX, zeroed by the global reduced-motion
  // rule so it just appears/disappears for those users).
  return `relative whitespace-nowrap font-serif transition-colors after:absolute after:-bottom-1 after:left-0 after:h-[2px] after:w-full after:origin-left after:bg-accent-600 after:transition-transform after:duration-300 hover:after:scale-x-100 ${
    isActive
      ? "text-ink after:scale-x-100"
      : "text-ink-soft hover:text-ink after:scale-x-0"
  }`;
}

export function Header() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const owner = ownerLink(user?.role);
  const links = owner ? [...PRIMARY_LINKS, owner] : PRIMARY_LINKS;

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-border bg-surface/85 backdrop-blur-sm">
        <div className="container-page flex h-16 items-center justify-between gap-4">
          <Link
            to="/"
            className="flex items-center gap-2"
            aria-label="LocalLens home"
          >
            {/* The "L" mark; alt="" — decorative, the wordmark beside it names it. */}
            <img src="/logo.png" alt="" className="h-7 w-auto sm:h-8" />
            <span className="font-display text-2xl font-semibold tracking-tight text-ink">
              Local<span className="text-accent-700">Lens</span>
            </span>
          </Link>

          {/* Desktop nav (>=1024px). Below lg the hamburger takes over. */}
          <nav
            aria-label="Primary"
            className="hidden items-center gap-4 text-sm md:flex lg:gap-5 lg:text-base"
          >
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} className={navClass} end={l.end}>
                {l.label}
              </NavLink>
            ))}

            <ThemeToggle />

            {user ? (
              <span className="flex items-center gap-3 border-l border-border pl-5">
                <Link
                  to="/profile"
                  className="hidden font-mono text-xs text-ink-soft hover:text-accent-700 lg:inline"
                  aria-label="My profile"
                >
                  @{user.username}
                </Link>
                <button
                  type="button"
                  onClick={logout}
                  className="whitespace-nowrap rounded-md border border-border px-3 py-1.5 font-serif text-sm text-ink-soft hover:border-accent-600 hover:text-ink"
                >
                  Sign out
                </button>
              </span>
            ) : (
              <span className="flex items-center gap-2 border-l border-border pl-5">
                <Link
                  to="/login"
                  className="whitespace-nowrap font-serif text-ink-soft hover:text-ink"
                >
                  Sign in
                </Link>
                <Link
                  to="/register"
                  className="whitespace-nowrap rounded-md bg-accent-700 px-3 py-1.5 font-serif text-sm text-cream hover:bg-accent-600"
                >
                  Join
                </Link>
              </span>
            )}
          </nav>

          {/* Mobile hamburger (<1024px). */}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            className="flex h-11 w-11 items-center justify-center rounded-md border border-border text-ink hover:border-accent-600 md:hidden"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>
        </div>
      </header>

      <MobileMenu
        id="mobile-menu"
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
      />
    </>
  );
}
