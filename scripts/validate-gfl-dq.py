"""Independent physical-input equilibrium, nonlinear RHS and SciPy checks.

Neither the exported operating point, PLL coefficients, x0 nor the JavaScript
RHS is used as reference truth. Matrix/pole/response arrays are test subjects.
These inherited tolerances check implementation, not physical model validity.
"""
import os
os.environ.setdefault('OPENBLAS_NUM_THREADS', '1')
os.environ.setdefault('OMP_NUM_THREADS', '1')
import json
import platform
from pathlib import Path
import numpy as np
import scipy
from scipy.linalg import eigvals, expm
from scipy.integrate import solve_ivp
from scipy.optimize import linear_sum_assignment

ROOT = Path(__file__).resolve().parent.parent / 'artifacts/gfl-advisor'
CRITERIA = dict(operatingPointResidual=1e-7, independentJacobian=1e-6,
                fullPoleNormalizedError=2e-5, frequencyNormalizedError=2e-5,
                perturbationAmplitude=1e-6, perturbationHorizonSeconds=.002,
                nonlinearLocalError=.003)


def operating_point(p):
    """Solve the voltage-squared polynomial, then use complex KVL/admittance."""
    zbase = p['voltageLL']**2 / p['ratedVA']
    w = 2*np.pi*p['frequencyHz']
    power = complex(p['activePowerW'], p['reactivePowerVar']) / p['ratedVA']
    zg = complex(p['gridROhm'], p['gridXOhm']) / zbase
    source = p.get('gridVoltagePu', 1)
    roots = np.roots([1, -(source**2 + 2*(zg*np.conj(power)).real), abs(zg*power)**2])
    assert np.max(np.abs(roots.imag)) < 1e-12 and min(roots.real) >= 0
    v = float(np.sqrt(max(roots.real)))
    ig = np.conj(power/v)
    shunt = p['gridCapResistanceOhm']/zbase + 1/(1j*w*p['gridCapacitanceF']*zbase)
    ic = v/shunt
    il = ig + ic
    vc = v - p['gridCapResistanceOhm']/zbase*ic
    eg = v - zg*ig
    bridge = v + complex(p['R']/zbase, w*p['L']/zbase)*il
    vector = lambda z: np.array([z.real, z.imag])
    losses = p['R']/zbase*abs(il)**2 + p['gridCapResistanceOhm']/zbase*abs(ic)**2
    op = dict(Z=zbase, w=w, P=power.real, Q=power.imag, E=source, V=v,
              il=vector(il), ig=vector(ig), ic=vector(ic), vc=vector(vc),
              eg=vector(eg), u=vector(bridge), bridgePower=float((bridge*np.conj(il)).real), losses=losses,
              gridVoltageLL=v*p['voltageLL'], bridgeCurrentPu=abs(il),
              modulation=2*np.sqrt(2/3)*p['voltageLL']*abs(bridge)/p['dcVoltage'])
    balances = dict(gridKvl=abs(v-eg-zg*ig), bridgeKvl=abs(bridge-v-complex(p['R']/zbase,w*p['L']/zbase)*il),
                    shuntKvl=abs(v-shunt*ic), kcl=abs(il-ig-ic),
                    sourceMagnitude=abs(abs(eg)-source),
                    dcPowerBalance=abs(op['bridgePower']-power.real-losses))
    return op, {k: float(v) for k, v in balances.items()}


def reference(item):
    p, g, options = item['input'], item['gains'], item['options']
    op, balances = operating_point(p)
    cfg = dict(options, kp=2*options['damping']*2*np.pi*options['frequencyHz'], ki=(2*np.pi*options['frequencyHz'])**2)
    dynamic = options['dcModel']=='capacitor' or (options['dcModel']=='auto' and p['dMode']=='Vdc')
    frozen = item['experimentId']=='current-reference-frozen-outer'
    values = {}
    for key in ['il', 'ig', 'vc']:
        values.update({key+str(k): v for k, v in enumerate(op[key])})
    if p['filterCurrentMs']>0: values.update({f'hi{k}': v for k, v in enumerate(op['il'])})
    if p['filterVoltageMs']>0: values.update(hv0=op['V'], hv1=0)
    if p['filterPqMs']>0:
        if p['dMode']=='P': values['pf']=op['P']
        if p['qMode']=='Q': values['qf']=op['Q']
    if dynamic:
        values['dcVoltage']=1
        if p['dMode']=='Vdc' and p['filterVdcMs']>0: values['dcMeasured']=1
    for loop, state in [('d','xi0'), ('q','xi1')]:
        if g[loop]['ki']>0: values[state]=0
    if not frozen:
        for loop, state in [('P','outer0'), ('Q','outer1')]:
            if g[loop]['ki']>0: values[state]=0
    if cfg['pllEnabled']:
        values.update(pllAngle=0, pllIntegral=0)
        if cfg['pllFilterMs']>0: values['pllMeasured']=0
    if p['delaySamples']>0: values.update({f'delay{k}': v for k, v in enumerate(op['u'])})
    return dict(op=op, balances=balances, pll=cfg, dcDynamic=dynamic, frozen=frozen,
                names=list(values), x0=np.array(list(values.values()), dtype=float))


