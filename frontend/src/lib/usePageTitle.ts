/**
 * Per-page document titles — orientation for screen-reader users and sensible
 * browser-tab history (part of the accessibility pass, §14).
 */

import { useEffect } from "react";

export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} — LocalLens` : "LocalLens";
  }, [title]);
}
