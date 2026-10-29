# General controller-structure diagnostics

`structure.html?ibr=<id>` reads the selected GFM and saved PI once. Edits form an independent, non-persistent diagnostic draft. No parameter is applied to the engineering project. The existing GFM scalar design and three-mode tuning retain their previous defaults and semantics.

The diagnostic uses `evaluateGfmStructure(request)`, exporting the complete input, resolved structure, operating point, residual, matrix, state names, poles, and separate capability checks. It is not an automatic tuning certificate. Blank capability limits remain unknown.

The optional structure contract supports:

- Capacitor decoupling from internal capacitor voltage or filtered PCC voltage.
- Decoupling at forming or nominal angular frequency.
- A separate first-order grid/load-current feedforward filter (seconds).
- A positive common actuator gain, distinct from local voltage feedforward.
- Explicit initialized-equilibrium output biases; disabling Ki removes integral states but retains the declared bias. It does not simulate an unbiased proportional controller.

Connected diagnostics use the existing Droop, VSG or Synchronverter equations. Their definitions are reference structures, not universal device specifications. New structure choices do not flow into the legacy scalar Bode or its recommendations; use this separate complete-matrix diagnostic to assess them.

Island diagnostics default to full forming dynamics (`islandControl: 'full'`). Droop, VSG and Synchronverter reuse the connected equations in the controller's rotating frame, without a grid branch or an absolute-angle state. Absolute angle is a gauge degree of freedom in a balanced autonomous island; omitting it does not freeze frequency or amplitude. The `fixed` option remains an explicit inner-loop diagnostic and the low-level `buildGfmIslandModel` wrapper retains its legacy fixed default for callers that deliberately request that check.

Supported external load: none, or balanced per-phase shunt resistance. PCC is solved algebraically as `v=(vc+Rc*iL)/(1+Rc*Gload)`; load current is `Gload*v`. Power feedback is at the load branch, not the bridge. Voltage amplitude feedback is the norm of filtered dq PCC voltage, not a simulator-specific RMS estimator. Grid parameters and former connected P/Q do not determine the island point. SCR does not apply.

The selected `load.voltagePu` defines a matched nominal-frequency equilibrium: Pref=Pload, Qref=Qload, Vref=Vpoint. This is not a solver for arbitrary mismatched P/Q/V references. For VSG, `2H*domega/dt=Pref-Pf-D*(omega-1)` and `dE/dt=Kv*((Vref-|Hv*v|)/(nq/100)+Qref-Qf)`. P/Q filters and omega/E states now participate in the island Jacobian. No E limiter is linearized. A positive-real complex pair predicts local oscillation growth, not the amplitude or exact frequency of a saturated limit cycle.

Zero feedback-filter time bypasses that filter; zero Ki removes that integral state. Positive delay is first-order Padé, not an identified sampled/ZOH implementation. No startup, limits, carrier switching or DC midpoint dynamics are modeled. A stable equilibrium cannot certify successful startup or thermal capability.

The GFL offline page also accepts optional grid-current magnitude and bridge q-axis reference magnitude limits. The current PI steady reference equals bridge current in this model. These checks describe the unsaturated equilibrium and do not implement a limiter.

External comparison data stays outside the source/build. `compareCase` requires matching equilibria, a small-signal observation and explicitly unsaturated operation before reporting agreement; startup and unknown cases remain unqualified.
