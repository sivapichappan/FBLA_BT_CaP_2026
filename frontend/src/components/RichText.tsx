/**
 * Minimal, safe Markdown renderer for the concierge's LLM replies. The model
 * returns light Markdown — **bold** business names and `*`/`-` bullet lists — so
 * rendering the raw string showed literal asterisks. Rather than pull in a
 * Markdown library (a heavy dep to attribute, §18), we hand-parse exactly the
 * subset the concierge produces and build React elements — so it's injection-safe
 * by construction (React escapes all text; we never set innerHTML).
 *
 * Supported: **bold** inline, and lines beginning with "* " or "- " grouped into
 * a bullet list. Everything else is a plain paragraph. Unknown markup (a stray
 * single "*") is left as-is rather than guessed at.
 */

import type { ReactNode } from "react";

/** Split a line on **bold** spans into text + <strong> nodes. */
function inline(text: string): ReactNode[] {
  // Even indices are plain text, odd indices were captured between ** **.
  return text
    .split(/\*\*(.+?)\*\*/g)
    .map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part));
}

export function RichText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];

  const flushBullets = () => {
    if (!bullets.length) return;
    const items = bullets;
    bullets = [];
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="list-disc space-y-1 pl-4">
        {items.map((b, i) => (
          <li key={i}>{inline(b)}</li>
        ))}
      </ul>,
    );
  };

  for (const line of text.split("\n")) {
    const bullet = line.match(/^\s*[*-]\s+(.*)$/);
    if (bullet) {
      bullets.push(bullet[1]);
    } else {
      flushBullets();
      if (line.trim()) {
        blocks.push(<p key={`p-${blocks.length}`}>{inline(line)}</p>);
      }
    }
  }
  flushBullets();

  return <div className="space-y-1.5">{blocks}</div>;
}
