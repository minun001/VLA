# QA Review

## Summary

QA status: pass with one documented asset-provenance caveat.

The updated VLA page presents the final 150-trial No-GUIDANCE vs GUIDANCE comparison above the fold, separates Ramp merge and Speed-gap stress, preserves exact metric values, and keeps the scientific claim boundary.

## Checklist

| Check | Result | Evidence |
|---|---|---|
| Old adjacent cut-in metrics are not main result | Pass | Old metric strings were not found in `index.html`. |
| Page title indicates final comparison | Pass | H1 is `No-GUIDANCE vs GUIDANCE: 150-Trial Final Comparison`. |
| Ramp merge and Speed-gap stress are clearly separated | Pass | Each scenario has its own visual block and metric rows. |
| Scenario/case coverage is summarized | Pass | Added 4 scenario families and 12 cases under `Simulation coverage`. |
| Exact metric values appear | Pass | Script check found no missing source-of-truth values. |
| GIF/image paths exist | Pass | 4 image tags, 0 broken paths. |
| Alt text exists | Pass | 4 image tags, 0 missing alt values. |
| Claim boundary exists | Pass | Controlled CARLA simulation diagnostic limitation is present. |
| Build status | Pass | `bundle exec jekyll build` completed successfully. |
| Mobile layout | Pass by code inspection | Responsive breakpoints collapse hero cards, scenario GIFs, and charts to one column under 720px. |

## Issues

### P2: Scenario-specific GIF provenance is not encoded in filenames

- File: `assets/carla_event_a-d.gif`
- Finding: Existing GIFs are valid side-by-side CARLA assets, but filenames do not encode Ramp merge or Speed-gap stress scenario provenance.
- Mitigation: Added `docs/missing_gif_assets.md` with exact recommended scenario-labeled GIF assets.
- Impact: No broken links; scientific limitation remains clear.

## Commands run

- `bundle exec jekyll build`
- Python HTML check for expected metric strings, image paths, and alt text.
- `rg` checks for old adjacent cut-in metrics in `index.html`.

## Final review decision

The page is ready as a lightweight GitHub Pages update. For stronger paper traceability, the next improvement is to replace generic `carla_event_a-d.gif` with scenario-labeled final CARLA GIFs generated from the Ramp merge and Speed-gap stress final runs.
