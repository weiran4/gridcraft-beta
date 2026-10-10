# PLL mainline integration: implementation evidence and release gate

## Status and scope

This note covers the first-stage PLL mainline integration. It does not adopt a
new literature-derived GFL/GFM model, establish a public benchmark, or certify
hardware or standards compliance.

The reviewed runtime release is `5e60e0cb4073bb22`, with 136 manifest-listed
published assets. On 2026-10-10, all eight browser suites listed below passed
in actual Windows Chromium execution against that release. The mainline suite
passed 35 checks across desktop (1440×1000) and mobile (390×844), including v9
JSON download assertions, with no page errors. The browser-harness correction
used for that run changed test selectors and readiness/focus sequencing only;
all runtime source and published asset bytes remained unchanged.

The source integrates onto `main` from baseline
`14dac0a47718f6fc0148c3f88c6a3dd5d1568a82`. A clean build records its exact commit
in `release.json`; a dirty or unversioned build does not claim a source commit.
The release ID and post-stamp asset hashes identify runtime bytes separately.
GitHub Actions validation and independent public-site byte/cache/smoke checks
are still required for each publication. A local pass alone does not establish
that either public entry site is serving the release.

## Model, experiments and identity

- Missing explicit `modelId` stays `legacy-scalar`, including older projects
  with `dqAnalysis.enabled`. Legacy PI is retained exactly.
- `gfl-dq-reference-v1`, product version 1, uses historical equation version
  `gfl-dq-srf-pll-v1`. PLL defaults remain labelled engineering assumptions.
- The high-voltage PCC P/Q point is solved before linearization. State order is
  authoritative, with explicit frames, pu/SI bases and applicability. Zero Ki
  removes its integrator; bypassed measurements remove the corresponding state.
- `outer-reference-closed` retains both outer loops. Its entire pole set owns
  main stability. `current-reference-frozen-outer` freezes outer output
  increments, retains operating current bias, and removes disconnected outer
  integrators. Its pole set is diagnostic; it is not a new physical model.
- Each experiment independently steps the two reference inputs, with the other
  increments zero. The default is 0.01 pu, and negative steps are supported.
- Tracking settling uses the requested target ±2% of requested amplitude.
  Steady-state gain is never substituted as the target. Cross-axis metrics are
  absolute peak/residual increments. Their tracking overshoot/error is null.
- T/O ranking uses required outer tracking channels; E is the largest absolute
  target-relative steady-state error over required tracked channels. Optional
  current/cross-axis targets impose no implicit gates when absent.
- Model, experiment and evaluation fingerprints include their respective
  physical/PI, connection/step/policy, and target/ranking scopes. Display units,
  scaling and zoom do not change numerical identity.
- Current/manual/automatic candidate evaluation shares the Worker evaluator.
  Search keeps the scalar seed generator and the shared 18,000 scalar / 64
  coupled / 25-second limits. This is not full MIMO optimization or PLL tuning.
- Application rereads the project, reevaluates the selected PI in a Worker and
  consumes a one-use transaction ticket. Undo is PI-only. Persisted/imported
  evidence does not authorize a future write. Unknown/unsupported inputs,
  marginal/unstable poles, incomplete responses and Padé-only results cannot pass.

Detailed equations and assumptions are in [the model note](gfl-dq-pll-model.md).

## Numerical policies and inherited test criteria

These numbers are inherited implementation-test criteria, not independently
established physical accuracy limits, tuning requirements or standards limits.

