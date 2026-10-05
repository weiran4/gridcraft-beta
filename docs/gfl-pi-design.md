# Browser-only GFL PI tuning
User confirmed P/Q outer loops plus dq current loops, perfect PLL, rated per-unit control, and no simulation. This is an independent static page, gfl.html. No software installation, backend computation, external runtime fonts, simulator, MATLAB or Simulink is needed. Only optional JSON backup/export involves a download.

## Definitions and analytic method
Amplitude-invariant Park transform and generator-direction currents. Vb=sqrt(2/3)*VLL, Ib=sqrt(2)*S/(sqrt(3)*VLL), Zb=VLL²/S, Lb=Zb/omega_b. Therefore 1.5 Vb Ib=S, Ppu=vdpu idpu+vqpu iqpu, Qpu=vqpu idpu-vdpu iqpu. Rated ideal PCC has vdpu=1, vqpu=0. Outer Q PI output has a separate minus sign before iq reference.

The plant after measured PCC-voltage feedforward and dq decoupling is Zb/(Lf*s+Rf), with voltage-pu input and current-pu output. The PI is parallel Kp+Ki/s, s in inverse seconds. Choose Kpi=Lf*omega_i/Zb, Kii=Rf*omega_i/Zb, yielding Ti=omega_i/(s+omega_i) under exact cancellation. For outer P/Q loops at rated stiff PCC, choose Kpp=omega_p/omega_i, Kip=omega_p: the loop is omega_p/s, so the closed-loop target is omega_p/(s+omega_p). No P/Q feedforward is added. This is our explicit derivation; do not attribute these exact outer gains to motulator or Simplus.

Discrete preview is forward rectangular integration x[k+1]=x[k]+Ki*Ts*e[k], u[k]=Kp*e[k]+x[k]; KiTs is separately displayed. No discrete or time-domain simulation is run. Sampling defaults 10kHz, current bandwidth 500Hz, power bandwidth 50Hz, and 1.5 samples delay are editable assumptions, not screenshot inputs. A pure-delay approximate current-loop margin is 90deg-360deg*fi*Td. SVPWM voltage ceiling is Vdc/sqrt(3); this ignores filter drops and dynamic headroom.

## Limits
Only Rf/Lf are used for inner-loop tuning. Network grid RL is not silently substituted. No RC resonance, grid impedance interaction, PLL dynamics, modulation dynamics, saturation or anti-windup behavior is computed. The page supplies analytic starting gains, not stability certification. Tiny Rf produces small Ki and is explicitly flagged. DC source must be connected to the selected GFL; nonzero Rdc gets a rigid-DC approximation notice.

## References inspected 2026-09-28
- https://github.com/Aalto-Electric-Drives/motulator and https://aalto-electric-drives.github.io/motulator/control/grid/current_ctrl.html : 2DOF control and modeling references, not the same PI implementation.
- https://github.com/Future-Power-Networks/Simplus-Grid-Tool/blob/master/%2BSimplusGT/%2BClass/GridFollowingVSI.m : GFL state-space model and an alternative second-order gain selection.
- https://github.com/hamzaali412/Tutorial-Gird-following-Inverter : P/Q and current-loop architecture; no source copied.
- https://docs.simplefoc.com/tuning_current_loop : primary project documentation of RL current PI Kp=L*omega and Ki=R*omega. Our per-unit conversion and outer-loop cancellation are derived above.

No third-party source was copied or installed. See online-deployment.md for static hosting details. The prototype remains local until a deployment destination is selected.

## Interactive workbench (2026-09-28)
The network toolbar no longer has a global design action. Select a GFL and use its inspector button; gfl.html requires the explicit ibr component ID. Ratings, operating P/Q, Rf/Lf, connected DC values, and global frequency are editable in the left table. Derived bases show native MathML definitions in gray. Changes save to the same project. AC rating edits do not silently alter transformers or other inverters; network voltage consistency checks still apply.

The SVG control diagram contains four independent PI input pairs and sliders. Gains/settings persist under extensions.gflPi[componentId]. Manual gains survive electrical parameter changes; the explicit retune button restores analytical bandwidth gains. Browser storage events refresh an already-open design page after an external project change.

Bode plots evaluate complex transfer functions directly, with continuous parallel PI and exact pure delay exp(-s*delaySamples/fs). Inner open loops are C_d/q*Zb/(R+sL)*delay; outer loops are C_P/Q times the respective inner closed loop. Q polarity is already handled by the separate minus sign and Q=-iq at the rated point. Open/closed curves, all unity crossings within the sampled band and corresponding phase margins respond to actual manual gains. Curves stop at fs/2; they are not an exact digital-control model or full-network stability assessment. No time integration or simulator runs.


