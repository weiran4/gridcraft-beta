# GFL SRF-PLL / dq 联立工程参考模型 v1

This change adds an **opt-in, model-scoped coupled check**, not an IEEE-certified
universal converter. The existing GFL scalar tuner/step views remain a baseline.
GFM's new four-step view uses **its own existing** current/voltage scalar model;
GFM synchronization is not replaced by a GFL PLL.

## Sources and interpretation

Primary references checked for this implementation:

1. Imperix TN103, **Synchronous reference frame PLL**:
   <https://imperix.com/doc/implementation/synchronous-reference-frame-pll>
   Normalized q-axis error, PI/VCO structure, Kp=2ζωn, Ki=ωn².
2. Imperix TN106, **Vector current control**:
   <https://imperix.com/doc/implementation/vector-current-control>
   dq RL KVL, feedforward/decoupling signs, measurement and actuator delays.
3. IEEE 2800-2022 official scope:
   <https://standards.ieee.org/ieee/2800/10453/>
   Interconnection/performance requirements; not a certification of the custom
   equations or thresholds below. No pass/fail in this module means compliance.

The references support the **building blocks**, not this exact implementation
or a claim that it matches all vendors. The LCL, controller, energy and Jacobian
assembly below is Gridcraft's documented derivation. No third-party source code
is copied. The UI links these sources and exports the actual A/B/C/D matrices.

## Explicit boundary

Supported: one balanced converter, Lf/Rf, one PCC shunt **series Rc–C**,
radial upstream positive Lg with nonnegative Rg (including referred transformer
leakage), one nominal ideal source. Lf,Lg,C must be positive; Rc and Rg may be zero.
Missing/unsupported topology is an error, not replacement by a stiff grid.
The source is 1 pu at nominal voltage unless a different `gridVoltagePu` is
explicitly provided to the model. No transformer magnetizing dynamics, parallel
IBRs, zero/negative sequence, faults, saturation, current limits or protection.

PCC P/Q are the **grid-side** operating injections, not bridge power. Currents
are positive converter→grid; Park convention d=cos, q=−sin. Per-unit bases are
Vb=√(2/3)VLL, Ib=√2 S/(√3 VLL), Zb=VLL²/S. Thus Ppu=vd id+vq iq and
Qpu=vq id−vd iq, with no further 3/2 factor.

## Equilibrium first

Use the high-voltage solution of:

    E² = V² − 2(rP+xQ) + (r²+x²)(P²+Q²)/V².

The nominal frame initially aligns with the solved PCC voltage (V,0).
Compute ig=(P/V,−Q/V), shunt ic=(V,0)/(rc−j/(ω0 C Zb)), il=ig+ic,
vc=(V,0)−rc ic, eg=(V,0)−(rg+jω0 lg)ig,
and u=(V,0)+(rf+jω0 lf)il.
All r and l here have been referred to the PCC and divided by Zb;
capacitance in the differential equations is c=C Zb.

Initial bridge power equals PCC injection plus Rf and Rc losses. This is used
for the equilibrium DC input power in capacitor mode. Controller integral
**output increments** start at zero around the required equilibrium outputs;
when Ki=0 the corresponding initialized bias is constant, not a hidden integrator.
Nonexistent high-voltage solution and residual >1e-7 are reported before linearization.

## Electrical states in the fixed nominal synchronous frame

Let J=[[0,1],[-1,0]]. The electrical frame rotates at nominal ω0, not PLL ω.

    v  = vc + rc (il−ig)
    d(il)/dt = (u−v−rf il)/lf + ω0 J il
    d(ig)/dt = (v−eg−rg ig)/lg + ω0 J ig
    d(vc)/dt = (il−ig)/c       + ω0 J vc.

The upstream RL is part of the dynamic network, not just a scalar SCR value.
SCR itself is diagnostic; R/X/C drive the equations. This avoids double-counting
SCR as an extra plant gain.

## Controller frame / PLL

Controller-frame measurements are R(δ)v and R(δ)il, with
R(δ)=[[cosδ,sinδ],[-sinδ,cosδ]]. Voltage commands transform back using R(−δ).
Both coordinate perturbations and operating values enter the Jacobian.

    ePLL = vq/controller / |v/controller|
    dδ/dt = kpPLL ePLL,filtered + ξPLL
    dξPLL/dt = kiPLL ePLL,filtered
    kpPLL = 2 ζ (2π fn), kiPLL=(2π fn)².

`fn` is the second-order **characteristic frequency**, not numerically identical
to either actual −3dB bandwidth or loop crossover. The initial 20 Hz, ζ=1/√2
are editable engineering defaults, not measured values or standard thresholds.
PLL's optional LPF acts on normalized error and is separate from the existing
10 ms PCC voltage feedforward filter. Its position is explicitly declared.
Turning PLL off fixes δ=0; this is **not** instantaneous PCC-angle tracking.

