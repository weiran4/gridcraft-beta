"""Independent offline state-space verification; not required by the browser."""
import json
from pathlib import Path
import numpy as np
root=Path(__file__).resolve().parent.parent
data=json.loads((root/'docs/validation/gfm-model-data.json').read_text())
results=[]
for case in data['cases']:
 p=case['input'];g=case['gains'];Z=p['voltageLL']**2/p['ratedVA']
 for k in ['d','q','P','Q']:
  voltage=k in ['P','Q'];i=('d' if k=='P' else 'q') if voltage else k
  n=7 if voltage else 6
  def derivative(x,ref):
   il,ig,vc,hi,hv,xi=x[:6]
   v=vc+p['Rc']/Z*(il-ig)
   ir=g[k]['kp']*(ref-hv)+x[6]+p['feedforwardCurrent']*ig if voltage else ref
   u=g[i]['kp']*(ir-hi)+xi+p['feedforwardVoltage']*hv
   dx=[(u-v-p['R']/Z*il)/(p['L']/Z),(v-p['gridR']/Z*ig)/(p['gridL']/Z),(il-ig)/(p['C']*Z),(il-hi)/(p['filterCurrentMs']/1000),(v-hv)/(p['filterVoltageMs']/1000),g[i]['ki']*(ir-hi)]
   if voltage:dx.append(g[k]['ki']*(ref-hv))
   return np.array(dx)
  A=np.column_stack([derivative(x,0) for x in np.eye(n)]);B=derivative(np.zeros(n),1)
  Y=np.zeros(n)
  if voltage:Y[0]=p['Rc']/Z;Y[1]=-p['Rc']/Z;Y[2]=1
  else:Y[0]=1
  poles=np.linalg.eigvals(A);roots=np.roots(case['polynomials'][k][::-1])
  for pole in poles:assert min(abs(roots-pole))<1e-4*max(1,abs(pole)),(case['name'],k,'pole mismatch')
  max_error=0
  for r in case['responses']:
   z=Y@np.linalg.solve(2j*np.pi*r['hz']*np.eye(n)-A,B)
   q=r['closed'][k];expected=q['re']+1j*q['im']
   error=abs(z-expected)/max(1e-8,abs(expected));max_error=max(error,max_error)
   assert error<1e-7,(case['name'],k,r['hz'],error)
  if case['name']=='default':assert max(poles.real)<0
  results.append({'case':case['name'],'loop':k,'maxPoleReal':float(max(poles.real)),'maxRelativeResponseError':float(max_error)})
(root/'docs/validation/gfm-state-verification.json').write_text(json.dumps(results,indent=2)+'\n')
print(json.dumps(results,indent=2))