## Measurement filters (2026-10-03)

The editable per-inverter filter settings are stored with `extensions.gflPi[id]` and included in the v3 PI export. Keys use milliseconds: `filterPqMs=10`, `filterVdcMs=10`, `filterVoltageMs=10`, `filterCurrentMs=1`. Each group is a unity-gain first-order low-pass H=1/(1+sT); zero bypasses the filter. Missing settings use these defaults, and invalid or negative values are rejected. The UI displays seconds and fc=1/(2πT) alongside the editable ms inputs.

The four groups apply to P/Q measurements, DC voltage, AC dq/voltage magnitude, and dq current respectively. The present P/Q controller does not activate a Vdc loop; its Vdc filter is configured but inactive. AC voltage filtering belongs to feedforward and does not change the reference-tracking response under the fixed-PCC assumption. The diagram and equations show filtered-current decoupling, but the SISO frequency model still assumes ideal decoupling and does not model its residual dq coupling.

For current loops, A=C*G*delay, return ratio L=A*Hi, and actual-current tracking T=A/(1+L). Outer power return ratio is Lp=Cp*T*Hpq, while actual-power tracking is Tp=Cp*T/(1+Lp). A sensor factor must not be inserted in the numerator of the actual-output tracking transfer function. The zero-filter case recovers the previous ideal identities. Current and power sensor poles are included in the Bode plots and phase margins; margins below 45 degrees are highlighted. Existing analytic PI recommendations remain unfiltered-model starting values, not a promise of the specified bandwidth with filtering. Stored manual gains are preserved.

This section supersedes the earlier no-measurement-filter frequency-response descriptions above. No RC/PLL/grid dynamics or time-domain simulation were added.


## Control execution step (2026-10-03)

The PI page edits control execution period Ts in microseconds instead of frequency. Existing fs settings remain the single stored source of truth for compatibility: Ts_us=1e6/fs; input edits write fs=1e6/Ts_us. The page shows the derived Hz and physical delay Td=N*Ts. Export also includes derived controlStepSeconds. Ts equals the simulation step only when this control module executes at every such step; it is not the PWM switching period. Continuous PI gains, Ki*Ts, frequency plot ceiling and delay calculations use the same stored frequency.

## Selectable P/Vdc and Q/Vac outer loops (2026-10-04)

The d channel independently selects P or Vdc; the q channel selects Q or Vac. Missing mode settings retain P/Q. UI labels, measurement paths, controller polarity, starting gains, equations and response plots follow the selected modes. Manual gains are saved separately for each mode combination. Export v4 includes modes, resolved capacitance and grid impedance, model gains/signs, and limitations.

With generator-direction current and rated vd=1, P=id and Q=-iq. Controller output polarity is positive for P and negative for Vdc, Q and Vac; PI coefficients remain nonnegative. The signed outer plant and controller polarity cancel in the return-ratio calculation.

Vdc: Cbus*Vdc*dVdc/dt=Pdc-Pac. Around the nominal connected DC voltage V0, assuming constant DC input power, delta(Vdc/V0)/delta(id,pu)=-Kdc/s, where Kdc=Sb/(Cbus*V0^2). With ideal fast current tracking, choose Kp=2*zeta*omega_o/Kdc, Ki=omega_o^2/Kdc, zeta=1/sqrt(2). Here fo is natural frequency, not an achieved crossover. The page uses the applied total equivalent bus capacitance or an explicit independent analysis capacitance in microfarads. No default capacitance is invented. This is an analysis model with capacitor dynamics, not the topology's ideal voltage source clamping the bus; DC source resistance/input dynamics are not modeled.

Vac: use the selected inverter's exact AC-node bus and refer upstream Thevenin impedance to that bus without changing project PCC selection. With other-channel perturbation held fixed and near the rated-voltage point, delta(Vac,pu) approximately equals -Kvac*delta(iq,pu), Kvac=Xth/Zb. Initial Kp=omega_o/(omega_i*Kvac), Ki=omega_o/Kvac. This scalar low-frequency sensitivity omits network dynamics, resistance-induced channel coupling, PLL and RC resonance. It is not a full SCR-dependent stability assessment; zero/negative or unavailable Xth is rejected.

