# GIF Asset Manifest

## Search result

The VLA page currently has four existing GIF files under `assets/`:

| Asset path | Scenario use | Recommended section | Why it is usable | Caption / alt guidance |
|---|---|---|---|---|
| `assets/carla_event_a.gif` | Ramp merge visual sample | Ramp merge block | Existing side-by-side CARLA event GIF; no broken link risk. | Caption should connect to Ramp merge metrics but should not claim real-world validation. Alt: `Side-by-side CARLA visualization for No-GUIDANCE and GUIDANCE comparison.` |
| `assets/carla_event_b.gif` | Ramp merge additional sample | Ramp merge block | Existing side-by-side CARLA event GIF; can provide a second visual example. | Alt: `Additional side-by-side CARLA visualization for Ramp merge comparison.` |
| `assets/carla_event_c.gif` | Speed-gap stress visual sample | Speed-gap stress block | Existing side-by-side CARLA event GIF; no broken link risk. | Alt: `Side-by-side CARLA visualization for Speed-gap stress comparison.` |
| `assets/carla_event_d.gif` | Speed-gap stress additional sample | Speed-gap stress block | Existing side-by-side CARLA event GIF; can provide a second visual example. | Alt: `Additional side-by-side CARLA visualization for Speed-gap stress comparison.` |

## Recommended Korean captions

Ramp merge:

> Ramp merge 조건에서 No-GUIDANCE는 merge 이후 짧은 TTC와 높은 collision trial rate를 보였습니다. GUIDANCE는 선제적으로 gap을 만들며 min TTC를 1.31s에서 7.05s로 높이고 collision trial rate를 0.560에서 0.013으로 낮췄습니다.

Speed-gap stress:

> Speed-gap stress 조건에서 No-GUIDANCE는 속도 차이로 인해 closing risk가 커졌고, TTC < 5s ratio 0.484와 collision trial rate 0.853을 보였습니다. GUIDANCE는 TTC < 5s ratio와 collision trial rate를 모두 0으로 낮추며 위험 구간을 제거했습니다.

## Uncertainty

The existing GIF filenames are generic (`carla_event_a-d.gif`) and do not encode the final scenario name or trial ID. They are safe to reference because they exist, but a scenario-labeled GIF export would make the page more auditable.
