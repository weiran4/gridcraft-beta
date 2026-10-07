# GFL PI tuning advisor — implementation and validation

This is a browser-only, model-scoped tuning preview, not HIL/EMT validation.
Source baseline: `8897496aa6b66aca2d8def4337e96c735054edaf`.
Implementation branch: `feat/gfl-tuning-advisor`; review: PR #1. No merge or Pages deployment is performed by the new CI.

## Delivered behavior

- Existing saved and hand-edited gains are evaluated independently of candidate search. Importing the PV1 fixture preserves all eight gain values, including legacy `manual=false`.
- Automatic recommendation does not require crossover targets. Explicit target mode supports tolerance, allowed reductions, frequency floors, minimum/preferred phase margin, and optional overshoot/settling limits.
- Search varies PI zero/crossover ratio instead of fixing it. It screens all sampled crossings, verifies zero-delay closed-loop poles, and compares physical-output linear step metrics. Multiple-crossing candidates are conservatively not recommended by this version; this is not a proof that all multi-crossing systems are unstable.
- Current PI and candidate results appear side-by-side. Search never changes gains. Application is explicit and restores only the previous gains, not later electrical edits.
- A dedicated module Worker carries immutable snapshots; stale, cancelled and cross-tab results cannot replace current inputs. Errors are isolated to the relevant facts, goals or search status.
- Source/units and model coverage accompany export. Historical applied evaluations become stale after model facts change.
- Original `autoTuneGfl` and its behavior remain available for regression. Non-GFL algorithms were not changed.

## PV1 results

All RLC, DC voltage/capacitance, sensor filters, current direction and timing remain the same as the user fixture. The following are normalized small-signal physical-output results for the existing rated-point scalar **zero-delay** model.

| Metric | Saved legacy PI | Balanced candidate in this search |
|---|---:|---:|
| d/q current crossover | 7.212 Hz | 29.723 Hz |
| Vdc crossover | 1.442 Hz | 5.945 Hz |
| Vac crossover | 1.442 Hz | 5.945 Hz |
| Vdc 2% settling | about 1409 ms | about 84.5 ms |
| Vdc overshoot | about 12.26% | about 6.56% |
| Vac 2% settling | about 534 ms | about 42.3 ms |
| Lowest loop PM | 60 degrees | about 63.8 degrees |

Other candidates trade settling and overshoot differently. These numbers do not imply the requested 50 Hz outer crossover is attained, global optimality, hardware saturation safety, or measured HIL behavior. Explicit unattainable 500/50 targets with 250/40 Hz floors are reported `targetNotMet` in the regression case.

## Verification

Local complete Node test suite after review: **220 passing, zero failures** (190 original plus 30 added). Build and static audit pass: **91 assets, 209 relative references**, no runtime Python/server/CDN dependency.

Independent SciPy/NumPy checks compare baseline, diagnostic probe and all three displayed automatic candidates: **20 transfer-function/step cases**. Denominator roots are independently checked; 2% settling error tolerance is max(2 ms,1%), overshoot tolerance 0.2 percentage point. The JS implementation also doubles its time grid and reports unresolved numerical/window states explicitly.

The CI workflow checks the actual built `dist` site with Chromium/Playwright. It covers **16 browser flows**, including import preservation, current PI evaluation, unmet targets, preview non-mutation, apply, restore, reload, cancellation, invalid target with usable Bode, manual analysis where the legacy tuner fails, stale inputs, two-tab edits, mode banks and unconfigured-mode application. Screenshots are captured at 1440x900, 1366x768 and 390x844. Results/artifacts are tied to the corresponding workflow commit; check the latest green run before merging.

Run locally:

```sh
npm test
npm run build
npm run audit:static
node scripts/validate-gfl-advisor.mjs
python scripts/validate-gfl-advisor.py
# Development only, not installed in the deployed browser application:
npm install --no-save --package-lock=false playwright@1.56.1
npx playwright install chromium
SITE_DIR=dist node scripts/browser-gfl-advisor.mjs
```

A read-only GitHub Actions workflow was added on the feature branch/PR to run these checks. Its source artifact contains tracked repository files only, not `.git`, credentials or runner environment variables. The coding container could not directly clone GitHub or use a local HTTP browser, so the full source snapshot and browser screenshots were retrieved through these approved workflow artifacts. Unit/numerical/build checks were also run locally. No separate reviewer agent or physical HIL was available; code self-review, independent numerical checks and real browser regression are not a substitute for human review before deployment.

## Bounds and intentionally unavailable claims

- No PLL, full dq coupling, nonlinear limiters, PWM switching, protection, FRT or unbalanced-fault model was added.
- Nonzero pure delay retains exact frequency-domain exponential delay but is marked frequency-only. Zero-delay poles/steps are not used as a delayed-system certificate. Such candidates cannot be applied as fully verified recommendations by this version.
- DC energy regulation uses the selected analysis capacitor and constant input power; it does not claim to model a DC node clamped by the ideal voltage-source component.
- The shared AC voltage measurement filter still affects both feedforward and Vac feedback, as in the legacy model.
- The maximum current, actual device delay and uncertainty are not inferred from ratings or control period. Missing facts/defaults are visible. Disturbance-recovery focus is disabled until a specific injection model exists.
- Search is finite, coarse logarithmic grids plus a diversified beam, refined crossover location and two denser frequency validations. It is not exhaustive continuous gain optimization; a failed search only describes this model/controller family/range/budget. Narrow feasible islands can be missed. Search bounds and rejected categories are included in results. This is the bounded first implementation of the broader design plan, not a global optimizer.
- Final target priority is safety/hard constraints, then exact crossover targets, then explicitly allowed reductions, then performance/PM preference. Automatic mode still honors optional hard time/overshoot constraints; unmet limits are never ordinary success.
- Candidate application is blocked when required metrics or numerical checks are unresolved. Merely reaching 0 dB at a chosen frequency is not sufficient.

## Integration notes

The original stylesheet is preserved; advisor styles live in `ui/gfl-advisor.css`. The original page, unit conventions, manual PI controls, Bode and graph editor remain. Search is explicit rather than an automatic side effect of refresh. The helper compatibility values fi/fp used to query legacy base/model functions are not user targets and never write new gains.

The fixture `tests/fixtures/PV_Grid_Demo.json` retains exact user-uploaded bytes, SHA-256 `1982d9f5a1c0c59e058ad42fc6b50a876c41da29e2aaa048dac49b3a5d25a972`; it is a regression input, not a replacement default project.
