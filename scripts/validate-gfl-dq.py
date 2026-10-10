"""Independent NumPy RHS, five-point Jacobian and SciPy matrix checks.

This validates the implemented/reference equations and numerical plumbing. It is
not an EMT comparison, hardware validation, or IEEE model certification.
"""
import json
from pathlib import Path
import numpy as np
import scipy
from scipy.linalg import eigvals, expm
from scipy.integrate import solve_ivp
root=Path('artifacts/gfl-advisor')
items=json.loads((root/'dq-model-validation-input.json').read_text())
checks=[]
def rhs(item,x,u):
    p,g,m=item['input'],item['gains'],item['model']; op=m['op']; cfg=m['pll']
    ix={k:i for i,k in enumerate(m['names'])}; dx=np.zeros(len(x)); out=lambda name,fallback=0: x[ix[name]] if name in ix else fallback
    def put(name,value):
        if name in ix: dx[ix[name]]=value
    def rot(v,angle):
        cs,sn=np.cos(angle),np.sin(angle)
        return np.array([[cs,sn],[-sn,cs]]) @ v
    Z=p['voltageLL']**2/p['ratedVA']; w=2*np.pi*p['frequencyHz']; lf=p['L']/Z; lg=p['gridXOhm']/(w*Z)
    C=p['gridCapacitanceF']*Z; rf=p['R']/Z; rg=p['gridROhm']/Z; rc=p['gridCapResistanceOhm']/Z
    il=np.array([out('il0'),out('il1')]); ig=np.array([out('ig0'),out('ig1')]); vc=np.array([out('vc0'),out('vc1')]); v=vc+rc*(il-ig)
    delta=out('pllAngle'); ic=rot(il,delta); vg=rot(v,delta)
    hi=np.array([out('hi'+str(k),ic[k]) for k in range(2)]); hv=np.array([out('hv'+str(k),vg[k]) for k in range(2)])
    P=v@ig; Q=v[1]*ig[0]-v[0]*ig[1]; pf=out('pf',P); qf=out('qf',Q); dc=out('dcVoltage',1)
    e=vg[1]/np.linalg.norm(vg); ef=out('pllMeasured',e)
    dw=cfg['kp']*ef+out('pllIntegral') if cfg['pllEnabled'] else 0
    put('pllAngle',dw); put('pllIntegral',cfg['ki']*ef)
    if cfg['pllFilterMs']>0: put('pllMeasured',(e-ef)/(cfg['pllFilterMs']/1000))
    ed=(1+u[0]-out('dcMeasured',dc)) if p['dMode']=='Vdc' else (op['P']+u[0]-pf)
    eq=(op['V']+u[1]-np.linalg.norm(hv)) if p['qMode']=='Vac' else (op['Q']+u[1]-qf)
    omega=w+dw if cfg['decouplingFrequency']=='pll' else w
    uv=np.zeros(2)
    for k,(ki,ko) in enumerate([('d','P'),('q','Q')]):
        err=[ed,eq][k]; sign=-1 if k or p['dMode']=='Vdc' else 1
        ir=op['il'][k]+sign*(g[ko]['kp']*err+out('outer'+str(k)))
        ei=ir-hi[k]; sg=-1 if k==0 else 1
        bias=op['u'][k]-(op['V'] if k==0 else 0)-sg*w*lf*op['il'][1-k]
        uv[k]=hv[k]+sg*omega*lf*hi[1-k]+bias+g[ki]['kp']*ei+out('xi'+str(k))
        put('xi'+str(k),g[ki]['ki']*ei); put('outer'+str(k),g[ko]['ki']*err)
        if p['filterCurrentMs']>0: put('hi'+str(k),(ic[k]-hi[k])/(p['filterCurrentMs']/1000))
        if p['filterVoltageMs']>0: put('hv'+str(k),(vg[k]-hv[k])/(p['filterVoltageMs']/1000))
    cmd=rot(uv,-delta); Td=p['delaySamples']/p['fs']
    applied=2*np.array([out('delay0'),out('delay1')])-cmd if Td>0 else cmd
    eg=rot(op['eg'],-u[2])*(1+u[3]); J=np.array([[0,1],[-1,0]])
    di=(applied-v-rf*il)/lf+w*(J@il); dg=(v-eg-rg*ig)/lg+w*(J@ig); dv=(il-ig)/C+w*(J@vc)
    for k in range(2):
        for name,arr in [('il',di),('ig',dg),('vc',dv)]: put(name+str(k),arr[k])
        if Td>0: put('delay'+str(k),2/Td*(cmd[k]-out('delay'+str(k))))
    if p['filterPqMs']>0: put('pf',(P-pf)/(p['filterPqMs']/1000)); put('qf',(Q-qf)/(p['filterPqMs']/1000))
    if p['filterVdcMs']>0: put('dcMeasured',(dc-out('dcMeasured',dc))/(p['filterVdcMs']/1000))
    if m['dcDynamic']: put('dcVoltage',p['ratedVA']*(op['bridgePower']+u[4]-applied@il)/(p['dcCapacitanceF']*p['dcVoltage']**2*dc))
    y=np.array([dc if p['dMode']=='Vdc' else P,np.linalg.norm(v) if p['qMode']=='Vac' else Q,ic[0],ic[1],delta,np.linalg.norm(v)])
    return dx,y
