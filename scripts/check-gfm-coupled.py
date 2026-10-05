"""Independent NumPy verification of browser QR pole calculations."""
import json,sys
import numpy as np
rows=json.load(open(sys.argv[1],encoding='utf-8'))
worst=0
for row in rows:
    reference=list(np.linalg.eigvals(np.array(row['A'],dtype=float)))
    for p in row['poles']:
        z=complex(p['re'],p['im'])
        i=min(range(len(reference)),key=lambda i:abs(reference[i]-z))
        error=abs(reference.pop(i)-z)/max(1,abs(z))
        worst=max(worst,error)
        assert error<2e-6,(row['mode'],row['name'],error)
    assert not reference
    assert row['residual']<1e-7
    if row['name']=='tuned': assert row['alpha']<0
print(f"PASS: {len(rows)} matrices, independent NumPy eigenvalues; worst relative error {worst:.3g}")
