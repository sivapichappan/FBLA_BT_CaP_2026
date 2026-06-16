# LocalLens FBLA Deck — Complete Build Kit for Claude (browser)

Paste the blocks below into a fresh Claude.ai chat in this order: first **PART A** (the master prompt + design system) as a single message — let Claude build the HTML deck artifact and report the four empty SVG slots. Then keep **PART B** (slide plan + speaker script) and **PART C** (live-demo script) for yourself as your run-of-show; they are your spoken material, not pasted into the browser. Finally paste the four prompts in **PART D** one at a time, each as its own separate message, so Claude drops each SVG into its matching slot. The closing **7-MINUTE TIMING TABLE** is your at-a-glance clock for the room.

**Canonical 8-slide structure (every part below agrees with this):** 1 Title · 2 Problem · 3 Approach · 4 Pipeline (centerpiece) · 5 Inside the Gates · 6 Measured/Resilient · 7 One Engine, Every Surface · 8 See It Live (demo handoff). **Four SVG slots, mapped by content:** Problem/Approach → slides 2–3 · Pipeline → slide 4 (re-shown annotated on 5) · Accuracy/Resilience → slide 6 · Architecture → slide 7. Slide 8 has no SVG.

---a

# PART A — Master prompt + design system (paste this FIRST)

Paste everything inside the code block below into a fresh browser-Claude chat as your first message. It contains the full build brief, the "white with flavor" design system, the design tokens, the reusable layout patterns, and the 8-slide spec with four empty SVG placeholder slots. Let Claude return ONE self-contained HTML artifact before you paste anything else.

````
You are building a presentation deck for me as a single self-contained HTML artifact. Read this whole brief before writing anything, then produce the deck in ONE artifact.

## What you are building
A polished 8-slide HTML slide deck for an FBLA (Future Business Leaders of America) Coding & Programming competition. The project is **LocalLens** — an app that helps people discover and support small, independent local businesses by structurally filtering out every national chain.

## The format constraint that drives every design choice
- The full presentation block is **7 minutes**. About **3 minutes is a LIVE software demo** I run in the browser. That leaves roughly **4 minutes on these slides** — so this deck is the SPINE around a live demo, not a self-contained pitch.
- Therefore: **few words per slide, large type, one idea per slide.** Judges watch a projector from across a room. No paragraphs. No slide should take more than ~30 seconds to absorb. The slides set up and frame the demo; they do not narrate it.
- There is one explicit **DEMO HANDOFF** slide (Slide 9) — when I hit it, I stop talking to slides and switch to the live app.

## HOW to build it (technical delivery — important)
- Deliver as a **SINGLE self-contained HTML file in one artifact**, so it renders instantly in the artifact preview and I can pop it out fullscreen. Everything inline: CSS in a `<style>` block, any JS in a `<script>` block. No build step, no local files.
- Use **reveal.js loaded from CDN** (jsdelivr) for slide navigation, OR, if you prefer total control, hand-rolled semantic HTML/CSS slides with arrow-key + scroll navigation. Either is fine — pick the one you can make MOST reliable and visually controlled. If reveal.js, keep the theme minimal and override it heavily with my custom CSS so it does NOT look like a default reveal deck.
- **Whichever you choose, make each SVG slot a single clearly-commented element** (e.g. `<!-- SVG_SLOT_1 -->` wrapping the placeholder) that is trivial to find-and-replace later. When I paste an SVG in a later message, replace ONLY that one slot and leave every other slot and slide untouched.
- **Load Google Fonts from CDN**: Playfair Display (display) and Lora (body).
- Crucial: I will paste in **four SVG illustrations in later messages**, one at a time. For now, leave four clearly-labeled placeholder slots (a dashed box with the slot name centered, e.g. `[[ SVG SLOT 1: PROBLEM & APPROACH ]]`) exactly where the spec below says. When I paste an SVG, you will drop it inline into the matching slot — the SVGs must embed **inline in the HTML** (not `<img>` tags), so they scale crisply on a projector and inherit nothing that breaks them. Size each so it fills its region with comfortable margin.
- 16:9 slides. Assume a 1920×1080 projector. Make type **projector-legible from the back of a room**: body text never below ~28px equivalent, headlines large.

## THE LOOK — "white with flavor" (follow precisely)
This is a WARM EDITORIAL deck — think a premium printed magazine, not a software pitch. Specifics:
- **Background:** white or a faint warm white — use `#FDFBF7` as the canvas (a barely-there warm paper white). Pure `#FFFFFF` is acceptable for card/inset surfaces. NOT stark clinical white, NOT dark, NOT any gradient.
- **Headings & primary accent:** deep indigo `#21436B`. A slightly lighter indigo `#2E5C8A` is allowed for large decorative strokes/rules.
- **ONE warm highlight color** for the single most important emphasis per slide (a key number, one underline, the active demo cue). Use a warm amber/terracotta — `#B5683C`. Use it SPARINGLY: at most one warm element per slide. It is the spice, not the meal.
- **Forest green `#4F6B4A`** is reserved EXCLUSIVELY for "local / verified / independent" moments — the verified-local badge, the "only independents" idea, the green pins. Green = local. Never use green decoratively.
- **Type:** Playfair Display for all headlines and big numbers (high contrast, editorial). Lora for body, captions, labels. Generous line-height.
- **Texture & flourishes (subtle, tasteful):** a **thin top accent bar** (~4px, indigo) across every slide, OR a faint paper-grain behind everything — pick one, not both. Hairline rules (`1px`, color `#E8E0D4`, warm) to separate ideas. Small flourishes only: a short indigo rule under a kicker label, a refined slide-number in a corner, a tiny diamond or rule as a divider. Restraint is the brand.
- **Layout:** generous margins (at least ~8% padding on all sides), lots of whitespace, strong left-alignment for editorial feel, clear typographic hierarchy (kicker label → headline → support).
- **Warm neutrals:** ink text `#1F1B16`, soft/secondary text `#5A5247`, warm hairline `#E8E0D4`.
- Explicitly AVOID: corporate stock-white sterility, dark mode, neon, SaaS purple-blue gradients, drop-shadow-heavy "cards everywhere," emoji, clip-art icons.

## DESIGN TOKENS (use these exact values as CSS variables)
```
--canvas:   #FDFBF7;  /* faint warm white background */
--surface:  #FFFFFF;  /* insets/cards */
--ink:      #1F1B16;  /* primary text */
--ink-soft: #5A5247;  /* secondary text */
--indigo:   #21436B;  /* headings + primary accent */
--indigo-2: #2E5C8A;  /* large decorative indigo only */
--warm:     #B5683C;  /* the ONE warm highlight, used sparingly */
--forest:   #4F6B4A;  /* LOCAL / VERIFIED / INDEPENDENT only */
--hairline: #E8E0D4;  /* warm 1px rules + borders */
--font-display: "Playfair Display", Georgia, serif;
--font-body:    "Lora", Georgia, serif;
```

## REUSABLE LAYOUT PATTERNS (build these as CSS classes and reuse)
Build five slide templates as classes, then fill them:
1. **`.slide-title`** — full-bleed title. Big Playfair wordmark/title, a one-line italic tagline in Lora, a small indigo rule, presenter line at bottom. Thin top accent bar.
2. **`.slide-statement`** — one bold sentence, huge Playfair, left-aligned, lots of air. Optional small kicker label above in letter-spaced Lora caps. At most one word/number in `--warm` or `--forest`.
3. **`.slide-diagram`** — a large SVG region (≈65% of the slide) with a short caption/kicker beside or beneath it. The headline is small and sits top-left; the diagram is the hero.
4. **`.slide-stat`** — one or two BIG Playfair numbers as the hero, each with a small Lora caption beneath. Indigo numbers; the single most important number may take `--warm`. Use a hairline to divide if two stats.
5. **`.slide-demo-handoff`** — visually distinct "we're going live now" slide. Calm but unmistakable: large headline like "Let's see it live", a one-line cue, and a `--warm` element signaling action. This is the only slide that may feel like a deliberate gear-change.