def rhs(item, ref, x, u):
    p,g,op,cfg=item['input'],item['gains'],ref['op'],ref['pll']
    ix={k:i for i,k in enumerate(ref['names'])}; dx=np.zeros(len(x)); out=lambda name,fallback=0: x[ix[name]] if name in ix else fallback
    def put(name,value):
        if name in ix: dx[ix[name]]=value
    def rot(v,angle):
        cs,sn=np.cos(angle),np.sin(angle)
        return np.array([[cs,sn],[-sn,cs]]) @ v
    Z=p['voltageLL']**2/p['ratedVA']; w=2*np.pi*p['frequencyHz']; lf=p['L']/Z; lg=p['gridXOhm']/(w*Z)
    cap=p['gridCapacitanceF']*Z; rf=p['R']/Z; rg=p['gridROhm']/Z; rc=p['gridCapResistanceOhm']/Z
    il=np.array([out('il0'),out('il1')]); ig=np.array([out('ig0'),out('ig1')]); vc=np.array([out('vc0'),out('vc1')]); v=vc+rc*(il-ig)
    delta=out('pllAngle'); ic=rot(il,delta); vg=rot(v,delta)
    hi=np.array([out('hi'+str(k),ic[k]) for k in range(2)]); hv=np.array([out('hv'+str(k),vg[k]) for k in range(2)])
    P=v@ig; Q=v[1]*ig[0]-v[0]*ig[1]; pf=out('pf',P); qf=out('qf',Q); dc=out('dcVoltage',1)
    e=vg[1]/max(1e-9,np.linalg.norm(vg)); ef=out('pllMeasured',e)
    dw=cfg['kp']*ef+out('pllIntegral') if cfg['pllEnabled'] else 0
    put('pllAngle',dw); put('pllIntegral',cfg['ki']*ef)
    if cfg['pllFilterMs']>0: put('pllMeasured',(e-ef)/(cfg['pllFilterMs']/1000))
    ed=(1+u[0]-out('dcMeasured',dc)) if p['dMode']=='Vdc' else (op['P']+u[0]-pf)
    eq=(op['V']+u[1]-np.linalg.norm(hv)) if p['qMode']=='Vac' else (op['Q']+u[1]-qf)
    omega=w+dw if cfg['decouplingFrequency']=='pll' else w
    uv=np.zeros(2)
    for k,(ki,ko) in enumerate([('d','P'),('q','Q')]):
        err=[ed,eq][k]; sign=-1 if k or p['dMode']=='Vdc' else 1
        # Freeze the outer controller OUTPUT INCREMENT, retaining the operating
        # current bias, frame rotations, PLL, sensors, plant and DC dynamics.
        ir=op['il'][k]+u[k] if ref['frozen'] else op['il'][k]+sign*(g[ko]['kp']*err+out('outer'+str(k)))
        ei=ir-hi[k]; sg=-1 if k==0 else 1
        bias=op['u'][k]-(op['V'] if k==0 else 0)-sg*w*lf*op['il'][1-k]
        uv[k]=hv[k]+sg*omega*lf*hi[1-k]+bias+g[ki]['kp']*ei+out('xi'+str(k))
        put('xi'+str(k),g[ki]['ki']*ei)
        if not ref['frozen']: put('outer'+str(k),g[ko]['ki']*err)
        if p['filterCurrentMs']>0: put('hi'+str(k),(ic[k]-hi[k])/(p['filterCurrentMs']/1000))
        if p['filterVoltageMs']>0: put('hv'+str(k),(vg[k]-hv[k])/(p['filterVoltageMs']/1000))
    cmd=rot(uv,-delta); Td=p['delaySamples']/p['fs']
    applied=2*np.array([out('delay0'),out('delay1')])-cmd if Td>0 else cmd
    eg=rot(op['eg'],-u[2])*(1+u[3]); J=np.array([[0,1],[-1,0]])
    di=(applied-v-rf*il)/lf+w*(J@il); dg=(v-eg-rg*ig)/lg+w*(J@ig); dv=(il-ig)/cap+w*(J@vc)
    for k in range(2):
        for name,arr in [('il',di),('ig',dg),('vc',dv)]: put(name+str(k),arr[k])
        if Td>0: put('delay'+str(k),2/Td*(cmd[k]-out('delay'+str(k))))
    if p['filterPqMs']>0: put('pf',(P-pf)/(p['filterPqMs']/1000)); put('qf',(Q-qf)/(p['filterPqMs']/1000))
    if p['filterVdcMs']>0: put('dcMeasured',(dc-out('dcMeasured',dc))/(p['filterVdcMs']/1000))
    if ref['dcDynamic']: put('dcVoltage',p['ratedVA']*(op['bridgePower']+u[4]-applied@il)/(p['dcCapacitanceF']*p['dcVoltage']**2*dc))
    y=np.array([dc if p['dMode']=='Vdc' else P,np.linalg.norm(v) if p['qMode']=='Vac' else Q,ic[0],ic[1],delta,np.linalg.norm(v)])
    return dx,y