For either selected outer loop, let Go be the polarity-compensated plant (1 for P/Q, Kdc/s for Vdc, Kvac for Vac). With actual-current tracking Ti, L=C*Ti*Go*Hselected and Tout=C*Ti*Go/(1+L). The Vdc filter is now active in Vdc mode; the AC voltage filter is active in Vac feedback as well as voltage feedforward. These statements supersede earlier P/Q-only and inactive-Vdc descriptions. At the starting frequency, Vdc open-loop phase is anchored to its low-frequency integral branch so a negative phase margin cannot appear as a positive value near 360 degrees.

Validation: independent complex-response checks for all four mode combinations and feedback poles; missing capacitance/grid authority rejection; network-derived X follows electrical changes without mutating topology; regression for Vdc negative phase margin. Browser verification covers mode switching, missing-C feedback, C-dependent gain scaling, and manual-gain persistence across mode changes and reload.

## User-facing integral time (2026-10-04)

All four PI editors, sliders and the result table use Kp and Ti in seconds, with the explicit parallel-branch form C(s)=Kp+1/(Ti*s). This is not Kp*(1+1/(Ti*s)): changing Kp does not scale the integral branch. The frequency engine and stored project gain banks retain Ki internally for backwards compatibility; UI edits convert Ki=1/Ti, and existing stored Ki displays as Ti=1/Ki without changing the controller. Example Ti=0.01 s gives Ki=100, Ti=0.02 s gives Ki=50 independently of Kp.

Initial tuning equations are shown in reciprocal Ti form. Ti=0, negative or malformed entries are rejected and do not save; legacy Ki=0 displays infinity, also accepted explicitly to turn off integration. Export v5 exposes mode-named parameters {kp, tiSeconds, integralEnabled} and an explicit PI form and unit. tiSeconds=null with integralEnabled=false represents disabled integration. The displayed Ts/Ti is a dimensionless per-step coefficient; the Bode analysis remains continuous time.


## Filter-aware automatic tuning (2026-10-04)

This replaces the earlier unfiltered automatic recommendations, including the old Vdc natural-frequency formula. New PI pages default to a 50 microsecond control step and zero equivalent delay; existing saved settings remain intact until edited. Targets fi/fo are now requested open-loop crossover upper bounds. The current page was explicitly updated to 50 microseconds and zero delay.

The new `analysis/gfl-autotune.js` evaluates the same loop model as the frequency plot. Current feedback uses its current measurement pole. Vdc uses the capacitor integrator, actual d-current closed-loop tracking and Vdc sensor pole. Vac uses Xth/Zb, actual q-current tracking and AC-voltage sensor pole. P/Q use their power sensor pole. Sensor times remain editable, with defaults 10 ms for power/DC/AC voltage and 1 ms for current.

The declared tuning policy targets at least 60 degrees of phase margin. Set the PI zero to r times crossover, with r=0.2 for current/Vdc and r=5 for P/Q/Vac. For the loop without its PI, A(jw), choose Kp=1/(abs(A)*sqrt(1+r^2)), Ki=Kp*r*w and export Ti=1/Ki. Search upward to the first phase-margin boundary below the requested cap; the outer cap is additionally one fifth of achieved inner crossover. This is one conservative fixed-zero policy, not an optimal-controller claim. No cancellation of the tiny R/L pole is required.

A frequency sweep checks for extra unity crossings and inadequate margins. With zero delay, ascending closed-loop characteristic polynomials are checked using Routh-Hurwitz, including the feedback filters and inner tracking numerator. With nonzero pure delay, the polynomial certificate is unavailable; the page reports frequency-response checks only. Neither result certifies PLL, RC-network, residual dq coupling, digital implementation or saturation dynamics. Manual gains retain their values and get a separate current-gain stability check; automatic suggestions are explicitly distinguished.

For the current PV case (1 MVA, 315 V, Rf=1 micro-ohm, Lf=63 microhenry, Vdc=800 V, Cbus=0.064 F, Xth=0.036694742 ohm), new Kp/Ti values are d=q: 0.222377915 / 0.066454514 s; Vdc: 1.444824976 / 0.097700582 s; Vac: 0.575861199 / 0.005132492 s. Achieved crossovers are 53.848548, 5.637386 and 10.769710 Hz, respectively; margins are 60, 60 and 65.359772 degrees. An independent NumPy root calculation found every closed-loop pole strictly in the left half-plane. The earlier unfiltered Vdc recommendation has a positive-real pole pair even at zero delay, so delay removal alone did not address the problem.

Export v6 provides Kp/Ti plus the auto-tuning policy, requested/achieved frequencies and actual zero-delay stability results. Legacy internal Ki storage remains unchanged. Regression tests cover sensor dependence, all four mode combinations, zero R, bypassed sensors, step versus delay, invalid inputs and the old unstable Vdc case.
