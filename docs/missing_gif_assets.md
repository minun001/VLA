# Missing GIF Assets Checklist

The current repository contains usable side-by-side CARLA GIFs, but they are named generically and do not encode final scenario provenance.

For stronger paper/demo traceability, generate and add scenario-labeled GIFs such as:

- `assets/ramp_merge_trial_000_side_by_side.gif`
  - Shows No-GUIDANCE vs GUIDANCE for a Ramp merge event from the final 150-trial study.
  - Should include enough frames to show pre-merge approach, merge/cut-in, ego response, and post-event gap stabilization.

- `assets/ramp_merge_trial_001_side_by_side.gif`
  - Additional Ramp merge event with different initial gap/speed parameters.

- `assets/speed_gap_stress_trial_000_side_by_side.gif`
  - Shows No-GUIDANCE vs GUIDANCE under relative-speed closing risk.
  - Should show No-GUIDANCE late reaction and GUIDANCE proactive gap creation.

- `assets/speed_gap_stress_trial_001_side_by_side.gif`
  - Additional Speed-gap stress event with different initial speed/gap parameters.

Until these are generated, the page uses existing non-broken `carla_event_a-d.gif` assets and keeps the claim boundary limited to controlled CARLA simulation diagnostics.
