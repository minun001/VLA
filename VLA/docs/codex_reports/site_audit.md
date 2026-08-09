# Site Audit

## Site framework

- Repository: `C:\Users\user\VLA-project-deploy`
- Framework: static HTML/CSS/JS GitHub Pages project site.
- VLA page implementation: static standalone HTML at `index.html` with inline CSS.
- The site is served from the `main` branch root with `.nojekyll`.

## Entry point file(s)

- Public VLA URL entry: `index.html`
- Additional static files: `styles.css`, `app.js`, and `assets/`.

## Asset directories

- VLA assets: `assets/`

## Current VLA page sections

- Hero section for final 150-trial No-GUIDANCE vs GUIDANCE comparison.
- Scenario visuals for Ramp merge and Speed-gap stress.
- Simulation coverage summary with scenario families and cases.
- Final metric table.
- CSS-only metric visualizations.
- Claim boundary section.

## Active GIF/image asset inventory

VLA-specific active GIFs:

- `assets/ramp_merge_trial_000_side_by_side.gif`
- `assets/speed_gap_stress_trial_000_side_by_side.gif`

VLA-specific PNGs retained for archive / non-main use:

- `assets/01_core_metric_comparison.png`
- `assets/02_relative_change_summary.png`
- `assets/03_paired_trial_robustness.png`
- `assets/04_vehicle_order_ttc.png`
- `assets/05_summary_table.png`

## Recommended file changes completed

- Replaced generic `carla_event_*` page references with case-labeled GIFs.
- Removed old generic GIF assets from the website asset folder.
- Updated reports under `docs/codex_reports/`.
- Updated `docs/missing_gif_assets.md` to mark the two core GIFs as resolved.

## Build/test/lint commands

- No package, Gemfile, or Makefile build command was discovered.
- Static validation command used: Python HTML asset and metric check.
- Optional local preview: `powershell -ExecutionPolicy Bypass -File .\serve.ps1`

## Risks or uncertainties

- The current public page includes only two case-labeled visual examples. Other CALAR cases are documented by metric/config structure, not by public GIF footage.
- The result remains controlled CARLA simulation diagnostic evidence, not real-world safety certification.
