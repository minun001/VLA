# Frontend Implementation Report

## Files changed

- `index.html`
  - Replaced previous adjacent cut-in focused page with final 150-trial Ramp merge / Speed-gap stress comparison.
  - Added hero headline, four exact metric cards, scenario visual blocks, combined metric table, CSS-only bar charts, Korean narrative, and claim boundary.
  - Removed old metric PNGs from the rendered page to avoid presenting previous adjacent cut-in results as the final result.
  - Added a `Simulation coverage` section that summarizes 4 scenario families and 12 cases, replacing the idea of generic additional trial views with a structured scenario/case inventory.

- `AGENTS.md`
  - Added VLA website-specific project goal, data accuracy rules, asset rules, scientific boundary, implementation rules, testing checks, and report conventions.

- `docs/codex_reports/site_audit.md`
- `docs/codex_reports/gif_asset_manifest.md`
- `docs/codex_reports/metrics_visualization_plan.md`
- `docs/missing_gif_assets.md`

## Data handling

- Used only the source-of-truth metrics from the task prompt.
- No generated or estimated metrics were added.
- The page keeps exact visible values including `1.31s`, `7.05s`, `0.560`, `0.013`, `0.96s`, `15.62s`, `0.853`, and `0.000`.

## Asset handling

- Referenced only existing GIF assets:
  - `assets/carla_event_a.gif`
  - `assets/carla_event_b.gif`
  - `assets/carla_event_c.gif`
  - `assets/carla_event_d.gif`
- Did not reference missing image paths.
- Documented scenario-labeled GIF gaps in `docs/missing_gif_assets.md`.
- Reused the same valid GIFs in the coverage section as representative examples without claiming that they exhaustively cover all 12 cases.

## Build / verification

- Ran `bundle exec jekyll build`: passed.
- Build emitted existing Sass/minima deprecation warnings, but no build failure.
- Verified all four image paths exist.
- Verified all image tags have alt text.
- Verified old adjacent cut-in metrics are not present in `index.html`.

## Claim boundary

The page explicitly states that the result is controlled CARLA simulation diagnostic evidence, not real-world vehicle safety certification or full generalization to all driving scenarios.
