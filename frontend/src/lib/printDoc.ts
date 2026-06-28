/**
 * Hand-rolled "print to a nicely formatted PDF" — no PDF library to attribute
 * (§18). Instead of printing the live page (a screenshot of the dashboard), we
 * build a self-contained HTML REPORT DOCUMENT with its own print stylesheet and
 * render it into a hidden <iframe>, then open the browser's print dialog on just
 * that iframe. The user picks "Save as PDF" and gets a clean, paginated report
 * that's completely decoupled from the app's on-screen chrome and theme.
 *
 * Everything dynamic is HTML-escaped (esc) before it goes into the document, so
 * a business name or review snippet containing < or " can never break — or
 * inject into — the printout.
 */

import type { Change } from "../types";

/** Escape text for safe interpolation into the HTML document. */
export function esc(s: string | number): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** A ▲/▼ percentage delta, or "new" when there was no prior base. */
function deltaHtml(change?: Change): string {
  if (!change) return "";
  if (change.pct === null)
    return change.abs ? ` <span class="up">new</span>` : "";
  if (change.pct === 0) return "";
  const up = change.pct > 0;
  return ` <span class="${up ? "up" : "down"}">${up ? "▲" : "▼"} ${Math.abs(
    change.pct,
  )}%</span>`;
}

/** A grid of headline numbers, each with an optional comparison delta. */
export function kpiGrid(
  items: { label: string; value: string; change?: Change }[],
): string {
  const cells = items
    .map(
      (k) =>
        `<div class="kpi"><div class="v">${esc(k.value)}${deltaHtml(
          k.change,
        )}</div><div class="l">${esc(k.label)}</div></div>`,
    )
    .join("");
  return `<div class="kpis">${cells}</div>`;
}

/** A horizontal bar list (e.g. spend by category, rating distribution). */
export function barList(
  items: { label: string; value: number; display: string }[],
): string {
  const max = Math.max(1, ...items.map((i) => i.value));
  const rows = items
    .map(
      (i) =>
        `<div class="bar-row"><span class="bar-label">${esc(
          i.label,
        )}</span><span class="bar-track"><span class="bar-fill" style="width:${Math.max(
          (i.value / max) * 100,
          i.value > 0 ? 2 : 0,
        )}%"></span></span><span class="bar-val">${esc(i.display)}</span></div>`,
    )
    .join("");
  return `<div class="bars">${rows}</div>`;
}

/** A data table. `head` flags which columns are numeric (right-aligned, mono). */
export function dataTable(
  head: { label: string; num?: boolean }[],
  rows: (string | number)[][],
): string {
  const ths = head
    .map((h) => `<th class="${h.num ? "num" : ""}">${esc(h.label)}</th>`)
    .join("");
  const trs = rows
    .map(
      (r) =>
        `<tr>${r
          .map(
            (c, i) => `<td class="${head[i]?.num ? "num" : ""}">${esc(c)}</td>`,
          )
          .join("")}</tr>`,
    )
    .join("");
  return `<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`;
}

/** A titled section wrapper (kept together across page breaks). */
export function sectionBlock(title: string, innerHtml: string): string {
  return `<section class="blk"><h2 class="section">${esc(
    title,
  )}</h2>${innerHtml}</section>`;
}

/** The auto-narrative highlights as a calm callout. */
export function narrativeBlock(lines: string[]): string {
  if (!lines.length) return "";
  return `<div class="narrative"><ul>${lines
    .map((l) => `<li>${esc(l)}</li>`)
    .join("")}</ul></div>`;
}

const PRINT_CSS = `
  :root { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #1f1b16; font-size: 12px; line-height: 1.45; background: #fff;
  }
  @page { margin: 1.5cm; }
  .doc { max-width: 760px; margin: 0 auto; }
  .head {
    display: flex; justify-content: space-between; align-items: flex-start;
    border-bottom: 2px solid #21436b; padding-bottom: 10px; margin-bottom: 4px;
  }
  .brand { font-family: Georgia, "Times New Roman", serif; font-size: 22px; font-weight: 700; }
  .brand span { color: #21436b; }
  .title { font-family: Georgia, serif; font-size: 15px; color: #21436b; margin-top: 2px; }
  .meta { text-align: right; font-size: 11px; color: #5a5247; }
  h2.section {
    font-family: Georgia, serif; font-size: 14px; margin: 22px 0 8px;
    border-bottom: 1px solid #e8e0d4; padding-bottom: 4px;
  }
  .blk { break-inside: avoid; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  thead { display: table-header-group; }
  th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid #e8e0d4; }
  th {
    color: #5a5247; font-weight: 600; text-transform: uppercase;
    letter-spacing: .04em; font-size: 10px;
  }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; font-family: ui-monospace, "SFMono-Regular", Menlo, monospace; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .kpi { border: 1px solid #e8e0d4; border-radius: 6px; padding: 8px; }
  .kpi .v { font-family: Georgia, serif; font-size: 18px; font-weight: 700; }
  .kpi .l { font-size: 9px; text-transform: uppercase; letter-spacing: .05em; color: #5a5247; margin-top: 2px; }
  .up { color: #4f6b4a; font-size: 11px; }
  .down { color: #21436b; font-size: 11px; }
  .bar-row { display: flex; align-items: center; gap: 8px; margin: 4px 0; }
  .bar-label { width: 130px; font-size: 11px; }
  .bar-track { flex: 1; background: #f0eadf; border-radius: 3px; height: 12px; overflow: hidden; }
  .bar-fill { background: #2e5c8a; height: 12px; }
  .bar-val { width: 80px; text-align: right; font-family: ui-monospace, monospace; font-size: 11px; }
  .narrative { background: #fbf7f0; border: 1px solid #e8e0d4; border-radius: 6px; padding: 8px 14px; break-inside: avoid; }
  .narrative ul { margin: 0; padding-left: 16px; }
  .narrative li { margin: 3px 0; }
  .foot { margin-top: 26px; border-top: 1px solid #e8e0d4; padding-top: 8px; font-size: 10px; color: #5a5247; text-align: center; }
`;

/**
 * Render a finished report document into a hidden iframe and open the print
 * dialog on it. The iframe is removed after printing (with a fallback timer in
 * case `onafterprint` never fires).
 */
export function printReport(opts: {
  title: string;
  subtitle?: string;
  period: string;
  body: string;
}): void {
  const generated = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
    <title>${esc(opts.title)}</title><style>${PRINT_CSS}</style></head>
    <body><div class="doc">
      <div class="head">
        <div>
          <div class="brand">Local<span>Lens</span></div>
          <div class="title">${esc(opts.title)}${
            opts.subtitle ? ` — ${esc(opts.subtitle)}` : ""
          }</div>
        </div>
        <div class="meta">${esc(opts.period)}<br>Generated ${esc(generated)}</div>
      </div>
      ${opts.body}
      <div class="foot">Generated by LocalLens · getlocallens.vercel.app</div>
    </div></body></html>`;

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  const doc = iframe.contentDocument || win?.document;
  if (!win || !doc) {
    iframe.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();

  let removed = false;
  const cleanup = () => {
    if (removed) return;
    removed = true;
    iframe.remove();
  };
  win.onafterprint = cleanup;
  // Give the iframe a tick to lay out, then print; fall back to removing it.
  setTimeout(() => {
    win.focus();
    win.print();
    setTimeout(cleanup, 60_000);
  }, 250);
}
