/**
 * Single source of truth for the primary nav links. The desktop header and the
 * mobile overlay menu both render this same set so the two never drift. The
 * Owner link is role-gated (owners + admins only).
 */

export type NavItem = { to: string; label: string; end?: boolean };

export const PRIMARY_LINKS: NavItem[] = [
  { to: "/", label: "Discover", end: true },
  { to: "/search", label: "Search" },
  { to: "/deals", label: "Deals" },
  { to: "/plan", label: "Plan a day" },
  { to: "/favorites", label: "Favorites" },
];

/** Signed-in-only links (the verified-visit passport + impact report). */
export function userLinks(signedIn: boolean): NavItem[] {
  return signedIn
    ? [
        { to: "/passport", label: "Passport" },
        { to: "/impact", label: "Impact" },
      ]
    : [];
}

/** The Owner link, or null when the user can't see it. */
export function ownerLink(role?: string): NavItem | null {
  return role === "owner" || role === "admin"
    ? { to: "/owner", label: "Owner" }
    : null;
}
