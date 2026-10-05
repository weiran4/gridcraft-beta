# Optional SCR analysis implementation plan

Goal: opt-in SCR/electrical-network effects on both PI pages, persistent per inverter, then push the verified beta repository.

Architecture: considerScr defaults false. GFL checked uses the scalar RC/grid network with filtered PCC voltage feedforward; P/Q/Vac sensing follows grid current, Vdc retains converter-current energy approximation. No PLL or cross-axis stability claim. Vac requires opt-in. GFM unchecked uses local RC with fixed external load-current perturbation (no grid feedback), checked retains existing coupled model. Display/export scope must follow the switch.

Tech stack: existing browser ES modules, Node tests, static distribution.

- [x] Add failing opt-in/off sensitivity and persistence tests.
- [x] Implement scalar network transfer/characteristic polynomials and local GFM mode; retain checked GFM dq analysis.
- [x] Add checkboxes and model notes to both pages, persistence and exports, cache versions.
- [x] Check numerical consistency, UI toggling/refresh, full tests, static build, code review.
- [x] Synchronize local development tree, commit and push beta.

Verification: 172 Node tests passed; browser checks covered toggling, saved reload, manual-gain retention and Vac opt-in requirement; static audit passed (71 files, 164 relative references). Code review found and resolved ideal-grid SCR Infinity formatting.
