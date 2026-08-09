# GIF Asset Manifest

## Current Page Assets

The VLA / GUIDANCE page now uses case-labeled optimized long GIFs under `assets/carla_cases/`.
Each file is derived from the completed CALAR/CARLA run:

`C:\Users\user\Desktop\VLA\main\CALAR\GIF\...\runs\long_gif_20260522_60s\side_by_side_trial_000.gif`

Each deployed GIF keeps the long representative event duration:

- Frames: 120
- Duration: 24.0 s
- Width: 960 px
- Height: 270 px

## Scenario / Case Mapping

| Environment | Case | Scenario id | Web asset |
|---|---|---|---|
| Urban downtown | `urban_adjacent_cutin` | `p2_adjacent_cutin` | `assets/carla_cases/urban_adjacent_cutin_trial_000_side_by_side.gif` |
| Urban downtown | `urban_lead_sudden_braking` | `p3_lead_sudden_braking` | `assets/carla_cases/urban_lead_sudden_braking_trial_000_side_by_side.gif` |
| Urban downtown | `urban_stop_and_go_reveal` | `p11_stop_and_go_reveal` | `assets/carla_cases/urban_stop_and_go_reveal_trial_000_side_by_side.gif` |
| Arterial / motorway | `arterial_moving_lead_following` | `p1_moving_lead_following` | `assets/carla_cases/arterial_moving_lead_following_trial_000_side_by_side.gif` |
| Arterial / motorway | `arterial_ramp_merge` | `p10_ramp_merge` | `assets/carla_cases/arterial_ramp_merge_trial_000_side_by_side.gif` |
| Arterial / motorway | `arterial_speed_gap_stress` | `p7_speed_gap_stress` | `assets/carla_cases/arterial_speed_gap_stress_trial_000_side_by_side.gif` |
| Highway | `highway_adjacent_cutin` | `p9_highway_cutin` | `assets/carla_cases/highway_adjacent_cutin_trial_000_side_by_side.gif` |
| Highway | `highway_dense_traffic_string` | `p5_dense_traffic_string` | `assets/carla_cases/highway_dense_traffic_string_trial_000_side_by_side.gif` |
| Highway | `highway_moving_lead_following` | `p1_moving_lead_following` | `assets/carla_cases/highway_moving_lead_following_trial_000_side_by_side.gif` |
| Visibility / perception | `fog_cutin_degraded_perception` | `p12_adverse_visibility_degraded_perception` | `assets/carla_cases/fog_cutin_degraded_perception_trial_000_side_by_side.gif` |
| Visibility / perception | `rain_cutin_degraded_perception` | `p12_adverse_visibility_degraded_perception` | `assets/carla_cases/rain_cutin_degraded_perception_trial_000_side_by_side.gif` |
| Visibility / perception | `perception_noise_cutin` | `p13_perception_noise_stress` | `assets/carla_cases/perception_noise_cutin_trial_000_side_by_side.gif` |

## Status

- Missing GIF assets: none.
- Broken page references: none detected.
- Old root-level Ramp merge / Speed-gap GIFs were removed from the deploy repo because the page now uses the case-labeled optimized assets.
- Current assets are regenerated from the longer `long_gif_20260522_60s` run.
