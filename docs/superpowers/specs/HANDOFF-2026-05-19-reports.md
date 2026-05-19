# Reporting Upgrade — Handoff (2026-05-19)

## What landed

**Commit `dc7a327`** — `feat(reports): premium reporting UX + vibe-aware PDF/DOCX upgrades`

| File | Status |
|---|---|
| `src/app/(main)/reports/page.tsx` | Rewritten (was untracked) |
| `src/components/reports/report-run-panel.tsx` | Rewritten (was untracked) |
| `deer-flow/skills/custom/vepip-reports/scripts/build_pdf.py` | Rewritten (on disk only — see note) |
| `deer-flow/skills/custom/vepip-reports/scripts/build_docx.py` | Rewritten (on disk only — see note) |

## What changed

### Reports page UX
- **Hero header** with a soft gradient + "Report Studio" eyebrow — gives the page a sense of purpose instead of dropping straight into form fields.
- **4-step right rail**: format → vibe → scope → project. Each step is its own card with a numbered title. Format cards show a coloured icon plaque hinting at the output's identity.
- **Vibe picker** (new) — exposes editorial-serif, dark-premium, magazine-bold, ocean-corporate with palette swatches and "best for" copy. Previously the API was always called with `vibe=null`, so every report came out in the default theme regardless of project tone.
- **Recent reports** list pulled live from `project.reports` with status pills (draft / submitted / approved / rejected).
- **Empty-state mock preview** renders a styled mini-document using the selected vibe + format swatches, so users see what their output is going to look like *before* they hit Generate.

### ReportRunPanel
- **Aspect-ratio hero** swaps between three states:
  1. Live preview with animated concentric rings + "writing now" ticker during the narrative phase.
  2. Inline PDF iframe when `format=pdf` and `phase=done`.
  3. Result placeholder with big Download CTA when `format=docx|pptx` and done.
- **3-stage timeline** (Convex load → Gemini narrative → Python render) with per-step Loader → CheckCircle transitions.
- **Elapsed timer** updates live so the user knows nothing is stuck.
- **Open / Download** buttons on success.

### PDF builder (build_pdf.py)
- `BaseDocTemplate` with two `PageTemplate`s — a cover page (painted vibe band, accent rule, brand mark, meta strip, footer mark) and content pages (slim header rule with project + funder, footer with page numbers).
- **Donut chart** for budget utilisation via `reportlab.graphics` `Pie` with a white-disc cutout and centred percent label.
- **Horizontal bar chart** for deliverable progress — one bar per deliverable with track / fill / percent / label.
- **Section headings** now use an eyebrow tag + accent rule treatment matching the DOCX builder.

### DOCX builder (build_docx.py)
- **Cover hero** rendered as a single-cell table shaded with the vibe's primary text colour. White headline, accent_soft eyebrows, accent top-rule.
- `different_first_page_header_footer` keeps the cover clean and applies a repeating page header (project · funder, accent rule) and a footer with `PAGE / NUMPAGES` Word field codes.
- **KPI grid helper** — 3-up shaded tiles with per-cell accent top-rule.
- **Visual progress bars** for deliverables via cell-width split shading (label | filled cell | empty cell | percent).
- Section headings with eyebrow + accent rule, consistent with the PDF.

### PPTX path: intentionally unchanged
The PPTX builder already uses an HTML-to-Chrome-screenshot pipeline (`build_pptx.py` → html-ppt skill themes → headless Chrome → PNG → pptx). That produces publication-grade typography that beats anything python-pptx can draw natively. The vibe registry feeds it the same palette + typography knobs the PDF/DOCX use, so all three formats now share identity.

## What you must do

1. **Restart DeerFlow** so the rewritten `build_pdf.py` and `build_docx.py` are picked up.
2. **Commit the deer-flow changes** wherever the deer-flow source is tracked. The two file edits are on disk in this working tree but the entire `deer-flow/` tree is untracked in this repo — same as the previous handoff.
3. **No npm install required** — the UI changes use only existing icons + utilities.
4. **No Convex deploy required** — no schema or HTTP changes in this commit.

## What it does NOT do

- Does not touch the PPTX builder (already premium via HTML pipeline).
- Does not add backend chart libs (matplotlib) — PDF charts use reportlab's built-in `graphics.shapes` to avoid a new dep.
- Does not gate report generation behind sub-project A's grounding work — that's a future enhancement: the Gemini narrative will benefit from `search_knowledge` once the agent is wired in.
- Does not register custom TTF fonts in reportlab — the vibe font choices (Fraunces, Aptos Display, Arial Black) map to safe base14 families with intent preserved (serif vs sans). To upgrade, drop TTFs into `deer-flow/skills/custom/vepip-reports/assets/fonts/` and extend `_try_register_font` in `build_pdf.py`.

## Quick verification

1. Open `/reports` in the app.
2. Pick a project that has activities + deliverables + a budget.
3. Pick **PDF** + **Dark Premium** vibe + quarterly with a real date range.
4. Hit Generate. You should see: live phase pills tick through, the rings animate, the "writing now" ticker shows tokens, then the PDF appears inline in the hero iframe.
5. Open the PDF and verify: cover band with gold accent rule, content pages with header + page numbers, donut chart on the financials page, horizontal bars under the deliverables table.
6. Switch to **DOCX** + **Editorial Serif** and regenerate — open the .docx in Word and check the cover band, the repeating header, "Page X of Y" in the footer, and the 3-up KPI tiles.

If any step looks off, the most likely cause is DeerFlow caching the old python files — restart it.