def jacobian(item, ref):
    x=ref['x0']; n=len(x); u=np.zeros(5); M=np.empty((n+6,n+5))
    for j in range(n+5):
        h=1e-5*max(1,abs(x[j]) if j<n else 1)
        vals=[]
        for sign in [2,1,-1,-2]:
            xp=x.copy(); up=u.copy()
            if j<n: xp[j]+=sign*h
            else: up[j-n]+=sign*h
            f,y=rhs(item,ref,xp,up); vals.append(np.r_[f,y])
        M[:,j]=(-vals[0]+8*vals[1]-8*vals[2]+vals[3])/(12*h)
    return M


def match_poles(reference_poles, supplied_poles):
    actual=np.array([complex(z['re'],z['im']) for z in supplied_poles])
    assert len(actual)==len(reference_poles), 'full eigenvalue count mismatch'
    cost=np.abs(reference_poles[:,None]-actual[None,:])/np.maximum(1,np.abs(reference_poles[:,None]))
    rows,columns=linear_sum_assignment(cost)
    errors=cost[rows,columns]
    maximum=float(np.max(errors))
    assert maximum<CRITERIA['fullPoleNormalizedError'], ('one-to-one full pole mismatch',maximum)
    return maximum,[dict(referenceIndex=int(i),suppliedIndex=int(j),normalizedError=float(cost[i,j])) for i,j in zip(rows,columns)]


