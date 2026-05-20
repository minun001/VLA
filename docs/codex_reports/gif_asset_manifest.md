# GIF Asset Manifest

## Active Public Page GIFs

| Asset path | Scenario use | Source run | Dimensions / frames | Why it is appropriate |
|---|---|---|---|---|
| `assets/ramp_merge_trial_000_side_by_side.gif` | Ramp merge | `C:\Users\user\Desktop\VLA\main\CALAR\02_arterial_motorway\arterial_ramp_merge\runs\web_gif_ramp_merge_trial_000_20260521` | 1920x540 / 48 frames | Generated from `p10_ramp_merge`, `trial_000`, `record_gif=true`; shows side-by-side No-GUIDANCE vs GUIDANCE for the Ramp merge case. |
| `assets/speed_gap_stress_trial_000_side_by_side.gif` | Speed-gap stress | `C:\Users\user\Desktop\VLA\main\CALAR\02_arterial_motorway\arterial_speed_gap_stress\runs\web_gif_speed_gap_stress_trial_000_distinct_20260521` | 1920x540 / 48 frames | Generated from `p7_speed_gap_stress`, `trial_000`, `record_gif=true`; selected because the closer visible vehicle and relative-speed/gap pressure are visually distinct from the Ramp merge GIF. |

## Korean Captions

Ramp merge:

> Ramp merge 조건에서 No-GUIDANCE는 merge 이후 짧은 TTC와 높은 collision trial rate를 보였습니다. GUIDANCE는 선제적으로 gap을 만들며 min TTC를 1.31s에서 7.05s로 높이고 collision trial rate를 0.560에서 0.013으로 낮췄습니다.

Speed-gap stress:

> Speed-gap stress 조건에서 No-GUIDANCE는 속도 차이로 인해 closing risk가 커졌고, TTC < 5s ratio 0.484와 collision trial rate 0.853을 보였습니다. GUIDANCE는 TTC < 5s ratio와 collision trial rate를 모두 0으로 낮추며 위험 구간을 제거했습니다.

## Retired Generic GIFs

The previous generic GIF assets were removed from the public website asset folder to avoid scenario ambiguity:

- `assets/carla_event_a.gif`
- `assets/carla_event_b.gif`
- `assets/carla_event_c.gif`
- `assets/carla_event_d.gif`
- `assets/carla_phase_*.gif`
- `assets/carla_trial_*.gif`

Use only scenario-labeled GIF filenames for public comparison evidence.
