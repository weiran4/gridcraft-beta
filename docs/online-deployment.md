# Static deployment

This beta is a browser-only application with no runtime packages, backend, API, database or external CDN.

See [the deployment handoff](../DEPLOYMENT_HANDOFF.md) for the current release, publish directory and complete host checklist.

`npm run build` copies the static allowlist to `dist/`. Node is a development packaging tool only. `npm start` runs a local Python static server on port 4189; it is not a production backend.

All project data remains in browser storage unless the user exports JSON. GFL tuning, PWM FFT and network/resonance calculations execute in the browser. The optional offline PI verification scripts use SciPy solely to cross-check the JavaScript model and are excluded from dist.