Existing current/voltage LPFs are applied **after** rotating to controller axes.
Power is measured at the PCC, with the existing selected P/Q LPF. Vdc feedback
and Vac magnitude use their stated filters. Zero time constants remove states.
The current PI uses filtered current for decoupling; therefore its residual
cross-coupling is kept, rather than assumed cancelled. Decoupling frequency may
be the PLL estimate ω0+dδ/dt or the fixed nominal value, chosen explicitly.

    ir = il0 + sign · (Kp_outer · e_outer + ξ_outer)
    u_controller = hv + [−ω lf hiq, +ω lf hid]
                   + initialized operating bias + Kp_i(ir−hi) + ξ_i.

P/Vdc signs are +/−; Q/Vac signs are −/−. Physical P, Q and voltage magnitude
are relinearized at the solved operating point. This is **not** the old static
Vac X/Zb scalar approximation, and the original independent scalar poles do
not certify the new closed multi-channel matrix.

## DC and implementation details

- Default `auto`: Vdc mode uses independent capacitor energy, P mode uses rigid DC.
- Capacitor mode:

      Cdc Vdc0² vdc d(vdc)/dt = Sbase (Pdc0 + ΔPdc − u·il).

  Includes bridge-side active power, Rf/Rc losses and AC inductor/capacitor energy
  exchange. Input power is held constant unless the DC disturbance input changes.
- Rigid DC cannot evaluate Vdc feedback regulation; that combination is rejected.
- Actuator is an ideal voltage command with instantaneous DC-voltage normalization.
  There is no modulation saturation or ripple, nor a PV/wind/battery source model.
- Td=delaySamples/fs is the **explicit dq-voltage-command equivalent delay**.
  Nonzero Td uses first-order Padé (1−sTd/2)/(1+sTd/2) as separately labelled
  states. A Padé pole result is approximate and cannot authorize a fully verified
  candidate. There is no exact sampled-data / discrete PI solver in this version.
- Changing Ts alone at Td=0 does not alter continuous-time poles. PWM frequency,
  when available, limits the displayed frequency range to one tenth alongside
  control fs; it is not secretly added as another delay. This display restriction
  is an engineering convention, not an accuracy theorem. Simulation solver step
  is not introduced as a fake physical state.

## Jacobian and outputs

Compute A,B,C,D with central differences at h=2e-6 and h/2. Compare row-normalized
entries, reject discrepancy >1e-5. Export state order, x0, source assumptions,
operating residual, Jacobian refinement error, delay model, gains and settings.

Input columns: selected primary reference (P or Vdc), selected secondary reference
(Q or Vac), grid source phase [rad], grid source amplitude [relative pu], DC input
power [pu]. Output rows: primary physical output, secondary physical output,
id/iq in the controller frame, PLL δ [rad], actual PCC magnitude [pu].

The displayed 2×2 matrix is the **closed** transfer from the two outer references
to the two physical outputs. Off-diagonal responses show coupled effects.
No individual phase margin is assigned to these closed-loop channels.

## Integration policy

Old projects load with this extra check disabled and their eight gains untouched.
Enabling saves only per-inverter `dqAnalysis` options. Automatic candidate construction and performance ranking remain scalar. When enabled,
the assembled candidate pool is screened with the existing coupled dq model before
Pareto selection and final truncation. The coupled solve budget is 64 by default,
within the existing time/evaluation budget; partial searches are not applicable.
Unsupported topology or nonzero delay stops this enabled search before expensive
scalar work. This is dq-constrained scalar search, not MIMO optimization or a
robustness guarantee. Current and selected
candidate/manual draft are evaluated with independent Worker snapshots. On applying
an automatic/manual candidate while enabled, re-evaluate the current full model;
reject unstable/unassessed/nonzero-Padé-only results. Saving an experimental named
candidate remains allowed. Application still revalidates the current model; this is **not global dq-aware PI search**.
PLL option changes invalidate search snapshots. Exports separate current dq settings,
scoped evidence freshness and historical approval; a PLL-only edit does not stale
the independently scoped scalar result, but does stale coupled approval.

Read-only analysis/export/option changes never re-tune or apply PI. Baseline Bode
and time traces remain visible with their original scope; the new matrix and poles
live in a separate panel. GFM gets four scalar current/voltage reference-step graphs,
while its existing Droop/VSG/Synchronverter coupled check remains separate.

## Verification commands and what they mean

    npm test
    npm run build
    npm run audit:static
    node scripts/validate-gfl-dq.mjs
    python scripts/validate-gfl-dq.py
    SITE_DIR=dist node scripts/browser-pll-and-gfm-step.mjs

The new independent Python RHS reimplements the stated nonlinear equations,
uses a five-point Jacobian, SciPy eigenvalues and complex matrix solve, and compares
a tiny nonlinear perturbation over 2ms with exp(A t). The test set includes all four
outer combinations, PLL on/off, independent PLL filtering, Padé delay, bypassed
sensors, changed P/Q/SCR, rigid DC and capacitor mode. This verifies equations and
numerical implementation, not hardware fidelity. The existing GFL/GFM numerical
and browser regressions remain mandatory. Actual run counts/results are recorded
in the PR and artifact, not asserted in advance in this document.