| Quantity | Product / independent criterion |
|---|---|
| Product model policy | `gfl-dq-linearization-v1` |
| Operating-point absolute RHS residual | ≤ 1e-7 |
| Product central-difference steps | 2e-6 and 1e-6 × max(1, state magnitude) |
| Product row-normalized refinement discrepancy | ≤ 1e-5 |
| Product stable / marginal / unstable boundary | maximum pole real part ±1e-6 s⁻¹ |
| Independent five-point Jacobian | step 1e-5 × max(1, state magnitude), row-normalized error < 1e-6 |
| Independent full-pole matching | Hungarian one-to-one assignment, max normalized error < 2e-5 |
| Independent frequency matrix | 0.1, 1, 10, 50, 200 Hz; normalized error < 2e-5 |
| Independent nonlinear local test | amplitude 1e-6, horizon 0.002 s, relative state/output error < .003 |
| Response policy | `gfl-dq-response-v1` |
| Independent waveform / equilibrium error | ≤ .1 requested-amplitude percentage points |
| Independent overshoot discrepancy | ≤ .2 percentage points |
| Independent settling discrepancy | ≤ max(.002 s, .01 × reference settling time) |
| Equilibrium solve normalized residual | ≤ 1e-12 |
| Applicable pu peak, residual and signed steady-state error discrepancy | ≤ .1 requested-amplitude percentage points (same retained numerical bound) |

The JSON evidence exports the exact selected product policies, row scales,
physical balance residuals, pole assignments, actual errors and response-quality
records. Control period, PWM period, physical Padé delay and numerical sampling
are kept separate. Nonzero explicit delay is labelled approximate and cannot
be an application certificate.

## Independently executed numerical evidence

Environment: Linux x86_64 (kernel 6.18.44, glibc 2.41), Node v24.19.0,
Python 3.12.14, NumPy 2.3.5, SciPy 1.17.0. No product dependencies were installed.

### Equilibrium, nonlinear equations, matrices, poles and frequency

`validate-gfl-dq.mjs` exports comparison subjects.
`validate-gfl-dq.py` reconstructs the high-voltage operating point solely from
physical inputs using an independent voltage-squared polynomial solve and
complex KVL/admittance. It independently initializes states and PLL coefficients,
checks electrical KVL/KCL and DC power balance, constructs its own closed/frozen
nonlinear RHS, and computes five-point A/B/C/D derivatives. No exported `op`,
`x0`, PLL coefficient or JS RHS output is accepted as reference truth.

Actual result: **72 passed, 0 failed**, 36 configurations × both feedback
connections. The coverage includes all P/Q, P/Vac, Vdc/Q, Vdc/Vac pairs; PLL
on/off, 10/12/20/30/35 Hz and damping/filter variants; positive and negative
nonzero Q; strong/weak grid; bypassed sensors; each of d/q/P/Q Ki=0 and all Ki=0
in every mode pair; explicit rigid/capacitor DC; and nonzero Padé delay.

Every complete pole set is matched bijectively, including repeated/near-zero
poles. A deliberate duplicate-pole self-check is rejected even when the largest
real part is unchanged. Every case also checks a 1e-6 state perturbation and
separate 1e-6 steps of both reference inputs for 2 ms using independent DOP853
nonlinear integration and SciPy augmented-matrix exponentials.

Observed maxima:

- Absolute equilibrium RHS residual: 3.59598e-13
- Five-point row-normalized Jacobian error: 1.28830e-10
- Full-pole normalized one-to-one error: 1.01924e-8
- Frequency-matrix normalized error: 3.12718e-8
- Nonlinear local state relative error: 1.04783e-4

Per-case details are in `artifacts/gfl-advisor/dq-model-verification.json`.
The red run genuinely produced 36 frozen-connection failures and 36 closed-loop
passes before the independent Python freeze connection was implemented. That
red run exposed missing verifier wiring, not a claimed production-model defect.

### Response traces and target-relative metrics

Actual result: **33 passed, 0 failed**. This retains the existing 25 response
cases and adds the two missing Vac mode pairs (eight separate reference runs).
The prior cases cover one/repeated poles, nonunit gain, negative steps, direct D,
coupled axes, slow/stiff dynamics, drift, instability, short windows and late/narrow
oscillatory target-band recrossings. Both mainline feedback experiments now run
for all four mode pairs.

Each physical response ModelRecord is first checked against independently
reconstructed physical inputs, operating point, state order, y0 and five-point
A/B/C/D. This links the response wrapper to the independent equations, rather
than only testing consistency of exported matrices with their own trajectories.
SciPy expm is evaluated independently at every exact exported time, and a
separate 768-bin-per-segment refinement grid recomputes metrics. Equilibrium uses
an independent solve. Analytic modal timing plus SciPy/brentq provides final-band
crossing witnesses for narrow oscillatory excursions. JavaScript exponentials,
equilibrium answers, poles and metrics are not reused as reference answers.

