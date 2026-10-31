The project takes **14 days**. The critical path is **A → C → E → F → G → H**; the B–D branch has **3 days of slack**.

Schedule below uses day 0 as the start. “Start” and “Finish” are earliest times; Finish marks when each activity is complete.

| Activity | Duration | Start | Finish | Slack |
|---|---:|---:|---:|---:|
| A | 3d | 0 | 3 | 0d |
| B | 2d | 3 | 5 | 3d |
| C | 4d | 3 | 7 | 0d |
| D | 2d | 5 | 7 | 3d |
| E | 3d | 7 | 10 | 0d |
| F | 1d | 10 | 11 | 0d |
| G | 2d | 11 | 13 | 0d |
| H | 1d | 13 | 14 | 0d |

```mermaid
flowchart LR
  A["A · 3d"] --> B["B · 2d"] --> D["D · 2d"]
  A --> C["C · 4d"] --> E["E · 3d"]
  D --> F["F · 1d"]
  E --> F
  F --> G["G · 2d"] --> H["H · 1d"]

  classDef critical stroke:#d0453a,stroke-width:3px;
  class A,C,E,F,G,H critical;
  linkStyle 1,3,4,6,7 stroke:#d0453a,stroke-width:3px;
```

