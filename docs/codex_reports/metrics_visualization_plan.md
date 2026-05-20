# Metrics and Visualization Plan

## Source-of-truth data

### Ramp merge

| Metric | No-GUIDANCE | GUIDANCE | Required reading |
|---|---:|---:|---|
| Ego min TTC | 1.31s | 7.05s | +5.74s increase |
| Ego TTC < 5s ratio | 0.454 | 0.029 | 0.425 absolute reduction, about 93.6% |
| Ego TTC < 1.5s ratio | 0.045 | 0.0007 | 0.0443 absolute reduction, about 98.4% |
| Ego collision trial rate | 0.560 | 0.013 | 0.547 absolute reduction, about 97.7% |
| Ego excessive accel | 212.7 | 77.0 | 135.7 reduction, about 63.8% |
| Ego excessive decel | 66.8 | 2.1 | 64.7 reduction, about 96.9% |
| Ego jerk | 4.53 | 2.59 | 1.94 reduction, about 42.8% |

### Speed-gap stress

| Metric | No-GUIDANCE | GUIDANCE | Required reading |
|---|---:|---:|---|
| Ego min TTC | 0.96s | 15.62s | +14.66s increase |
| Ego TTC < 5s ratio | 0.484 | 0.000 | 0.484 absolute reduction, 100% |
| Ego TTC < 1.5s ratio | 0.093 | 0.000 | 0.093 absolute reduction, 100% |
| Ego collision trial rate | 0.853 | 0.000 | 0.853 absolute reduction, 100% |
| Ego excessive accel | 227.2 | 114.6 | 112.6 reduction, about 49.6% |
| Ego excessive decel | 50.6 | 36.6 | 14.0 reduction, about 27.7% |
| Ego jerk | 10.55 | 5.21 | 5.34 reduction, about 50.6% |

## Recommended visualization components

- Hero highlight cards for the four headline safety metrics.
- Two scenario visual blocks: Ramp merge and Speed-gap stress.
- Combined metric table with safety metrics first and comfort/control proxy metrics second.
- CSS-only grouped bar charts:
  - Min TTC by scenario, where higher is better.
  - Collision trial rate by scenario, where lower is better.
  - TTC risk ratios for `< 5s` and `< 1.5s`, where lower is better.
  - Comfort proxy changes for excessive acceleration, excessive deceleration, and jerk.

## Korean interpretation text

Ramp merge:

> Ramp merge에서 GUIDANCE는 min TTC를 1.31s에서 7.05s로 높이고, collision trial rate를 0.560에서 0.013으로 낮췄습니다. 이는 merge 상황에서 선제적으로 gap을 만든 결과로 해석할 수 있습니다.

Speed-gap stress:

> Speed-gap stress에서 GUIDANCE는 min TTC를 0.96s에서 15.62s로 크게 높이고, TTC < 5s ratio와 collision trial rate를 0으로 낮췄습니다. 속도 차이로 인한 closing risk가 GUIDANCE 조건에서 제거된 것으로 해석됩니다.

## Implementation recommendation

The VLA page is static HTML with inline CSS, so no data module is needed. Inline semantic HTML plus CSS bar charts is the lowest-risk implementation.