Observed maxima:

- Waveform error: 1.97208e-5 requested-amplitude percentage points
- Equilibrium error: 7.96473e-13 requested-amplitude percentage points
- Overshoot discrepancy: .00201159 percentage points
- Settling discrepancy / allowed tolerance: .086881
- Mainline settling discrepancy: .00487620 s

The absolute worst settling discrepancy is 15.625 s in a deliberately very-slow
case; it is within the inherited 1% time-relative tolerance. This is not evidence
that a fixed 2 ms bound holds for all response horizons.

Unstable cases, the frozen capacitor DC drift cases, nonunit-gain target misses,
short windows and unresolved high-frequency excursions intentionally do not
receive verified finite settling certificates. Stored nulls mean unverified or
inapplicable, not zero. See both the original
`artifacts/gfl-mainline-response/response-verification.json` and the canonical
`artifacts/gfl-advisor/mainline-response-verification.json` for per-case response,
steady-state, overshoot and settling errors and channel units.

The independent metric target is derived only from the requested step amplitude
and its verified target output ID. Input/output indices, response/channel IDs,
roles and reported targets must agree with the ordered model ports and requested
experiment steps. Cross/diagnostic targets are zero. Final-gain normalization is
rejected even if its waveform is correct. Applicable pu peak, residual and signed
steady-state-error metrics are compared directly with independently calculated
values using the retained .1 requested-amplitude percentage-point bound; null
applicability is also checked, and actual per-channel errors are exported.
Mutation regressions reject a false final-gain completion certificate, separately
zeroed cross peak/residual, wrong signed error and identity/role/target mismatches.
Positive, negative, nonunit-gain and coupled valid records remain accepted.
The original mutation regression run passed 8 tests (16 rejection cases
and four valid-record controls); its red run failed in 11 mutation subcases.
The final review correction adds a loose-policy mutation: the independent oracle
still uses the requested target ±2% even when reported policy metadata says 50%.
The refreshed run passed 9 tests (17 rejection cases and four valid controls).
Both independently reproduced invalid records now report REJECTED. No production
trajectory/solver defect was demonstrated or changed by these verifier fixes.

## Final review correction (2026-10-10)

Both Important findings and all five elected Minor findings were addressed in
one bounded correction wave:

- Invalid manual edits have a separate application-invalidation callback;
  diagram filter/gain edit validation cannot retain a pending application ticket.
  Invalidating alone does not resume cancelled work. Native-module regressions
  hold an apply-check pending, deliver late success/error callbacks, and verify
  unchanged PI/history plus corrected fresh evaluation and explicit application.
- The supported response contract requires `settlingBandFraction: .02` at
  response, evaluator/cache and application boundaries. Other window, point
  budget and refinement controls remain configurable and fingerprinted.
- Explicit canonical settings without source records use `stored-unknown`;
  genuinely absent defaults retain `engineering-default`. Malformed legacy PLL
  booleans stay readable in the original record and require a valid explicit
  replacement before mainline opt-in/resolution.
- Missing snapshots return typed `invalidInput`. Equal candidates use
  locale-independent Unicode code-point order. Malformed response samples are
  unavailable; legitimate positive/negative zero still renders as zero.

The final affected suite passed 203 tests, and the final full suite passed 632.
The refreshed 72-case dq input/report and 33-case response input/report are
byte-identical to their pre-correction versions: no physical equations, default
trajectories, metric tolerances or numerical reference criteria were changed.
The pending-apply invalid-edit cases subsequently passed in the actual Windows
browser run described above. Node transport tests and syntax checks alone do
not establish browser acceptance.

## Build/release gate