## THE 9 SLIDES — build these now (placeholder SVG slots included)
Keep copy TIGHT. Suggested words are near-final; tighten if anything feels long. **Four SVG slots only — on slides 2/3, 4, 6, 7. Slides 1, 5, 8, and 9 have no slot of their own** (slide 5 re-shows the slide-4 diagram via the same element later; don't add a placeholder there).

**Slide 1 — TITLE** (`.slide-title`) — no SVG
- Wordmark: **LocalLens**
- Tagline (Lora italic): *Discover the businesses the map forgot.*
- Small line: FBLA Coding & Programming 2025–26 · "Byte-Sized Business Boost"
- Presenter line at bottom (leave a placeholder: `Presented by [names]`).

**Slide 2 — THE PROBLEM** (`.slide-diagram`)  ← SVG SLOT 1 (left half: the "buried local" problem)
- Kicker: THE PROBLEM
- Headline: **On every map, the chains win.**
- Support (one line): National chains have more reviews, ad budgets, and SEO — independents get buried, and there's no way to browse only the local ones.
- Region for `[[ SVG SLOT 1: PROBLEM & APPROACH ]]` — same diagram spans slides 2–3; here the eye sits on its left "problem" half.

**Slide 3 — THE IDEA** (`.slide-diagram`)  ← SVG SLOT 1 reused (right half: promise → engine → features)
- Kicker: OUR ANSWER
- Headline: **LocalLens shows only independent businesses.** The word "independent" in `--forest`.
- Support: Chains are structurally excluded on every surface — search, browse, deals, trips. No toggle, no exceptions.
- Same `[[ SVG SLOT 1 ]]` element, framed to its right "approach" half. (Do not create a second slot — slide 3 shares slide 2's SVG.)

**Slide 4 — HOW IT WORKS / THE PIPELINE** (`.slide-diagram`)  ← SVG SLOT 2 (the centerpiece)
- Small headline top-left: **The hard part: telling a chain from a local — at scale.**
- Kicker/caption (one line): Three cheap-to-expensive gates. Most businesses are decided for free before AI is ever called.
- Hero region: `[[ SVG SLOT 2: CHAIN-FILTERING PIPELINE ]]` — fills ~65% of slide. This is the centerpiece diagram.

**Slide 5 — INSIDE THE GATES** (`.slide-diagram`, re-shows the Slide-4 pipeline SVG) — no new SVG slot
- Kicker: BUILT TO BE TRUSTED
- Headline (small): **Each gate is a deliberate trade-off.**
- Two short support bullets: "Registry, then cache, then one batched Gemini call." · "Hard rule: if the AI is ever unsure, it keeps the business."
- Re-display the **same Pipeline SVG from Slide 4** (annotated/zoomed on the three gates). Do NOT add a new placeholder — reuse SVG SLOT 2's element.

**Slide 6 — PROOF / NUMBERS** (`.slide-stat`)  ← SVG SLOT 3
- Kicker: MEASURED, NOT CLAIMED
- Stat A (hero): **0.849** recall — caption: "registry layer catches ~85% of chains on its own, before AI."
- Stat B: **0** false positives — caption: "zero independents wrongly hidden on our 156-business labeled test set." Put the **0** in `--forest` (it's the local-protection number).
- Region for `[[ SVG SLOT 3: ACCURACY & RESILIENCE ]]` beside/under the stats. If the SVG carries the numbers, it's the hero and the on-slide stats caption it.
- Footer hairline note (small Lora): "Registry layer on our 156-business labeled set, CI-enforced. Not a whole-system accuracy claim. By design — uncertain verdicts default to small and offline unknowns pass through — it can't silently hide a local." (keep this small — it's honesty insurance, not a headline.)

**Slide 7 — THE GUARANTEE, APPLIED EVERYWHERE** (`.slide-diagram`)  ← SVG SLOT 4 (architecture)
- Kicker: ONE ENGINE
- Headline (small): **One engine. Every surface stays local.**
- Terse support: Vibe search, deals, and trip planning all inherit the same filter — chains can't leak in anywhere.
- Tech-stack line (small Lora, since there is no post-demo close slide): React + TypeScript · FastAPI · Supabase + pgvector · Gemini 2.5 Flash. Runs offline-safe on a warmed cache.
- Region for `[[ SVG SLOT 4: SYSTEM ARCHITECTURE ]]` — the engine feeding Search / Vibe / Trips / Deals.

**Slide 8 — USABLE · ACCESSIBLE · TRUSTED** (`.slide-pillars`) — no SVG
- Kicker: USABLE · ACCESSIBLE · TRUSTED
- Headline: **Built for everyone — and built to be trusted.**
- Three pillars: **A guided journey** (one clear next step · AI concierge in plain language · any city · light/dark) · **Accessible by design** (skip link + visible focus · ARIA labels + live regions · reduced-motion · ≥4.5:1 contrast in both themes) · **Trusted & validated** (inputs checked for format AND meaning, helpful errors · bcrypt + JWT · per-IP rate limits · 5 failed logins → 15-min lockout).
- Footer line (small Lora): every library, API & license documented — README · docs/ARCHITECTURE · docs/ATTRIBUTION. No templates used; all original work.

**Slide 9 — SEE IT LIVE / DEMO HANDOFF** (`.slide-demo-handoff`) — no SVG
- Headline: **Let's open it live.**
- One cue line: Search a real neighborhood — watch the chains disappear.
- A `--warm` action element. This is where I switch to the app. No post-demo slide follows.
- Live URL small in footer: getlocallens.vercel.app

## Final requirements
- Every slide: thin top accent bar (or paper grain — your pick, consistent across all), slide number bottom-corner in small Lora, generous margins.
- Make it keyboard-navigable (arrow keys) and fullscreen-friendly.
- Output ONLY the single HTML artifact. After it renders, tell me in one line which four SVG slots are waiting (and on which slides), so I know what to paste next.
````

### Design-system quick reference (yours — don't paste, use to course-correct Claude if it drifts)

**Mood:** premium printed magazine — warm, calm, editorial. Confident restraint.

| Token | Value | Use |
|---|---|---|
| Canvas | `#FDFBF7` | Faint warm-white background on every slide |
| Surface | `#FFFFFF` | Inset cards / diagram panels only |
| Ink | `#1F1B16` | Primary text |
| Ink-soft | `#5A5247` | Captions, secondary text |
| Indigo | `#21436B` | Headlines, primary accent, rules |
| Indigo-2 | `#2E5C8A` | Large decorative indigo strokes only |
| Warm | `#B5683C` | The ONE highlight — max one element per slide |
| Forest | `#4F6B4A` | LOCAL / VERIFIED / INDEPENDENT only — never decorative |
| Hairline | `#E8E0D4` | Warm 1px rules and borders |

- **Type:** Playfair Display (headlines, big numbers) + Lora (body, kickers, captions). Kickers are letter-spaced Lora small-caps. (Playfair + Lora — NOT Fraunces.)
- **Texture:** ONE of — a 4px indigo top accent bar on every slide, OR a faint paper-grain. Not both.
- **Hard do-nots:** stark corporate white, dark mode, neon, SaaS gradients, shadow-heavy card soup, emoji, clip-art, more than one warm element per slide, green for anything but "local."
- **Four SVG slots → slides:** Problem/Approach → 2–3 (shared) · Pipeline → 4 (re-shown on 5) · Accuracy/Resilience → 6 · Architecture → 7. Slides 1, 5, 8 add no new slot.
- **Five templates → slides:** Title → 1 · Diagram → 2, 3, 4, 5, 7 · Stat → 6 · Demo handoff → 8.
- **Fact guardrails (don't let Claude over-claim):** it's **Gemini 2.5 Flash** (never "Gemini Flash"); **0.849 recall / 0 false positives** is the **registry layer on a 156-business labeled set**, never a whole-system number; **green means local only**; **one warm highlight per slide**. After the deck renders, fill in presenter names on Slide 1.
- **Note for later SVG injection:** the four PART D prompts use a slightly warmer SVG-internal palette (canvas `#FBF7F0`, amber `#E0A458`) than the deck canvas (`#FDFBF7`, warm `#B5683C`). This is **intentional** for diagram contrast — do not "correct" the SVG colors to match the deck tokens.

---

# PART B — Slide-by-slide plan + speaker script + timing

This is your spoken run-of-show for the ~4 minutes of slides (240s) — keep it beside you; do not paste it into the browser. **Design note carried into every slide:** warm faint-white canvas, indigo accent, one forest-green "verified local" highlight, Playfair headings / Lora body, thin accent rules, generous whitespace, no gradients. The deck runs across three movements.

## MOVEMENT 1 — Problem + Problem-First Approach (~75s)

### Slide 1 — Hook (25s) · no diagram
**On slide:** "Search 'coffee near me.' Count the independents." / *On Google Maps and Yelp, you can't.* (full-bleed title, single forest-green underline rule)
**Say:** "Search 'coffee near me' on Google Maps right now and count how many results are actually independent, locally owned shops. It's hard — because national chains have more reviews, bigger ad budgets, and better SEO, so the local places get buried. There is no button anywhere that says 'show me only the independents.' That's the gap we set out to close with LocalLens."

### Slide 2 — The Problem (25s) · Problem/Approach SVG (left half: the "buried local" problem)
**On slide:** "Chains win the surface. Locals get buried." — More reviews, ad spend, SEO → chains dominate ranking · No mainstream way to browse *only* independents · Small businesses are invisible exactly where people look
**Say:** "Here's the structural problem. The platforms people already use are optimized for the businesses with the most marketing muscle. That's great for discovery of chains and genuinely bad for the corner bakery that does everything right but ranks on page three. The FBLA topic this year is 'Byte-Sized Business Boost' — helping people discover and support small local businesses. So the real question became: what would it take to build a discovery tool where the local business can't be buried?"

### Slide 3 — Our Approach, problem-first (25s) · Problem/Approach SVG (right half: promise → engine → features arrow)
**On slide:** "We made one promise, then engineered it." — **Only small, independent businesses — everywhere. Chains are structurally excluded. No toggle.** · Isolated the one hard problem: chain vs. independent, at scale · Built that as a reusable engine first, then layered features on top
**Say:** "Our approach was problem-first. Instead of starting with screens, we isolated the single hardest problem underneath the idea: reliably telling a chain from an independent, at scale, across the whole country. We built that as a reusable engine first, then layered search, vibe discovery, and trip planning on top of the guarantee it provides. Honesty here — our first attempt was a ten-signal heuristic detector. It wasn't good enough, so on June 11th we deleted it and rebuilt the whole thing. That rebuild is what I want to show you next."

## MOVEMENT 2 — Complex Functions: The Chain-Filtering Pipeline (~135s)

### Slide 4 — The Centerpiece: Chain-Filtering Pipeline (30s) · Pipeline SVG (full 4-stage flow: Candidates → Registry → Cache → Gemini → Output, with local-owner bypass branch)
**On slide:** "The engine: cheapest evidence first, survivors only." — **Three gates. A chain has to pass all of them to be hidden — an independent only has to pass one to be shown.**
**Say:** "This is the heart of the project. We pull candidates completely unfiltered from Google Places and our own database, then run them through three gates, ordered cheapest-evidence-first. Gate one is a chain registry — free and instant. Gate two is a 30-day verdict cache, so anything we've already judged costs zero. Only the true unknowns reach gate three: a single batched call to Gemini 2.5 Flash. Owner-listed local businesses skip the gauntlet entirely — they're accountable, not scraped. Let me walk each gate, because the design decisions inside them are the interesting part."

### Slide 5 — Inside the Gates, the technical peak (35s) · same Pipeline SVG (zoomed/annotated on the three gates — no new asset)
**On slide:** "Each gate is a deliberate trade-off." — **Registry** — 2,383 names. Seeds match *fuzzy* ("Starbucks #4271" → starbucks); AI-learned names match *exact-only* · **Cache** — checked *after* registry: fresh evidence beats a stale verdict · **Gemini 2.5 Flash** — one batched call. **Hard rule: if not sure → "small"**
**Say:** "Look at the choices. The registry holds 2,383 chain names. Curated seeds use a four-pass fuzzy match, so 'Starbucks #4271 - Downtown' still resolves to Starbucks — but names the AI learns on its own match exact-only, so one learned 'Joe's Pizza' can't accidentally blanket-hide every Joe's in the country. The cache is deliberately checked after the registry, because a freshly-learned name is stronger evidence than an old verdict. And the rule that defines the whole system is hard rule number four in the Gemini prompt: if the model is not sure, it must answer 'small.' Hiding a real independent is far worse than letting one chain slip through. The whole pipeline is biased toward protecting the local business."

### Slide 6 — It Learns, It Proves, It Survives (40s) · Accuracy/Resilience SVG (left: 0.849 / precision-1.0 on labeled set; right: degrade-path "Gemini down → likely_local → still shown")
**On slide:** "Measurable, self-improving, and crash-proof." — **Registry layer: 0.849 recall, 0 false positives** (156-business labeled set, CI-enforced) · High-confidence chain verdicts written back → needs Gemini less over time · Gemini down? Registry still filters; unknowns pass as **"likely_local"** — never hidden, never crashes
**Say:** "And we can defend this with numbers. On a 156-business hand-labeled test set, the registry layer alone hits 0.849 recall with zero false positives — precision 1.0 on that 156-business set, meaning it never wrongly hid an independent there. That floor is enforced in CI, so it can't silently regress. I'll be precise: that's the registry layer on its own labeled set — we deliberately don't publish a single combined 'system accuracy' number, because the Gemini layer that catches the long tail is validated behaviorally, not as a percentage. The system also learns: any high-confidence chain verdict gets written back to the registry, so it leans on Gemini less over time. And it degrades safely — if Gemini is unavailable, the registry still filters and unknowns pass through badged 'likely local.' By design — because uncertain verdicts default to small and offline unknowns pass straight through — the pipeline can never crash a search and can never silently hide a local. Every verdict is glass-box: you can open any result and see exactly which gate decided and why."

### Slide 7 — The Guarantee, Applied Everywhere (30s) · Architecture SVG (engine in the center feeding Search / Vibe / Trips / Deals, all inheriting the filter)
**On slide:** "One engine. Every surface stays local." — **Vibe search** — "cozy rainy-day reading spot" → semantic pgvector match, all independent · **Plan a local day** — a goal → multiple all-independent itineraries with a pin map · Same filter under search, deals, trips — chains can't leak in anywhere · *React + FastAPI + Supabase/pgvector + Gemini 2.5 Flash*
**Say:** "Because the filter is a reusable engine, every feature inherits the guarantee for free. Vibe search lets you type a feeling — 'a cozy rainy-day reading spot' — and we semantically match it against 768-dimension embeddings in pgvector, returning only independents. 'Plan a local day' takes a plain-language goal, has Gemini interpret it, and builds several distinct all-local itineraries — best overall, top-rated, shortest walk — with times and a pin map. Search, deals, trips: same engine underneath, so a chain can't leak into any of them. That's the payoff of building the hard part first — one resilient stack: React, FastAPI, Supabase with pgvector, and Gemini 2.5 Flash."

## MOVEMENT 2.5 — Built for Everyone, Built to Be Trusted (~25s)

### Slide 8 — Usable, Accessible, Trusted (25s) · no diagram (three pillars; forest ticks on the trust card)
**On slide:** "Built for everyone — and built to be trusted." — **A guided journey** (one clear next step · AI concierge in plain language · any city · light/dark) · **Accessible by design** (skip link + visible focus · ARIA + live regions · reduced-motion · AA contrast, both themes) · **Trusted & validated** (format AND meaning, helpful errors · bcrypt + JWT · 5-attempt / 15-min lockout) · *footer:* fully documented, no templates, original work
**Say:** "Two things we engineered as carefully as the filter. First, accessibility: the whole app is keyboard-navigable with a skip link and visible focus, it has screen-reader ARIA labels and live regions, it respects reduced-motion, and both the light and dark themes are contrast-checked to WCAG AA. Second, trust: every input is validated for format *and* meaning with helpful errors, passwords are bcrypt-hashed behind JWT auth, and we stop bot abuse with per-IP rate limits plus a five-attempt, fifteen-minute account lockout. And it's all documented — a README, an architecture doc, and a full attribution of every library and license. No templates; all original work."

## MOVEMENT 3 — Final Product → Launch the Demo (~25s)

### Slide 9 — See It Live (25s → hand off to live demo) · no diagram (clean handoff slide; thin forest-green rule; URL small in footer)
**On slide:** "LocalLens — live, in production." / *Now let's open it and search for real.* (warm action cue; live URL small in footer)
**Say:** "All of this is live in production today, running as a single serverless deployment. One honest note for the judges: our live Gemini key is free-tier, so during the demo I'm leaning on our pre-warmed cache to keep searches instant and quota-safe. Enough slides — let me show you the real thing. I'll search a category live and you'll watch the chains disappear."

### Slides time budget

| # | Slide | Movement | Comfortable | Tight (fits 9 in 4:00) |
|---|-------|----------|-------------|------------------------|
| 1 | Search "coffee near me." Count the independents. | 1 | 25s | 25s |
| 2 | Chains win the surface. Locals get buried. | 1 | 25s | 25s |
| 3 | We made one promise, then engineered it. | 1 | 25s | 20s |
| 4 | The engine: cheapest evidence first. | 2 | 30s | 30s |
| 5 | Each gate is a deliberate trade-off. | 2 | 35s | 30s |
| 6 | Measurable, self-improving, crash-proof. | 2 | 40s | 35s |
| 7 | One engine. Every surface stays local. | 2 | 30s | 25s |
| 8 | Usable · Accessible · Trusted (NEW) | 2.5 | 25s | 25s |
| 9 | See it live. | 3 | 30s | 25s |

**Tight column total: 240s (4:00).** The new Slide 8 (25s) is absorbed by trimming five slides ~5s each (S3, S5, S6, S7, S9) — so the deck still lands at 4:00 and the live demo keeps the full 3:00. To trim: on Slide 6 drop the spoken glass-box sentence (it still shows on Slide 5 and in the demo); on S3/S7/S9 just read a touch faster. If your room's clock is generous (~7:30), use the Comfortable column instead.

**Diagram inventory (4 SVGs, each at its peak):** Problem/Approach (slides 2–3, shared) · Pipeline (slide 4, re-shown annotated on slide 5) · Accuracy/Resilience (slide 6) · Architecture (slide 7).

---

# PART C — 3-minute live-demo script

Your live walkthrough after Slide 9 — target ~180s. **Site:** `getlocallens.vercel.app` (prod) · **Fallback:** `localhost:5173` (Vite dev) → `localhost:8000` (FastAPI). **Demo center:** Greenwich Village, NYC (MacDougal/Bleecker). **One-line through-thread to repeat:** *"Every surface shows only independents — chains are structurally excluded, not toggled off."* Open on `/` Discover, signed in, Classic mode.

| # | Time | Click / do | Say (verbatim-ish) | Judge should notice |
|---|------|-----------|--------------------|---------------------|
| **0. Open** | 0:00–0:10 (10s) | Already on **Discover** homepage, browser full-screen, location = NYC. Read the hero line aloud. | "This is LocalLens. The promise is right here: *every search shows only small, independently-owned businesses.* Let me prove it." | The mission headline + warm editorial design (Playfair/Lora, cream, single indigo accent). Calm, not corporate. |
| **A. Normal search → only independents** | 0:10–0:50 (40s) | In the search box type **`coffee`** → click **Search**. Land on `/search`. Slowly scroll the result grid. Then type **`starbucks`** → Search. | "A plain coffee search. In a few blocks of Manhattan there are dozens of Starbucks, Dunkin, Blue Bottle. **Notice there is not a single Starbucks here** — not one chain. Every card is a real independent: green 'Verified local' badges, owner-run cafés." Then: "And if I *name* a chain on purpose…" → **zero results / empty state.** "Nothing. Chains can't appear even when you ask for them by name. There's no toggle to turn this off — exclusion is the product." | (1) Grid of independents, no recognizable national chain. (2) Green "Verified local" verdict badges. (3) The `starbucks` → **0 results** moment — structural, not a filter setting. |
| **B. "Why is this local?" — verdict transparency** | 0:50–1:25 (35s) | From the `coffee` results, **click any card** → opens `/business/:ref` (BusinessDetail). Click the **"▸ why this verdict?"** disclosure to expand `VerdictBreakdown`. | "How do we *know* it's local? Click any business and open *'why this verdict?'* — this is our glass-box. It shows exactly which of four gates made the call: the owner record, our 2,383-name chain registry, the recent-audit cache, then Gemini 2.5 Flash. Here it says **'Verified as a small business'** with the reason and the source. We never just assert it — we show our work." | The expanded panel: verdict headline ("Verified as a small business"), the **source label** (Owner record / Chain registry / Recent audit / Gemini), the plain-English **reason**, and the step-by-step **checks** trail. |
| **C. Plan a local day** | 1:25–2:25 (60s) | Go to **Plan** (nav) → `/plan`. In "Describe your ideal day" type: **`A relaxed rainy afternoon — good coffee, a bookshop to browse, then a cozy dinner. Nothing too far.`** Click **Build my day**. When it returns, click between the option tabs **"Best overall," "Top rated," "Least walking."** | "Last piece — you don't pick categories from a menu, you *describe your day in plain words.* Gemini interprets the intent, and the planner builds a real walkable itinerary." (Results appear.) "And it gives me **distinct strategies** — Best overall, Top rated, Least walking — each a different route through the day, with arrival times, walking legs, and a numbered-pin map. And every stop on every option is still an independent. The local-only guarantee carries all the way through the trip planner." | (1) Free-text → structured itinerary (the LLM intent step). (2) **Multiple genuinely different** options with times + walking minutes + map pins. (3) Same green verified independents — end-to-end, not just search. |
| **D. High-impact closer — Vibe search** | 2:25–2:55 (30s) | Back to **Search** (or Discover), toggle to **✦ Vibe** mode, type **`cozy rainy day reading spot`** → Search. Point at the **"% vibe match"** badges. | "One more — *vibe search.* Instead of keywords, I describe a *feeling*: 'cozy rainy day reading spot.' This runs a semantic match — 768-dimension embeddings, meaning not text — and ranks by **vibe-match percentage.** Still only independents. Search by keyword, by category, or by *feeling* — every door leads to the same local-only result." | The mode toggle + "✦ NN% vibe match" scores. Semantic ≠ keyword search, and the independent-only guarantee holds even here. |
| **Close** | 2:55–3:00 (5s) | Land back on the verified-results grid. | "Keyword, vibe, or a whole planned day — **only independents, every time, and we show you why.** That's LocalLens." | Clean final frame on verified-local cards. |

### Extended beats — rubric coverage (fold in if your demo can run ~3:45, or swap as noted)

Slide 8 already *states* accessibility, input validation, the anti-bot lockout, and the docs — so none of these are mandatory live. But two score best when **shown**. If you have time, add them; if not, they're claimed on Slide 8 and answerable in Q&A.

| Beat | Click / do | Say | Rubric row it scores | Cost |
|---|-----------|-----|----------------------|------|
| **E1 · AI concierge (the intelligent feature)** | Open the **concierge** widget (bottom-right, every page). Ask: **"Where can I get a quiet coffee to read for an hour?"** | "Our intelligent feature is a built-in concierge. I ask in plain English; it classifies the intent, then answers **grounded in real listings — it can only recommend businesses that exist in our data**, never a chain it made up. Note the '✦ AI' tag; offline it falls back to a deterministic reply labeled '⚙ offline'." | *Intelligent feature / interactive Q&A* (the rubric's named example) | ~25s — **recommended swap for Scene D (Vibe)** if you must hold 3:00 |
| **E2 · Owner analytics — customizable report** | Switch to the **owner** account (second tab). Open the **dashboard** → change the **date range** and toggle a **metric** (numbers recompute live) → click **Export CSV**, then **Print**. | "It's two-sided. An owner gets a real analytics dashboard — a views → favorites → redemptions **conversion funnel** — customizable by date and metric, and it **recomputes server-side**, not just client filtering. One click exports the current view to **CSV** or **print** for offline analysis." | *Output & Data Analysis — customizable reports for meaningful data analysis* | ~25s — add by trimming Scene C (Plan) to a pre-warmed view |
| **E3 · Input validation (format + meaning)** | On **Register** (or a review form), submit a **bad email** and a **5-character password** → inline errors. | "Inputs are validated on both levels — **format** (is this a real email shape?) and **meaning** (is the password long enough; is this a real place?) — with a helpful message instead of a crash." | *User input is validated — syntactical AND semantic* | ~10s |
| **E4 · Anti-bot lockout** | **Don't lock a live account on stage.** Mention it (it's on Slide 8); offer to show it in Q&A on a throwaway login. | "Six rapid bad logins would trip our five-attempt, fifteen-minute account lockout — happy to demo it on a scratch account if you'd like." | *Verification step to prevent bot activity* (topic requirement) | 0s live · Q&A-ready |

**Backup closer (swap for Scene D if you prefer to end on deals):** go to `/deals` → click **Redeem** on a deal → the inline message returns a one-time **cashier code** ("your code is …"). Say: "Redemption is race-proof — one code, locked at the database level — that the owner enters at the register. It closes the loop from discovery to a real visit." (~30s.) *Vibe is the stronger visual; keep deals as the backup.*

**Scene C (Plan) is both the most time-compressible AND the most quota/latency-sensitive live call** — it does a live pool fetch plus an LLM narration of option 1. If time is tight OR the network is shaky, cut to a single pre-warmed itinerary view (skip re-running Build) rather than triggering a fresh LLM narration.

### Resilience plan

**Pre-warm the exact demo searches (run the night before AND morning-of).** From `backend/`:
```
python -m app.cache.warm
```
This drives every scripted query through the **full pipeline** and stores it on disk (~48 MB, ships to Vercel). The pass condition is **`ok == total` (all-OK)** — the run prints `Done: N/N warmed`; last observed was 37/37, but the number tracks the query lists, so don't treat the exact 37 as the gate. It pre-pays exactly the flows above — Searches: `coffee`, `bookstore`, `independent coffee`, … and **`starbucks` → "0 — chains filtered (expected)"** (empty here is *success*, not a quota failure); Vibes: `cozy rainy day reading spot`, `old new york atmosphere`; Plan: one half-day NYC plan; Category browses + detail pages for the top hits you'll click into. **Manually re-run the live click-path once during setup** so each query is also hot in the browser/HTTP layer (measured warm repeat ~0.64s).

**If Wi-Fi or Gemini fails mid-demo — keep going, don't apologize.** The pipeline degrades, it never crashes a search and never hides an independent (coded in `annotate()`):
- **Wi-Fi dies / API offline:** the pre-warmed cache serves the rehearsed searches stale — your scripted queries still return results. The chain registry still filters locally, so `starbucks` still returns zero. Stay on script.
- **Gemini specifically down:** registry still removes known chains; unknowns pass through badged "likely local" (`unverified-offline`) rather than disappearing — *"hiding a real independent is worse than letting one chain slip."* Say it out loud if asked; it's a designed safeguard.
- **Vibe search needs live AI** — if that's what's down, the UI shows a calm *"Vibe search needs the AI connection, which is unavailable right now"* notice. If offline, skip Scene D-vibe and use the deals closer (registry/cache only, no LLM).
- **Quota honesty:** the live key is free-tier, 20 requests/model/day. Registry + cache keep rehearsed flows near-zero live calls — but don't promise "unlimited live searches." Lean on the warmed cache; improvise new queries only if the room asks.

**If prod is unreachable → localhost fallback:** (1) `cd backend && uvicorn app.main:app --reload --port 8000`; (2) `cd frontend && npm run dev` → open `localhost:5173`; (3) same click-path, same warmed cache. Battery-only and offline-capable by design for prelims.

**Pre-demo RESET checklist (run in order, right before you present):**
- [ ] **Warm cache fresh:** `python -m app.cache.warm` ends all-OK (`ok == total`; last observed 37/37).
- [ ] **Both URLs open and 200:** `getlocallens.vercel.app` (primary) and `localhost:5173` (fallback tab, server already running).
- [ ] **Signed in** as the demo account (favorites/redeem work) and on the **NYC** location.
- [ ] **Browser reset:** full-screen, one window, **zoom 100–110%**, only demo tabs open, notifications/Slack silenced.
- [ ] **Discover homepage loaded**, search box in **Classic** mode, cursor ready.
- [ ] **Dry-run the 5 clicks once:** `coffee` → `starbucks` (zero) → open a business + "why this verdict?" → Plan day → vibe search. Each should be instant.
- [ ] **Deals fallback ready:** confirm at least one redeemable deal exists on `/deals`.
- [ ] **Phrasing guardrails loaded:** say **"Gemini 2.5 Flash"**; cite **"registry layer: 0.849 recall, 0 false positives on a 156-business labeled set"** — never a combined/system accuracy number; quote the **2,383**-name live registry on stage.
- [ ] **Battery 100%**, screen-sleep disabled, charger in bag.

**Relevant files:** `/Users/sivapichappan/FBLA2526/backend/app/cache/warm.py` (warmer + exact query lists) · `/Users/sivapichappan/FBLA2526/frontend/src/components/VerdictBreakdown.tsx` ("why this verdict?" panel) · `/Users/sivapichappan/FBLA2526/frontend/src/routes/Plan.tsx` · `/Users/sivapichappan/FBLA2526/frontend/src/routes/Search.tsx` (classic/vibe) · `/Users/sivapichappan/FBLA2526/frontend/src/routes/Deals.tsx` (cashier-code redemption).

---

# PART D — The four SVG prompts (paste each SEPARATELY, one at a time)

After the deck artifact renders from PART A, paste these four prompts into the same browser-Claude chat **one at a time, each as its own message**. Precede each with the one-line slot instruction shown, and add the reminder: *"Embed it inline in the HTML (not an `<img>`), scale it to fill its region with comfortable margin, replace ONLY the named slot and leave every other slot and slide untouched, and don't recolor it unless it clashes with the palette."* These prompts use their own slightly warmer SVG palette (canvas `#FBF7F0`, amber `#E0A458`) tuned for diagram contrast — that's **intentional** and harmonizes with the deck; don't change it.

## SVG 1 of 4 — The Problem & Our Approach → Slide 2/3 slot (SVG SLOT 1)

Paste line first: `Drop this into SVG SLOT 1 (slides 2–3, Problem & Approach) inline.`

```
**VISUAL CONCEPT:** A two-act "before → after" story told as a single left-to-right narrative. LEFT shows the problem (a crowd of large chain blocks burying a few small independent dots in a Google-Maps-style result list). RIGHT shows LocalLens's inversion (a clean filtered list where ONLY independents remain). A bold central arrow labeled with the method converts one into the other. Beneath, a slim 3-step "method" rail makes the problem-first approach explicit.

**EXACT LAYOUT (viewBox 0 0 1280 720):**
- Title band, top, y 40–110, full width. Serif title left-aligned at x 80.
- LEFT panel "Today's map" — rounded rect, x 80 y 150, w 470 h 380. Inside it, a vertical stack of 6 result rows (each a rounded pill, w 410 h 44, starting y 200, 12px gap). Rows 1,2,3,5 are large muted-gray "CHAIN" pills (full width, bold). Rows 4 and 6 are tiny indigo "independent" pills (only ~140px wide, pushed to far right, visually buried). A faint gray label "buried" with a thin connector points to row 6.
- CENTER arrow — a thick horizontal arrow from x 560 to x 700, centered vertically at y 340. A small rounded "engine" chip sits on the arrow at x 630 y 312, label "Chain-filtering engine".
- RIGHT panel "LocalLens" — rounded rect with a soft amber 2px outer ring, x 710 y 150, w 490 h 380. Inside, a clean stack of 5 uniform indigo-outlined "independent" pills (w 430 h 50, starting y 195, 14px gap), each with a tiny forest-green check dot at its left. A header chip top-right inside the panel: "Chains structurally excluded — no toggle".
- METHOD rail, bottom, y 580–680, full width, light cream band. Three numbered nodes spaced evenly (centers x 285, 640, 995), connected by a thin indigo rule with small arrowheads between them.

**ALL EXACT TEXT LABELS:**
- Title: "The Problem & Our Approach"
- Subtitle (under title, smaller): "Chains dominate discovery — independents disappear."
- LEFT panel header: "Today's map (Google / Yelp)"
- LEFT buried-row callout: "buried under chains"
- LEFT large pills (use these names): "National Chain", "Big-Box Store", "Franchise #1042", "Chain Pharmacy"
- LEFT small pills: "Joe's corner shop", "family bakery"
- CENTER engine chip: "Chain-filtering engine"
- CENTER arrow label (above arrow): "filter, don't rank"
- RIGHT panel header: "LocalLens"
- RIGHT corner chip: "Chains structurally excluded — no toggle"
- RIGHT pills (independent names): "Joe's Pizza", "Levain Bakery", "Corner Reading Room", "Maple & Vine Cafe", "Riverside Hardware"
- METHOD rail title (left, small caps): "OUR APPROACH — PROBLEM FIRST"
- Node 1 title: "1 · Start from the frustration"; node 1 sub: "Independents are unbrowsable."
- Node 2 title: "2 · Isolate the hard part"; node 2 sub: "Tell a chain from an independent, at scale."
- Node 3 title: "3 · Build the engine first"; node 3 sub: "Then layer discovery on the guarantee."
- Small footnote bottom-right (x 1200, right-aligned, tiny): "Heuristic v1 scrapped → registry + cache + Gemini rebuild"

**COLOR PALETTE:** Background faint-warm-white / cream `#FBF7F0` (with warm flavor, not stark white); card surfaces `#FEFCF8`. Primary deep indigo `#21436B`; lighter indigo `#2E5C8A` for decorative strokes; forest green accent `#4F6B4A` (the "verified local" checks); ink text `#1F1B16`; muted warm gray `#9A958C` for the "chain" pills; warm hairline borders `#E8E0D4`. ONE warm highlight: a soft amber (`#E0A458`) used ONLY for the right-panel ring and the central arrow. No gradients.

**TYPOGRAPHY:** Title in an elegant serif (Playfair Display, or Georgia/serif fallback), ~46px, ink. All labels in a clean sans (system-ui / Helvetica), large for projector legibility: panel headers ~22px semibold, pill labels ~18px, method node titles ~20px, subtitles ~15px. Generous letter-spacing on the small-caps rail title.

**ASPECT / STYLE:** 16:9, viewBox 0 0 1280 720, projector-legible. Thick strokes (2–3px), rounded corners (radius 12–16 on boxes, fully rounded pills), generous whitespace. Clean, modern, line-based, editorial, subtle — line art only, no clip-art, no icons beyond simple dots/checks/arrowheads drawn as vectors.

Generate this as a single self-contained SVG, viewBox 0 0 1280 720, white/faint-warm background with the accent colors above; no external assets.
```

## SVG 2 of 4 — The Chain-Filtering Pipeline (the centerpiece) → Slide 4 slot (SVG SLOT 2)

Paste line first: `Drop this into SVG SLOT 2 (Slide 4, the centerpiece pipeline) inline.`

```
**VISUAL CONCEPT:** THE centerpiece. A left-to-right gated pipeline: raw unfiltered businesses enter on the left, pass through three sequential gates (each cheaper-evidence-first), and only independents exit on the right. A curved "learning loop" arrow returns from the Gemini gate back into the registry. Two guarantee callouts ("uncertain → keep as small" and "min 10, widen radius") are surfaced as distinct annotated badges, not buried in body text.

**EXACT LAYOUT (viewBox 0 0 1280 720):**
- Title band top, y 30–95, serif title at x 70.
- A single horizontal "flow lane" centered vertically around y 300. Five stations left→right, connected by thick indigo arrows with arrowheads:
  - INPUT node, x 60 y 245, w 150 h 120, rounded rect, label "Unfiltered businesses".
  - GATE 1, x 250 y 220, w 200 h 170, rounded rect, header strip "Gate 1 · Registry".
  - GATE 2, x 490 y 220, w 200 h 170, header strip "Gate 2 · Verdict cache".
  - GATE 3, x 730 y 220, w 200 h 170, header strip "Gate 3 · Gemini 2.5 Flash".
  - OUTPUT node, x 970 y 245, w 250 h 120, rounded rect with soft-amber 2px ring, label "Only independents shown".
- Each gate box: bold header strip (indigo fill, cream text) at its top ~34px tall, then 2–3 lines of small body text inside.
- LEARNING LOOP: a curved arrow starting at the bottom of GATE 3 (x ~830 y 390), sweeping down to y 470 and back up into the bottom of GATE 1 (x ~350 y 390). Forest-green stroke, arrowhead pointing into Gate 1. Mid-curve label on a small cream chip: "Learning loop — high-confidence chains → registry".
- GUARANTEE BADGE A (the "uncertain" rule): a small rounded callout attached above GATE 3 with a thin leader line, x 720 y 130 w 250 h 70. Soft-amber outline.
- GUARANTEE BADGE B (the "min 10 / widen radius" rule): a rounded callout attached above/around the OUTPUT node, x 960 y 120 w 270 h 90. Forest-green outline.
- A thin "cheapest evidence first" caption arrow runs along the very top of the lane (y ~200) from Gate 1 to Gate 3, tiny text "cost ↑ — cheapest evidence first".
- Bottom-left small note about the unfiltered source, y 560.

**ALL EXACT TEXT LABELS:**
- Title: "The Chain-Filtering Pipeline"
- Subtitle: "Cheapest evidence first — survivors only are returned."
- INPUT label: "Unfiltered businesses" / small sub "Google Places + local DB"
- Gate 1 header: "Gate 1 · Registry"; body lines: "2,383 known chains", "Seed rows: fuzzy match", "Free · instant"
- Gate 1 fuzzy example (small italic): "\"Starbucks #4271 — Downtown\" → starbucks"
- Gate 2 header: "Gate 2 · Verdict cache"; body lines: "30-day TTL, per place_id", "Already-judged → zero calls"
- Gate 3 header: "Gate 3 · Gemini 2.5 Flash"; body lines: "All unknowns in ONE batched call", "Classifies chain vs. independent"
- Learning-loop chip: "Learning loop — high-confidence chains written back to registry"
- OUTPUT label: "Only independents shown"
- Top caption: "cost ↑ — cheapest evidence first"
- GUARANTEE BADGE A title: "Uncertain? → keep as \"small\""; sub: "Hiding a real independent is worse than letting one chain through."
- GUARANTEE BADGE B title: "Guarantee: min 10 results"; sub: "Widen radius 20 km → 50 km until ≥ 10 independents."
- Bottom-left note: "Owner-listed rows skip the classifier (accountable, not scraped)."

**COLOR PALETTE:** Faint-warm-white / cream `#FBF7F0` background (warm, not stark); card fills `#FEFCF8`. Deep indigo `#21436B` primary (gate header strips, main flow arrows); lighter indigo `#2E5C8A` decorative strokes; forest green `#4F6B4A` accent (learning loop arrow + Badge B); ink `#1F1B16` body text; muted warm gray `#9A958C` for secondary captions; warm hairline `#E8E0D4`. ONE warm highlight: soft amber `#E0A458` for the OUTPUT ring and Guarantee Badge A. No gradients.

**TYPOGRAPHY:** Title elegant serif (Playfair Display / serif fallback) ~44px. Gate header strips clean sans bold ~21px in cream `#FBF7F0`. Body lines sans ~16px ink; fuzzy example italic ~14px. Badge titles sans semibold ~18px; badge subs ~14px. Projector-legible throughout.

**ASPECT / STYLE:** 16:9, viewBox 0 0 1280 720, projector-legible — large labels, thick strokes (3px main arrows, 2px secondary), rounded boxes (radius 14), generous whitespace. Clean, modern, line-based, editorial. Arrowheads drawn as vector triangles. No clip-art, no icons beyond arrows/dots.

Generate this as a single self-contained SVG, viewBox 0 0 1280 720, white/faint-warm background with the accent colors above; no external assets.
```

## SVG 3 of 4 — Accuracy & Resilience → Slide 6 slot (SVG SLOT 3)

Paste line first: `Drop this into SVG SLOT 3 (Slide 6, the accuracy & resilience visual) inline.`

```
**VISUAL CONCEPT:** A two-zone stat panel. TOP zone = measured accuracy of the registry layer presented as four big "stat cards" plus a tiny honest-scope footnote. BOTTOM zone = a horizontal resilience flow showing the offline/quota fallback path where the registry still filters and unknowns pass through badged "likely local." Editorial, number-forward, projector-legible.

**EXACT LAYOUT (viewBox 0 0 1280 720):**
- Title band top, y 30–95, serif title at x 70.
- ACCURACY ZONE, y 120–400. Four cards in a row, each rounded rect, equal width ~270, gap ~24, starting x 70:
  - Card A (x 70): big number "2,383", label below.
  - Card B (x 364): big number "0.849", label below.
  - Card C (x 658): big number "1.0", label below.
  - Card D (x 952, soft-amber ringed): big number "0", label below.
  - Each card: huge numeral centered ~64px, small caption beneath ~16px, optional tiny sub-line ~13px.
- SCOPE FOOTNOTE strip directly under the cards, y 360–400, full width, tiny italic text, indigo rule above it.
- RESILIENCE ZONE, y 430–680. A header label left, then a horizontal fallback flow of 4 nodes connected by arrows, centered ~y 560:
  - Node R1, x 70 w 230 h 120: "Gemini unavailable / quota hit".
  - Node R2, x 360 w 230 h 120: "Registry still filters".
  - Node R3, x 650 w 250 h 120: "Unknowns PASS — badged \"likely local\"".
  - Node R4 (forest-green outline), x 960 w 250 h 120: "Search never crashes, never hides an independent".
  - Thick arrows R1→R2→R3→R4. Below R3 a small note: "verdict_source = unverified-offline · not cached".

**ALL EXACT TEXT LABELS:**
- Title: "Accuracy & Resilience"
- Subtitle: "Measured on the registry layer; degrades safely offline."
- Card A number: "2,383"; caption: "chains in the live registry"; sub: "2,233 fuzzy + 150 exact"
- Card B number: "0.849"; caption: "registry recall"; sub: "62 / 73 chains caught"
- Card C number: "1.0"; caption: "registry precision"; sub: "no independent wrongly hidden"
- Card D number: "0"; caption: "false positives"; sub: "on 156 labeled rows (73 chains · 83 independents)"
- Scope footnote: "Registry layer alone, on its own labeled dev set + CI floor (recall ≥ 0.80, false positives = 0). Not a combined system accuracy. Gemini catches the long tail."
- Resilience header (left, small caps): "RESILIENCE — OFFLINE / QUOTA FALLBACK"
- Node R1: "Gemini unavailable / quota hit"
- Node R2: "Registry still filters chains"
- Node R3: "Unknowns PASS — badged \"likely local\""
- Node R3 note: "verdict_source = unverified-offline · not cached (re-verify online)"
- Node R4: "Never crashes a search · never hides an independent"

**COLOR PALETTE:** Faint-warm-white / cream `#FBF7F0` background (warm, not stark); card fills `#FEFCF8`. Deep indigo `#21436B` primary (the big stat numerals + node borders + flow arrows); lighter indigo `#2E5C8A` decorative strokes/rules; forest green `#4F6B4A` accent (Card C/precision emphasis + Node R4 outline); ink `#1F1B16` text; muted warm gray `#9A958C` for sub-lines and the scope footnote; warm hairline `#E8E0D4`. ONE warm highlight: soft amber `#E0A458` for Card D's ring (the "0 false positives" hero stat). No gradients.

**TYPOGRAPHY:** Title elegant serif (Playfair Display / serif fallback) ~44px. Big stat numerals in serif or heavy sans ~64px, indigo. Card captions clean sans semibold ~17px; card subs sans ~13px muted. Resilience node labels sans ~17px ink. Scope footnote italic sans ~14px muted. Small-caps header letter-spaced. Projector-legible.

**ASPECT / STYLE:** 16:9, viewBox 0 0 1280 720, projector-legible — large labels, thick strokes (2.5px card borders, 3px flow arrows with vector arrowheads), rounded boxes (radius 14), generous whitespace. Clean, modern, line-based, editorial, number-forward, subtle. No clip-art, no chart skeuomorphism — let the numbers carry it.

Generate this as a single self-contained SVG, viewBox 0 0 1280 720, white/faint-warm background with the accent colors above; no external assets.
```

## SVG 4 of 4 — System Architecture → Slide 7 slot (SVG SLOT 4)

Paste line first: `Drop this into SVG SLOT 4 (Slide 7, the system architecture) inline.`

```
**VISUAL CONCEPT:** A clean architecture diagram showing the request path from the user through the LocalLens cloud boundary (Vercel frontend + FastAPI serverless + Supabase) with Google Places and Gemini drawn OUTSIDE as external services. A dashed rounded "cloud boundary" rectangle visibly encloses the owned components; external services sit beyond it and connect across the boundary with labeled arrows.

**EXACT LAYOUT (viewBox 0 0 1280 720):**
- Title band top, y 30–95, serif title at x 70.
- USER node, far left, x 50 y 310, w 150 h 110, rounded rect, label "User (browser)".
- DASHED CLOUD BOUNDARY: a large rounded rect with a 2px dashed indigo border, x 240 y 150 w 620 h 440. Small tab label at its top-left corner on a cream chip: "LocalLens cloud".
- Inside the boundary, three stacked/aligned nodes connected by vertical/horizontal arrows:
  - VERCEL/REACT node, x 290 y 200, w 250 h 110, label "Vercel · React SPA".
  - FASTAPI node, x 290 y 360, w 250 h 110, label "FastAPI (serverless)".
  - SUPABASE node, x 590 y 360, w 230 h 150, label "Supabase Postgres".
- Arrows inside: User → Vercel (horizontal, crossing the boundary). Vercel → FastAPI (vertical down). FastAPI → Supabase (horizontal right).
- EXTERNAL SERVICES column, right of the boundary, x 920–1230:
  - GOOGLE PLACES node, x 920 y 230, w 290 h 110, label "Google Places (New)".
  - GEMINI node, x 920 y 410, w 290 h 130, label "Gemini 2.5 Flash".
- Arrows from FastAPI crossing the dashed boundary outward to Google Places and to Gemini (two arrows fanning right, each crossing the boundary line; draw them clearly piercing the dashed edge). Label them.
- A small legend bottom-left, y 630: a dashed swatch = "owned / cloud boundary", a solid swatch = "external service".

**ALL EXACT TEXT LABELS:**
- Title: "System Architecture"
- Subtitle: "One serverless app; external AI + data services across the boundary."
- USER node: "User (browser)"
- Boundary tab: "LocalLens cloud"
- Vercel node: "Vercel · React 18 + TypeScript SPA"
- FastAPI node: "FastAPI · Python 3.12 (one serverless fn)"; small sub "routers → services → repositories"
- Supabase node: "Supabase Postgres + pgvector"; small sub "768-dim embeddings, cosine search"
- Google Places node: "Google Places (New)"; sub "business data · photos · geocoding"
- Gemini node: "Gemini 2.5 Flash"; sub "chain classifier · vibe · trip narration"
- Arrow label User→Vercel: "HTTPS"
- Arrow label Vercel→FastAPI: "/api (ASGI)"
- Arrow label FastAPI→Supabase: "psycopg3 / SQL"
- Arrow label FastAPI→Google: "REST"
- Arrow label FastAPI→Gemini: "classify / embed"
- Legend: "owned (cloud boundary)" and "external service"

**COLOR PALETTE:** Faint-warm-white / cream `#FBF7F0` background (warm, not stark); node fills `#FEFCF8`. Deep indigo `#21436B` primary (node borders, dashed boundary, internal arrows); lighter indigo `#2E5C8A` decorative; forest green `#4F6B4A` accent (the database/Supabase node accent + its arrow); ink `#1F1B16` text; muted warm gray `#9A958C` for sub-labels; warm hairline `#E8E0D4`. ONE warm highlight: soft amber `#E0A458` for the two external-service nodes' top accent strip (to mark "external"). No gradients.

**TYPOGRAPHY:** Title elegant serif (Playfair Display / serif fallback) ~44px. Node titles clean sans semibold ~20px ink; node sub-labels sans ~14px muted. Arrow labels sans ~14px on small cream chips so they stay legible over lines. Boundary tab ~16px. Projector-legible.

**ASPECT / STYLE:** 16:9, viewBox 0 0 1280 720, projector-legible — large labels, thick strokes (2.5px node borders, 2px dashed boundary, 2.5px arrows with vector arrowheads), rounded boxes (radius 14), generous whitespace. Clean, modern, line-based, editorial, subtle. No clip-art; represent the database as a simple rounded rect (optionally a subtle cylinder top) — no skeuomorphic art.

Generate this as a single self-contained SVG, viewBox 0 0 1280 720, white/faint-warm background with the accent colors above; no external assets.
```

**Note on SVG-to-slide mapping:** the four placeholder slots live on **slides 2/3 (shared), 4, 6, and 7** — Slot 1 spans slides 2–3, Slot 2 is the centerpiece on slide 4 (re-shown annotated on slide 5 with no new asset), Slot 3 is on slide 6, Slot 4 is on slide 7. Slides 1, 5, and 8 get no new SVG. Each prompt's content matches its slot by role — Problem/Approach → Slot 1, Pipeline → Slot 2, Accuracy/Resilience → Slot 3, Architecture → Slot 4 — so the paste lines above are unambiguous. There is no separate glass-box diagram: provenance is proven verbally, by the Pipeline SVG's gates, and live by the demo's "▸ why this verdict?" panel (PART C Scene B).

---

# 7-MINUTE TIMING TABLE

Your master clock for the room: 9 slides (~4 min) + live demo (~3 min) = 7 min.

| Block | Segment | On-screen | Time | Running total |
|---|---|---|---|---|
| Slides · M1 | Slide 1 — Hook ("coffee near me") | title | 0:25 | 0:25 |
| Slides · M1 | Slide 2 — The Problem (chains win) | Problem/Approach SVG | 0:25 | 0:50 |
| Slides · M1 | Slide 3 — Our Approach (one promise) | Problem/Approach SVG | 0:25 | 1:15 |
| Slides · M2 | Slide 4 — Pipeline (cheapest evidence first) | Pipeline SVG | 0:30 | 1:45 |
| Slides · M2 | Slide 5 — Inside the Gates (trade-offs) | Pipeline SVG (annotated) | 0:35 | 2:20 |
| Slides · M2 | Slide 6 — Measured, self-improving, crash-proof | Accuracy/Resilience SVG | 0:35 | 2:45 |
| Slides · M2 | Slide 7 — One engine, every surface local | Architecture SVG | 0:25 | 3:10 |
| Slides · M2.5 | Slide 8 — Usable · Accessible · Trusted (NEW) | three pillars | 0:25 | 3:35 |
| Slides · M3 | Slide 9 — See it live (handoff) | title | 0:25 | 4:00 |
| Demo | 0. Open on Discover (NYC) | live app | 0:10 | 4:10 |
| Demo | A. Search `coffee`, then `starbucks` → 0 | live app | 0:40 | 4:50 |
| Demo | B. "▸ why this verdict?" transparency | live app | 0:35 | 5:25 |
| Demo | C. Plan a local day (3 strategies) | live app | 1:00 | 6:25 |
| Demo | D. Vibe search closer (% vibe match) | live app | 0:30 | 6:55 |
| Demo | Close — "only independents, every time" | live app | 0:05 | 7:00 |

**Slides subtotal: 4:00 (9 slides) · Demo subtotal: 3:00 · Grand total: 7:00.** The new Slide 8 is absorbed by trimming five slides ~5s each (S3, S5, S6, S7, S9 — see PART B), so the demo keeps the full 3:00. Safety valves if you run long: drop Slide 6's glass-box sentence, the 5-second close, and compress Scene C (Plan, the most quota/latency-sensitive call) to a pre-warmed itinerary view. **Rubric extras (concierge Q&A, owner CSV report) live in PART C's "Extended beats"** — fold them in only if your room allows ~3:45 of demo, or swap the concierge in for Vibe.
