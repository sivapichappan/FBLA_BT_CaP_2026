/**
 * RichText (§16). The concierge's LLM replies arrive as light Markdown; these
 * tests pin that **bold** and `*`/`-` bullets become real elements — and that no
 * literal asterisks leak through to the user (the bug we're fixing).
 */

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RichText } from "../RichText";

describe("RichText", () => {
  it("renders **bold** as <strong> and never shows raw asterisks", () => {
    const { container } = render(
      <RichText text="Try **La Panadería** today" />,
    );
    const strong = container.querySelector("strong");
    expect(strong?.textContent).toBe("La Panadería");
    expect(container.textContent).not.toContain("*");
  });

  it("groups '*'/'-' lines into a bullet list with inline bold", () => {
    const text =
      "Here are some picks:\n* **La Panadería** — 0.24 km\n- **Rosella** — 0.26 km";
    const { container } = render(<RichText text={text} />);
    expect(container.querySelectorAll("li")).toHaveLength(2);
    expect(container.querySelectorAll("strong")).toHaveLength(2);
    expect(container.querySelector("p")?.textContent).toBe(
      "Here are some picks:",
    );
    expect(container.textContent).not.toContain("*");
  });

  it("leaves plain text untouched", () => {
    const { container } = render(<RichText text="just a sentence" />);
    expect(container.textContent).toBe("just a sentence");
    expect(container.querySelector("strong")).toBeNull();
  });
});