for item in items:
    try:
        m=item['model']; x=np.array(m['x0']); u=np.zeros(5); n=len(x)
        f0,y0=rhs(item,x,u); residual=float(np.max(np.abs(f0))); assert residual<1e-7, residual
        M=np.empty((n+6,n+5))
        for j in range(n+5):
            h=1e-5*max(1,abs(x[j]) if j<n else 1)
            vals=[]
            for sign in [2,1,-1,-2]:
                xp=x.copy(); up=u.copy()
                if j<n: xp[j]+=sign*h
                else: up[j-n]+=sign*h
                f,y=rhs(item,xp,up); vals.append(np.r_[f,y])
            M[:,j]=(-vals[0]+8*vals[1]-8*vals[2]+vals[3])/(12*h)
        A=M[:n,:n]; B=M[:n,n:]; C=M[n:,:n]; D=M[n:,n:]
        supplied=np.block([[np.array(m['A']),np.array(m['B'])],[np.array(m['C']),np.array(m['D'])]])
        jacerr=float(np.max(np.abs(supplied-M)/np.maximum(1,np.max(np.abs(M),axis=1)[:,None])))
        assert jacerr<1e-6,jacerr
        eig=eigvals(A); alpha=float(np.max(eig.real)); eigenerr=abs(alpha-item['alpha'])/max(1,abs(alpha)); assert eigenerr<2e-5,eigenerr
        freqerr=0
        for f in item['frequencies']:
            H=C@np.linalg.solve(2j*np.pi*f['hz']*np.eye(n)-A,B)+D
            ref=np.array([[z['re']+1j*z['im'] for z in row] for row in f['H']])
            freqerr=max(freqerr,float(np.max(np.abs(ref-H)/np.maximum(1,np.abs(H)))))
        assert freqerr<2e-5,freqerr
        # Check actual nonlinear dynamics versus the Jacobian prediction for a
        # tiny perturbation over 2ms; not a substitute for a switched-model test.
        dx=np.array(item['perturbation']['dx']); t=.002
        sol=solve_ivp(lambda tt,xx:rhs(item,xx,u)[0],(0,t),x+dx,method='DOP853',rtol=2e-11,atol=2e-13)
        assert sol.success,sol.message
        lin=expm(A*t)@dx; nonlinear=sol.y[:,-1]-x
        localerr=float(np.max(np.abs(lin-nonlinear))/max(1e-8,np.max(np.abs(lin))))
        assert localerr<.003,localerr
        checks.append(dict(name=item['name'],passed=True,residual=residual,jacobianError=jacerr,eigenError=eigenerr,frequencyError=freqerr,localLinearizationError=localerr,alpha=alpha))
    except Exception as e: checks.append(dict(name=item['name'],passed=False,error=str(e)))
report=dict(scipy=scipy.__version__,numpy=np.__version__,passed=sum(c['passed'] for c in checks),failed=sum(not c['passed'] for c in checks),checks=checks)
(root/'dq-model-verification.json').write_text(json.dumps(report,indent=2)); print(json.dumps(report,indent=2))
if report['failed']: raise SystemExit(1)
