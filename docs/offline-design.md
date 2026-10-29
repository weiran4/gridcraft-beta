# GFL offline analytical design (beta)

Open `offline.html` from the GFL page after loading a project. This opt-in page reads the current electrical object and PLL settings; it never writes PI or physical parameters back to the project. The original analysis remains available. All production calculations run in a browser Worker and need only static hosting.

## Model and operating point

- Balanced, averaged continuous dq model, bridge-to-grid positive current, d=cos and q=-sin Park convention.
- Parallel PI: `Kp + Ki/s`; the displayed integration time is `Ti=1/Ki`, independent of Kp. Zero Ki disables integration and exports `Ti:null`. The conversion utility distinguishes series PI and rejects conflicting Ki/Ti representations.
- Initialized equilibrium output biases are part of this incremental model. Zero Ki does not imply zero controller output at equilibrium. This does not predict the offset of an unbiased controller started at zero.
- The offline strategy explicitly includes the project network, without changing its legacy SCR checkbox. PLL detector normalization is explicitly selected; PLL bandwidth, filters and electrical parameters stay fixed during search.
- Historical P/Q mode reproduces the stored operating point. Explicit Vac mode solves Q for the requested Vac, retaining only the supported high-voltage branch. AC P is specified and balanced DC input power is derived, including losses. An independently entered Pdc is a consistency constraint, not a second free power setpoint. Inconsistent Q/Pdc constraints are rejected.
- Current and modulation limits remain unknown until entered. Stability alone cannot qualify an unknown capability limit.

## Search and evidence

The search uses deterministic dispersed starts and bounded logarithmic coordinate moves guided by the complete closed-loop poles. Each gain can be locked; d/q symmetry requires compatible bounds. Default bounds are Kp 0.005–20 and Ki 0.01–3000. Lock Ki at zero to keep a proportional-only loop. Advanced input accepts explicit per-gain bounds.

The search is limited by evaluations and a 10/25 second budget. Completed pole-only candidates survive budget exhaustion with frequency verification pending. Finding no candidate is not a proof of infeasibility. Finalists receive sampled 2×2 closed-loop reference-frequency checks. These are neither open-loop return ratios nor sensitivity/robust-stability certificates. Explicit scalar margin requirements are checked additionally; they do not substitute for full-model stability.

Scene inputs are finite nominal and one-at-a-time points, not a continuous uncertainty region or all combinations. Each point gets a new equilibrium and model; failures remain in the report. A Q scenario cannot be specified independently when Vac mode solves Q. The export recalculates the rounded gains and all requested scenes. It records actual solved physical inputs separately from requested inputs, and does not imply application to the original project.

## Limits and verification

Time-domain overshoot/settling requirements remain pending here; use the original time-domain path for them. Current limiting, saturation, switching, fault ride-through and actual multirate digital scheduling are outside this strategy. Explicit delay uses the existing Padé approximation. Frequency maxima are sampled, not rigorously bounded between points. Candidate search is nominal-point based; scene checks are performed on analysis/export, not robust optimization.

The page restores its per-tab draft on reload only when the source project is unchanged. Input edits, external project changes and navigation invalidate results. Cancellation terminates the Worker. Original PV/BESS demo files are unchanged.

Validation includes operating-point conflicts, PI conventions, zero integration, full-model poles, scene rejection, search locks/bounds/budgets and rounded export. Development-only independent SI equations also reproduced the historical PV working point and a comparison controller: maximum normalized matrix error below 7e-9 and sampled relative frequency error below 1e-8. This is mathematical cross-checking, not external time-domain simulation validation.

Future stages cover passive-component co-design, unbiased static-controller equilibria, additional DC input characteristics, control-effort frequency outputs and explicitly scheduled discrete models. They are not silently approximated as completed checks.
