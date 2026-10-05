# V1 verification ledger

- Plan: docs/superpowers/plans/2026-09-27-grid-strength-v1.md
- User approved design and requested inline first-version implementation.
- Ruling: use new repository root instead of an extra grid-strength subfolder; no old repository changes.
- Ruling: retain original terminal-key strings and component x/y/rotation for editing compatibility; electrical SI data remains independent.
- Tests first: 13 analysis cases failed against placeholder; 5 model cases failed; 3 history cases failed. Implemented then 21/21 passed.
- Floating-point unit conversion test changed exact equality to 1e-10 tolerance after measured 100.00000000000001 result.
- Independent review found malformed imported endpoints, stale PCC switching, and view restoration defects.
- Added malformed endpoint/unknown-type regression tests and observed failure before fix; fixed strict port types and own-property catalog lookups.
- Fixed PCC switching through one invalidation path and preserve saved view on import/reopen.
- Final automated suite: `npm test` — 30/30 passing; all JavaScript files pass `node --check`.
- Browser verified: default network returns Zth=0.12+j1.2 ohm and SCR=9.87; P changed 50→30 MW invalidates old result and recalculation retains SCR=9.87; undo restores 50 MW.
- Browser verified: GFL selection/parameter panel; ideal GFM example displays Infinity; copy all 3 components→6 and undo→3; PCC drag updates position and undo restores; zoom 135%→151%.
- Browser verified: add RL, connect both ports in parallel with an existing RL, calculation rejects parallel paths; delete added RL restores 7 components/6 wires and SCR=9.87.
- Browser verified: import examples/standard.json succeeds and preserves its 100% saved zoom. Model roundtrip tests cover electrical data and saved view.
- Browser layout checked at desktop width and narrow preview; narrow view places inspector below canvas.
- Download verification limitation: save action triggers export and shows status, but the built-in browser did not expose a completed download event/path. JSON serialization is unit-tested; actual file download should be checked in a full browser. No claim of a verified on-disk browser download.
- Original repository remains clean at 661856b; new app uses loopback-only port 4188.
- Native browser confirm dialogs were replaced by in-page dialogs after a preview-tool blocking issue; no diagnostic code remains.
- Full interaction parity with every old-editor corner case has not been established; this is the requested first preview, not a completed regression certification of the old monolith.

## 2026-09-28 UI corrections
- GFL/GFM AC waveform now occupies the left AC-port side; DC bars occupy the right DC-port side.
- Palette thumbnails use the same SVG symbols as the canvas.
- All numeric component parameters now appear on canvas at 13 px, weight 700; names remain 13 px, weight 400. RL/RC derived values are included; fit accounts for label height.
- Added glyph direction, parameter completeness, tiny-reactor precision and actual connection-handler AC/DC rejection tests. Full suite: 34/34 passing.
- Browser screenshot inspected: full labels are visible and palette uses symbols; existing standard example retains SCR=9.87.
- PV screenshot example added after user clarification: scale=1, unchanged grid R=2303 ohm / L=41.568 H, separate source R=0.01 ohm, single inverter S=1 MVA.
- Updated parameter assertions failed before correcting the factory; final suite 37/37 passes.
- Browser verified new example loads 9 components / 8 wires at 50 Hz, 1 MVA, SCR displayed 3.65 (full value 3.649940344); parameters and reference discrepancy note visible.
- Versioned changed module imports to invalidate stale browser example code.
- Original screenshot caption 3.56 / 79 degrees is not reproduced by these ideal-transformer inputs; this difference is documented.

## 220 kV bus analysis correction
- Added BUS220 after Grid RL and before T1; default PV example analysis target is BUS220.
- Shared capacity-candidate lookup allows directly connected or ideal-transformer-connected IBRs; series RL boundaries remain excluded.
- Added high-side contribution / capacity / SCR-invariance and input-perturbation regressions, plus unrelated-IBR rejection. Suite: 39/39 passed.
- Browser: loaded 10 components / 9 wires; calculated 315 V then switched to BUS220, observed cleared SCR, pressed Calculate Grid Strength and observed 3.65 at 220 kV / 1 MVA. High-side contributions contain only Source R and Grid RL.
- Removed fixed computed SCR from example note; screenshot caption remains reference-only.

- User simplification: merged Source R into Grid RL (2303.01 ohm, 41.568 H). Browser loaded 9 components / 8 wires and Calculate returned SCR 3.65 at BUS220; only Grid RL appears in contributions. Existing 39 tests pass.

## Automatic analysis, resizable inspector and paper typography
- Electrical inputs and active analysis bus form the automatic-analysis cache key. Repeated identical inputs, component positions / rotation, wire routing and viewport changes reuse the prior result; topology and parameter changes compute immediately on edit commit.
- Error and empty-network states replace old numerical results. Existing analyzer remains the only source of computed values.
- Inspector supports pointer dragging, keyboard adjustment, bounds and local width persistence; narrow layout stacks it below the canvas.
- Times New Roman / Songti typography with native MathML and Cambria Math. Formula uses line-line RMS kV, PCC-referred ohms and rated MVA, plus current numerical substitution.
- Suite: 40/40 passed. Browser changed frequency 50 to 60 Hz: SCR automatically 3.65 to 3.056, revision 1 to 2. Reentering 60 Hz retained revision 2. Restoring 50 Hz produced revision 3.
- Browser component layout movement / undo and inspector resizing retained revision 3. Pointer drag changed inspector width 364 to 444 px; reload restored 444 px.
- Responsive 900 px view inspected; restored normal viewport. No horizontal overflow, no manual Calculate button; computed styles confirm serif and math font families.

## Impedance derivation, three buses, ideal DC and online PI tuning
- RL/RC properties show native MathML impedance formulas with SI substitution and derived X/R.
- PV example now marks 35 kV bus as an analysis PCC alongside 220 kV and 315 V, and connects a zero-resistance 800 V DC source to PV1.DC.
- Browser verified all three analysis options and connected 800 V source; network SCR remains 3.65.
- Added separate gfl.html that reads the project, uses confirmed P/Q + dq architecture, and evaluates analytic tuning formulas locally. No simulation or external runtime dependency.
- Browser verified inherited 1 MVA / 315 V / 63 uH / 1e-6 ohm / 800 V inputs, automatic gain changes, invalid-input result clearing, and settings persistence across reload.
- Core tests check rated dq power-base identity, SI-to-pu conversion, RL and outer-loop cancellation identities, sample-time separation, invalid targets, and DC/bandwidth warnings. Full suite 45/45 passing.
- Optional browser JSON download path was not revalidated; serialization remains simple browser-generated JSON. Public deployment is not performed.

## GFL workbench verification
- Node tests: analytic crossover identities, delay phase, independent d/q response, selected-GFL isolation, connected DC/global frequency changes, zero-gain plots.
- Browser: selected PV1 inspector opens gfl.html?ibr=PV1. Changing rated S from 1 to 2 MVA updates network labels and SCR from 3.65 to 1.825; restored 1 MVA afterward.
- Browser: d-axis Kp slider changed only d/P responses; q/Q remained unchanged. Reload retained manual gain. Retune restored all defaults.
- Visual: checked two-column parameter table, editable SVG controller blocks, typeset equations, and open/closed Bode charts. User-facing project remains local at port 4188.
