"""Independent SciPy verification only; never shipped as a browser dependency."""
import json
from pathlib import Path
import numpy as np
import scipy
from scipy import signal, linalg
root = Path(__file__).resolve().parent.parent
out = root / 'artifacts/gfl-advisor'
data = json.loads((out / 'gfm-numeric-input.json').read_text())
items = data['items']
report = []
for item in items:
    m, r = item['model'], item['result']
    num, den = np.trim_zeros(m['numerator'][::-1], 'f'), np.trim_zeros(m['denominator'][::-1], 'f')
    assert r['status'] == 'ok', (item['name'], item['loop'], r)
    assert max(np.roots(den).real) < 0
    gain = m['numerator'][0] / m['denominator'][0]
    # A single 40k-point grid cannot resolve a millisecond transient when an
    # almost-cancelled stable pole produces a many-hour observation window.
    # Independently propagate balanced SciPy state space on expanding uniform
    # segments (400 intervals/segment, versus 96 in the browser solver).
    A, B, C, D = signal.tf2ss(num, den)
    A, transform = linalg.matrix_balance(A)
    B, C = linalg.solve(transform, B), C @ transform
    state = np.zeros(A.shape[0])
    fast = max(abs(np.roots(den)))
    start, end = 0.0, min(r['windowSeconds'], 1.0/fast)
    times, outputs = [], []
    while start < r['windowSeconds']:
        local = np.linspace(0, end-start, 401)
        _, yy, xx = signal.lsim((A, B, C, D), U=np.ones_like(local), T=local, X0=state)
        times.extend((start+local)[1:].tolist())
        outputs.extend(np.asarray(yy)[1:].tolist())
        state = np.asarray(xx[-1]).reshape(-1)
        start, end = end, min(r['windowSeconds'], 2*end)
    t, y = np.asarray(times), np.asarray(outputs)/gain
    outside = np.flatnonzero(abs(y-1) > .02)
    ts = float(t[outside[-1]+1]) if len(outside) and outside[-1]+1 < len(t) else 0
    os = float(max(0, y.max()-1)*100)
    assert abs(ts-r['settlingTimeSeconds']) < max(.002, .01*ts), (item['loop'], ts, r['settlingTimeSeconds'])
    assert abs(os-r['overshootPercent']) < .2, (item['loop'], os, r['overshootPercent'])
    report.append(dict(name=item['name'], loop=item['loop'], settlingSeconds=ts, overshootPercent=os, settlingError=abs(ts-r['settlingTimeSeconds']), overshootError=abs(os-r['overshootPercent'])))
coupled_checks = []
for item in data['coupled']:
    alpha = float(max(np.linalg.eigvals(np.asarray(item['A'], dtype=float)).real))
    assert abs(alpha-item['alpha']) < max(1e-5, abs(alpha)*1e-5), (item['name'], item['mode'], alpha, item['alpha'])
    assert (alpha < -1e-6) == item['stable']
    coupled_checks.append(dict(name=item['name'], mode=item['mode'], alpha=alpha, error=abs(alpha-item['alpha'])))
result = dict(coupled=coupled_checks, scipy=scipy.__version__, numpy=np.__version__, passed=len(report), failed=0, results=report)
(out / 'gfm-numeric-verification.json').write_text(json.dumps(result, indent=2))
print(json.dumps(result, indent=2))
