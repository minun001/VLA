# CARLA Case Website Update

## Scope

Updated the VLA / GUIDANCE GitHub Pages page to show completed CARLA simulation GIFs by environment and case.
The current GIF assets were then replaced with longer 14.4 s representative GIFs from the dedicated CALAR/GIF run.

## Source Run

- Local source root: `C:\Users\user\Desktop\VLA\main\CALAR`
- Original matrix run id: `traffic_env_unified_gif_20260521`
- Long GIF run id: `long_gif_20260522_134458`
- Representative asset used per case: `side_by_side_trial_000.gif`
- Verified case count: 12 cases
- Verified side-by-side GIF count: 150 per case

## Web Assets Created

Optimized web GIF copies were generated under:

- `assets/carla_cases/urban_adjacent_cutin_trial_000_side_by_side.gif`
- `assets/carla_cases/urban_lead_sudden_braking_trial_000_side_by_side.gif`
- `assets/carla_cases/urban_stop_and_go_reveal_trial_000_side_by_side.gif`
- `assets/carla_cases/arterial_moving_lead_following_trial_000_side_by_side.gif`
- `assets/carla_cases/arterial_ramp_merge_trial_000_side_by_side.gif`
- `assets/carla_cases/arterial_speed_gap_stress_trial_000_side_by_side.gif`
- `assets/carla_cases/highway_adjacent_cutin_trial_000_side_by_side.gif`
- `assets/carla_cases/highway_dense_traffic_string_trial_000_side_by_side.gif`
- `assets/carla_cases/highway_moving_lead_following_trial_000_side_by_side.gif`
- `assets/carla_cases/fog_cutin_degraded_perception_trial_000_side_by_side.gif`
- `assets/carla_cases/rain_cutin_degraded_perception_trial_000_side_by_side.gif`
- `assets/carla_cases/perception_noise_cutin_trial_000_side_by_side.gif`

The optimized GIFs preserve the longer source event duration while reducing width and palette size for GitHub Pages usability.

## Page Changes

- Added a scenario-by-case GIF matrix for 4 environment families and 12 cases.
- Kept Ramp merge and Speed-gap stress as the main metric-backed cases.
- Replaced old two-GIF-only visual coverage with case-labeled GIF assets.
- Preserved exact source-of-truth metric values for Ramp merge and Speed-gap stress.
- Added responsive grids using `auto-fit` and `minmax()` so the page adapts to desktop, tablet, and mobile widths.

## Validation

- HTML asset references checked: 14 references, 0 missing.
- Long GIF duration checked: 12/12 assets keep 72 frames and 14.4 s duration.
- Exact metric values checked in `index.html`.
- Scientific boundary preserved as controlled CARLA simulation diagnostic only.
