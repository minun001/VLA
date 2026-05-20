# Site Audit

## Site framework

- Repository: `C:\Users\user\VLA-project-deploy`
- Framework: static HTML/CSS/JS GitHub Pages project site.
- VLA page implementation: static standalone HTML at `index.html` with inline CSS.
- No `package.json` or Jekyll build step is required for this project repo. The site is served from the `main` branch root with `.nojekyll`.

## Entry point file(s)

- Public VLA URL entry: `index.html`
- Additional static files: `styles.css`, `app.js`, and `assets/`.

## Asset directories

- VLA assets: `assets/`

## Current VLA page sections before update

- Hero section for previous `CARLA P2 adjacent cut-in diagnostic`.
- Four side-by-side CARLA GIF cards.
- Previous 150 paired-trial metric cards for adjacent cut-in.
- Static PNG figure section using old comparison charts.
- Previous metric table.
- Claim boundary section for adjacent cut-in.

## Existing GIF/image asset inventory

VLA-specific GIFs:

- `assets/carla_event_a.gif`
- `assets/carla_event_b.gif`
- `assets/carla_event_c.gif`
- `assets/carla_event_d.gif`

VLA-specific PNGs:

- `assets/01_core_metric_comparison.png`
- `assets/02_relative_change_summary.png`
- `assets/03_paired_trial_robustness.png`
- `assets/04_vehicle_order_ttc.png`
- `assets/05_summary_table.png`

Note: existing GIF names are generic and do not encode whether the visual is Ramp merge or Speed-gap stress.

## Recommended file changes

- Replace `index.html` content with the final 150-trial Ramp merge / Speed-gap stress comparison.
- Keep existing `assets/carla_event_a-d.gif` references only where paths exist.
- Do not reuse old metric PNGs as final evidence because they correspond to the previous adjacent cut-in result.
- Add/update `AGENTS.md` with VLA website rules.
- Add subagent reports under `docs/codex_reports/`.
- Add `docs/missing_gif_assets.md` to document scenario-labeled GIF gaps.

## Build/test/lint commands

- No package/build command is required.
- Optional local preview: `powershell -ExecutionPolicy Bypass -File .\serve.ps1`

No Node/Vite/React commands were discovered.

## Risks or uncertainties

- Existing GIFs are valid files, but their filenames do not prove scenario-specific provenance.
- Old PNG metric charts should not be shown as the final Ramp merge / Speed-gap stress evidence unless regenerated with final source-of-truth data.
- The project-site repo is dedicated to the VLA page, but changes should still remain scoped to public page content, docs, and existing assets.