`build-static.mjs` retains the existing 16-hex pre-stamp source fingerprint and
uses it for every local JS/CSS import stamp. It then hashes **actual emitted
bytes**, including non-text assets and `.nojekyll`, into `dist/release.json`.
The manifest excludes itself from its hash map. No second release/cache identity
is introduced. A dirty or unverifiable source never claims that HEAD identifies
the tested source; dirty builds retain HEAD only as labelled background metadata.

The release tests build temporary fixtures, including transitive imports, a
Worker URL, JSON and binary files. They do not depend on checked-out/stale `dist`.
They check every hash against post-stamp bytes, one common release ID, the exact
original pre-stamp fingerprint, repeat-build determinism, changed-source identity,
and preservation of evidence outside the normal dist target. The initial test
failed because `release.json` did not exist; both tests then passed after the
manifest addition. Builds overwrite only the normal `dist` target.

The reusable `gfl-advisor-checks.yml` runs the response and browser commands after
its existing dependency setup and uploads both response evidence and release
manifest. Its timeout is 30 minutes to include the new independent/real-browser
checks. `pages.yml` remains unchanged: validation → build → deploy.

## Reproducible validation commands

Executed local non-browser commands:

```sh
npm test
npm run build
npm run audit:static
node scripts/validate-gfl-advisor.mjs
python scripts/validate-gfl-advisor.py
node scripts/validate-gfm-advisor.mjs
python scripts/validate-gfm-advisor.py
node scripts/validate-gfl-dq.mjs
python scripts/validate-gfl-dq.py
node scripts/validate-gfl-mainline-response.mjs
python tests/gfl-mainline-response-verifier.test.py
python scripts/validate-gfl-mainline-response.py
node --test tests/gfl-mainline-release.test.js
node --check scripts/browser-gfl-mainline.mjs
node --check scripts/browser-pll-and-gfm-step.mjs
```

Actual final-review repair gate result: 632/632 unit tests; build passed; static audit passed
for 133 files and 352 relative references; legacy GFL 20/20 and GFM 28/28
independent checks; dq 72/72; response 33/33; release tests 2/2. All listed
non-browser commands exited zero. The actual dist release is `5e60e0cb4073bb22`;
all 136 listed asset hashes were independently rechecked against emitted bytes.
These numerical checks validate the declared equations and implementation;
they are not hardware or industry-standard certification.

Actual Windows Chromium execution passed all eight suites below:

```sh
SITE_DIR=dist node scripts/browser-gfl-advisor.mjs
SITE_DIR=dist node scripts/browser-gfl-four-panel.mjs
SITE_DIR=dist node scripts/browser-gfl-manual.mjs
SITE_DIR=dist node scripts/browser-gfl-step.mjs
SITE_DIR=dist node scripts/browser-gfm-advisor.mjs
SITE_DIR=dist node scripts/browser-gfm-manual.mjs
SITE_DIR=dist node scripts/browser-pll-and-gfm-step.mjs
SITE_DIR=dist node scripts/browser-gfl-mainline.mjs
```

The new browser harness is authored for 1440×1000 and 390×844. It asserts legacy
PI preservation, opt-in mainline results, matrix/unit/export identity, current /
manual / automatic same-PI parity, Worker cancellation plus injected late packets,
double-apply protection, apply/undo scope, synchronous staleness on edits,
held real apply-check replies followed by invalid manual/filter edits, late
success/error fencing, corrected fresh applications,
fixed-angle PLL-state removal, unsupported/marginal/Padé non-pass states, viewport
layout and unchanged GFM behavior. It captures screenshots only on a real run.
The existing PLL/GFM browser export assertions were minimally updated to the v9
`scalarLegacy.dqAnalysis` and `freshness` locations, retaining their historical
versus current evidence semantics.

## Publication verification

Each release must pass the complete automated checks on its exact `main`
commit. Build from that clean source, then independently verify both public
entry sites report the same release ID and serve matching manifest-listed asset
bytes. Check cache behavior and actual page/browser behavior at both sites;
similar screenshots alone are insufficient.

If either site lags or any required check fails, publication remains incomplete.
This document records pre-publication validation and does not assert a successful
public deployment. Literature-model adoption and public-benchmark validation
remain separate later stages.
