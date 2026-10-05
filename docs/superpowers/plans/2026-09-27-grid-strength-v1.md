# Grid Strength V1 Implementation Plan

Goal: ship an independently runnable SVG network editor with verified radial SCR analysis.
Architecture: adapt Branch Builder interaction code; independent SI model and pure electrical analysis; no original runtime dependency.
Tech Stack: browser ES modules, SVG, Node built-in test runner, Python static server.
Spec: ../specs/2026-09-27-grid-strength-v1-design.md
Execution: inline, user explicitly requested a working first version.

## Global constraints
- Work only in E:/gfl_gfm_tuner; original repository stays unchanged.
- Eight component types; RC excluded and disclosed; inverter filter excluded from upstream impedance.
- SI internally; three-phase line-line bases; no EMT or PI tuning in V1.

## Review focus
- Imported malformed files must not replace current work (Task 1/3).
- Bus identity and primary IBR references survive copy and undo (Task 3).
- Reverse and successive transformer referrals (Task 2).
- Invalid numbers, numerical overflow, zero impedance (Task 2).
- Stale analysis after topology/parameter mutation (Task 3).

## Task 1 — Schema, units, connectivity and project files
Files: components/catalog.js, core/network/graph.js, project/model.js, core/electrical/units.js, tests/model.test.js.
Interfaces: createComponent(type,id,x,y), validateProject(project), buildGraph(project), serialize/parseProject.
- [x] Write roundtrip, malformed input, SI conversion and disconnected node tests; run node --test and observe failures.
- [x] Implement typed ports, parameter schema, independent format/version and atomic parse validation.
- [x] Adapt original netGroups union-find and stable component/terminal identity.
- [x] Run model suite and commit.

## Task 2 — Electrical analysis
Files: analysis/grid-strength.js, core/electrical/impedance.js, tests/analysis.test.js.
Interface: analyzeGridStrength(project,pccId) returns structured errors, referred impedance, SCR, contributions and path IDs.
- [x] Write six required cases with fixed numerical expectations plus reverse ratio, RC exclusion, meshed/multi-source, validation and zero R tests.
- [x] Run failures; implement unique radial path analysis, voltage propagation, SI bases and guarded infinity.
- [x] Run complete suite and commit.

## Task 3 — Editor and integrated application
Files: index.html, ui/editor.js, ui/app.js, ui/style.css, examples/demo.js, tests/editor.test.js.
Interfaces: Editor(project,onChange,onSelect), setProject, select, zoom, undo/redo; app owns property and analysis panels.
- [x] Test copied-ID/wire remapping, history restoring SI data and stable PCC references before adaptation.
- [x] Migrate connectTerminals, union-find, snapshot history, copy/paste, SVG wire routing and pointer interactions from source with provenance.
- [x] Add eight symbols, typed ports, drag/drop, selection, wire handles, marquee, move, pan, zoom, keyboard operations.
- [x] Add unit-aware parameter forms, PCC selector, RC disclosure, result invalidation, contribution focus, save/import and example selection.
- [x] Run tests and browser exercises covering user workflows.

## Task 4 — Delivery
Files: README.md, start.bat, docs/PROVENANCE.md, docs/verification.md.
- [x] Run whole suite and syntax checks; review implementation and fix material defects.
- [x] Verify old repo clean; start loopback-only independent server; open working app.
- [x] Record test results and known scope; commit deliverable.

Preview validation results and remaining verification limits: ../../verification.md.
