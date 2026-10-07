"""Independent SciPy verification only; never shipped as a browser dependency."""
import json
from pathlib import Path
import numpy as np
import scipy
from scipy import signal
root = Path(__file__).resolve().parent.parent
out = root / 'artifacts/gfl-advisor'
items = json.loads((out / 'numeric-input.json').read_text())
report = []
for item in items:
    m, r = item['model'], item['result']
    num, den = np.trim_zeros(m['numerator'][::-1], 'f'), np.trim_zeros(m['denominator'][::-1], 'f')
    assert r['status'] == 'ok', (item['name'], item['loop'], r)
    assert max(np.roots(den).real) < 0
    gain = m['numerator'][0] / m['denominator'][0]
    t = np.linspace(0, r['windowSeconds'], 40001)
    _, y = signal.step(signal.TransferFunction(num, den), T=t)
    y = y / gain
    outside = np.flatnonzero(abs(y-1) > .02)
    ts = float(t[outside[-1]+1]) if len(outside) and outside[-1]+1 < len(t) else 0
    os = float(max(0, y.max()-1)*100)
    assert abs(ts-r['settlingTimeSeconds']) < max(.002, .01*ts), (item['loop'], ts, r['settlingTimeSeconds'])
    assert abs(os-r['overshootPercent']) < .2, (item['loop'], os, r['overshootPercent'])
    report.append(dict(name=item['name'], loop=item['loop'], settlingSeconds=ts, overshootPercent=os, settlingError=abs(ts-r['settlingTimeSeconds']), overshootError=abs(os-r['overshootPercent'])))
result = dict(scipy=scipy.__version__, numpy=np.__version__, passed=len(report), failed=0, results=report)
(out / 'numeric-verification.json').write_text(json.dumps(result, indent=2))
print(json.dumps(result, indent=2))