def check(item):
    m=item['model']; ref=reference(item); x=ref['x0']; n=len(x); u=np.zeros(5)
    assert ref['names']==m['names'], 'independent state realization mismatch'
    assert ref['dcDynamic']==m['dcDynamic']
    op_errors={k:float(np.max(np.abs(np.asarray(value)-np.asarray(m['op'][k])))/max(1,float(np.max(np.abs(value))))) for k,value in ref['op'].items()}
    assert max(op_errors.values())<1e-10, ('operating point mismatch',op_errors)
    xerr=float(np.max(np.abs(x-np.array(m['x0'])))); assert xerr<1e-10, xerr
    for key in ['kp','ki']: assert abs(ref['pll'][key]-m['pll'][key])/max(1,abs(ref['pll'][key]))<1e-12
    f0,y0=rhs(item,ref,x,u); residual=float(np.max(np.abs(f0)))
    assert residual<CRITERIA['operatingPointResidual'], residual
    assert max(ref['balances'].values())<CRITERIA['operatingPointResidual'],ref['balances']
    M=jacobian(item,ref); A=M[:n,:n]; B=M[:n,n:]; C=M[n:,:n]; D=M[n:,n:]
    supplied=np.block([[np.array(m['A']),np.array(m['B'])],[np.array(m['C']),np.array(m['D'])]])
    row_scales=np.maximum(1,np.max(np.abs(M),axis=1))
    jacerr=float(np.max(np.abs(supplied-M)/row_scales[:,None]))
    assert jacerr<CRITERIA['independentJacobian'],jacerr
    eig=eigvals(A); alpha=float(np.max(eig.real)); eigenerr,matches=match_poles(eig,item['poles'])
    status='unstable' if alpha>1e-6 else 'stable' if alpha< -1e-6 else 'marginal'
    assert status==item['stabilityStatus'], (status,item['stabilityStatus'])
    frequencies=[]
    for f in item['frequencies']:
        H=C@np.linalg.solve(2j*np.pi*f['hz']*np.eye(n)-A,B)+D
        exported=np.array([[z['re']+1j*z['im'] for z in row] for row in f['H']])
        error=float(np.max(np.abs(exported-H)/np.maximum(1,np.abs(H))))
        assert error<CRITERIA['frequencyNormalizedError'],error
        frequencies.append(dict(hz=f['hz'],normalizedError=error))
    perturbations=[]; t=CRITERIA['perturbationHorizonSeconds']; amplitude=CRITERIA['perturbationAmplitude']
    assert item['perturbation']['amplitude']==amplitude and item['perturbation']['horizonSeconds']==t
    for label,column in [('initial-state',None),('reference-d',0),('reference-q',1)]:
        dx=amplitude*np.cos(np.arange(1,n+1)) if column is None else np.zeros(n)
        drive=u.copy()
        if column is not None: drive[column]=amplitude
        augmented=np.zeros((n+1,n+1)); augmented[:n,:n]=A; augmented[:n,-1]=B@drive
        linear=expm(augmented*t)@np.r_[dx,1]; lin=linear[:n]
        sol=solve_ivp(lambda tt,xx:rhs(item,ref,xx,drive)[0],(0,t),x+dx,method='DOP853',rtol=2e-11,atol=2e-13)
        assert sol.success,sol.message
        nonlinear=sol.y[:,-1]-x
        localerr=float(np.max(np.abs(lin-nonlinear))/max(1e-8,np.max(np.abs(lin))))
        ylinear=C@lin+D@drive; ynonlinear=rhs(item,ref,sol.y[:,-1],drive)[1]-y0
        outputerr=float(np.max(np.abs(ylinear-ynonlinear))/max(1e-8,np.max(np.abs(ylinear))))
        assert localerr<CRITERIA['nonlinearLocalError'],(label,'state',localerr)
        assert outputerr<CRITERIA['nonlinearLocalError'],(label,'output',outputerr)
        perturbations.append(dict(kind=label,amplitude=amplitude,horizonSeconds=t,stateRelativeError=localerr,outputRelativeError=outputerr))
    return dict(name=item['name'],experimentId=item['experimentId'],passed=True,order=n,stabilityStatus=status,alpha=alpha,
                independentOperatingPoint={k:np.asarray(v).tolist() for k,v in ref['op'].items()},operatingPointErrors=op_errors,
                physicalBalanceResiduals=ref['balances'],residual=residual,initialStateError=xerr,
                jacobianError=jacerr,jacobianRowScales=row_scales.tolist(),jacobianFivePointRelativeStep=1e-5,
                fullPoleNormalizedError=eigenerr,poleMatches=matches,independentPoles=[dict(re=float(z.real),im=float(z.imag)) for z in eig],
                frequencyError=max(f['normalizedError'] for f in frequencies),frequencies=frequencies,
                localLinearizationError=max(v['stateRelativeError'] for v in perturbations),perturbations=perturbations,
                productNumericalPolicy=item['numericalPolicy'],productJacobianRefinementError=m['jacobianError'])


def run():
    items=json.loads((ROOT/'dq-model-validation-input.json').read_text()); checks=[]
    # A duplicate stable pole cannot pass just because alpha is unchanged.
    rejected=False
    try: match_poles(np.array([-1+0j,-2+0j]),[dict(re=-1,im=0),dict(re=-1,im=0)])
    except AssertionError: rejected=True
    assert rejected, 'one-to-one matching must reject a duplicated eigenvalue'
    for item in items:
        try:
            result=check(item); checks.append(result)
            print(f"{item['name']}: jac={result['jacobianError']:.3g}, full poles={result['fullPoleNormalizedError']:.3g}, freq={result['frequencyError']:.3g}, nonlinear={result['localLinearizationError']:.3g}",flush=True)
        except Exception as error:
            checks.append(dict(name=item['name'],experimentId=item['experimentId'],passed=False,error=str(error)))
            print(f"FAIL {item['name']}: {error}",flush=True)
    passing=[c for c in checks if c['passed']]
    report=dict(scipy=scipy.__version__,numpy=np.__version__,python=platform.python_version(),platform=platform.platform(),
                passed=len(passing),failed=len(checks)-len(passing),criteria=CRITERIA,
                reference='physical-input complex equilibrium; independent frozen/closed nonlinear RHS; five-point Jacobian; Hungarian full-pole bijection; SciPy solve/expm/DOP853',
                selfChecks=dict(duplicatePoleRejected=rejected),
                maxima={key:max((c[key] for c in passing),default=None) for key in ['residual','jacobianError','fullPoleNormalizedError','frequencyError','localLinearizationError']},checks=checks)
    (ROOT/'dq-model-verification.json').write_text(json.dumps(report,indent=2,allow_nan=False)+'\n')
    print(json.dumps({k:v for k,v in report.items() if k!='checks'},indent=2))
    if report['failed']: raise SystemExit(1)


if __name__=='__main__': run()
