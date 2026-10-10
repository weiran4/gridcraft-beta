"""Independent offline evidence: SciPy expm directly at every exported sample
and an independent 768-bin geometric grid; scipy.linalg.solve for equilibrium.
No JS exponential, JS poles, JS equilibrium or JS metrics are reused as answers.
This validates numerical implementation, not converter physics or standards.
"""
import os
os.environ.setdefault('OPENBLAS_NUM_THREADS', '1')
os.environ.setdefault('OMP_NUM_THREADS', '1')
import json
import platform
import importlib.util
from pathlib import Path
import numpy as np
import scipy
from scipy.linalg import expm, solve, eigvals
from scipy.optimize import brentq

OUT = Path(__file__).resolve().parent.parent / 'artifacts/gfl-mainline-response'
data = json.loads((OUT / 'response-input.json').read_text())
reports, failures = [], []
# Link the exported ModelRecord matrices to independently reconstructed physical
# equations too, rather than validating a self-consistent but incorrect wrapper.
_spec = importlib.util.spec_from_file_location('independent_gfl_dq', Path(__file__).with_name('validate-gfl-dq.py'))
_physical = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_physical)


def check_physical_record(item, model):
    config = model.get('configurationSnapshot')
    if config is None:
        return None  # Explicit mathematical response fixture, not a converter.
    analysis = config['analysis']
    options = dict(enabled=True, pllEnabled=analysis['syncMode']=='srf-pll',
                   frequencyHz=analysis['sync']['fnHz'], damping=analysis['sync']['damping'],
                   pllFilterMs=analysis['sync']['filterMs'], dcModel=analysis['dcModel'],
                   decouplingFrequency=analysis['sync']['decouplingFrequency'])
    case = dict(input=config['input'], gains=config['gains'], options=options, experimentId=item['experimentId'])
    ref = _physical.reference(case)
    assert ref['names']==[p['legacyName'] for p in model['states']], 'ModelRecord state order differs from independent realization'
    for key, value in ref['op'].items():
        assert np.max(np.abs(np.asarray(value)-np.asarray(model['operatingPoint']['op'][key])))/max(1,float(np.max(np.abs(value))))<1e-10, ('ModelRecord operating point mismatch',key)
    assert np.max(np.abs(ref['x0']-np.asarray(model['operatingPoint']['x0'])))<1e-10
    f0, y0 = _physical.rhs(case, ref, ref['x0'], np.zeros(5))
    residual = float(np.max(np.abs(f0)))
    assert residual<1e-7 and max(ref['balances'].values())<1e-7
    assert np.max(np.abs(y0-np.asarray(model['operatingPoint']['y0'])))<1e-10
    matrix = _physical.jacobian(case, ref)
    supplied = np.block([[np.asarray(model['A']),np.asarray(model['B'])],
                         [np.asarray(model['C']),np.asarray(model['D'])]])
    scales = np.maximum(1,np.max(np.abs(matrix),axis=1))
    error = float(np.max(np.abs(supplied-matrix)/scales[:,None]))
    assert error<1e-6, ('ModelRecord independent Jacobian mismatch',error)
    return dict(jacobianNormalizedError=error, operatingPointResidual=residual,
                physicalBalanceResiduals=ref['balances'], jacobianRowScales=scales.tolist())


def requested_channels(item, model, result):
    """Bind identities/roles/targets to requested steps, never reported metrics."""
    step = item['step']
    amplitude = step['amplitudePu']
    assert np.isfinite(amplitude) and amplitude!=0, 'invalid requested amplitude'
    inputs = [port['id'] for port in model['inputs']]
    outputs = [port['id'] for port in model['outputs']]
    assert len(set(inputs))==len(inputs) and len(set(outputs))==len(outputs), 'duplicate port ID'
    assert step in item['steps'], 'selected step missing from requested experiment'
    assert all(s['inputId'] in inputs and s['targetOutputId'] in outputs for s in item['steps'])
    column, target_index = inputs.index(step['inputId']), outputs.index(step['targetOutputId'])
    assert item['inputIndex']==column and item['targetIndex']==target_index, 'exported port index mismatch'
    for key in ['inputId','targetOutputId','amplitudePu']:
        assert result[key]==step[key], ('reported response identity mismatch',key)
    assert len(result['channels'])==len(outputs), 'reported channel count mismatch'
    requested_outputs = {s['targetOutputId'] for s in item['steps']}
    expected = []
    for i, (output_id, channel) in enumerate(zip(outputs,result['channels'])):
        role = 'tracking' if i==target_index else 'cross' if output_id in requested_outputs else 'diagnostic'
        target = amplitude if i==target_index else 0
        assert channel['outputId']==output_id, ('reported channel identity mismatch',i)
        assert channel['role']==role, ('reported channel role mismatch',output_id)
        assert channel['targetDelta']==target, ('reported target differs from requested target',output_id)
        expected.append(dict(outputId=output_id,role=role,targetDelta=target))
    return column,target_index,expected


def assert_pu_metric(name, actual, reference, amplitude, tolerance_pp):
    """Retain the .1 requested-amplitude percentage-point numerical bound."""
    if reference is None:
        assert actual is None, ('inapplicable metric must be null',name)
        return None,None
    assert actual is not None and np.isfinite(actual), ('missing/nonfinite applicable metric',name)
    error_pu = float(abs(actual-reference))
    error_pp = error_pu/abs(amplitude)*100
    assert error_pp<=tolerance_pp, ('pu metric mismatch',name,error_pp,tolerance_pp)
    return error_pu,error_pp


def waveform(generator, C, direct, times):
    # Each sample starts at t=0 independently, unlike JS segment recurrence.
    return np.asarray([C @ expm(generator * t)[:-1, -1] + direct for t in times])


def refined_times(poles, window):
    fast = max(np.max(np.abs(poles)), 1 / window)
    times, start, end = [0.0], 0.0, min(window, 1 / fast)
    while start < window:
        times.extend(np.linspace(start, end, 769)[1:])
        start, end = end, min(window, 2 * end)
    return np.asarray(times)


def metrics(times, values, target, steady):
    peak = float(np.max(np.abs(values)))
    if target == 0:
        return dict(overshootPercent=None, settlingTimeSeconds=None,
                    steadyStateErrorPercent=None, steadyStateErrorPu=None,
                    peakAbsPu=peak, residualOffsetPu=float(values[-1]))
    overshoot = float(max(0, np.max(values / target) - 1) * 100)
    error = None if steady is None else float(steady - target)
    outside = np.flatnonzero(np.abs(values - target) > .02 * abs(target))
    settled = steady is not None and abs(steady - target) <= .02 * abs(target)
    ts = None
    if settled:
        if not len(outside):
            ts = 0.0
        elif outside[-1] < len(times) - 1:
            ts = float(times[outside[-1] + 1])
    return dict(overshootPercent=overshoot, settlingTimeSeconds=ts,
                steadyStateErrorPercent=None if error is None else abs(error) / abs(target) * 100,
                steadyStateErrorPu=error, peakAbsPu=peak, residualOffsetPu=float(values[-1]))


for item in data['items']:
    name = f"{item['name']}/{item['experimentId']}/{item['step']['inputId']}"
    try:
        model, result, amplitude = item['model'], item['result'], item['step']['amplitudePu']
        A, B, C, D = (np.asarray(model[k], dtype=float) for k in ('A', 'B', 'C', 'D'))
        physical_record = check_physical_record(item, model)
        column, target_index, expected_channels = requested_channels(item, model, result)
        force, direct = B[:, column] * amplitude, D[:, column] * amplitude
        generator = np.zeros((len(A) + 1, len(A) + 1))
        generator[:-1, :-1], generator[:-1, -1] = A, force
        times = np.asarray(item['exactSampleTimes'])
        reference = waveform(generator, C, direct, times)
        actual = np.asarray([p['y'] for p in result['points']])
        wave_error_pp = float(np.max(np.abs(reference - actual)) / abs(amplitude) * 100)
        assert wave_error_pp <= item['policy']['overshootTolerancePercentagePoints'], (name, 'waveform pp', wave_error_pp)
        poles = eigvals(A)
        stable = bool(np.max(poles.real) < -data['policy']['model']['poleRealPartTolerance'])
        ss, residual, ss_error = None, None, None
        if stable:
            x = solve(A, -force)
            ss = C @ x + direct
            scale = np.sum(np.abs(A), axis=1) * np.max(np.abs(x)) + np.abs(force)
            residual = float(np.max(np.divide(np.abs(A @ x + force), scale, out=np.zeros_like(force), where=scale != 0)))
            assert residual <= item['policy']['steadyStateResidualTolerance'], (name, 'SciPy residual', residual)
            js_ss = np.asarray([c['steadyStateDelta'] for c in result['channels']], dtype=float)
            ss_error = float(np.max(np.abs(js_ss - ss)) / abs(amplitude) * 100)
            assert ss_error <= item['policy']['overshootTolerancePercentagePoints'], (name, 'steady state pp', ss_error)
        else:
            assert all(c['steadyStateDelta'] is None for c in result['channels']), (name, 'fabricated steady state')
            assert all(c['metrics']['settlingTimeSeconds'] is None for c in result['channels']), (name, 'fabricated settling')
        oscillatory_crossing = None
        witness = None
        if item['name'].startswith(('oscillatory-recrossing-', 'oscillatory-budget-', 'oscillatory-narrow-')):
            omega = abs(A[0, 1])
            phase = np.arctan(1 / omega)
            k = int(np.floor((omega * -np.log(.02) + phase) / np.pi))
            peak = (k * np.pi - phase) / omega
            while np.exp(-peak) * abs(np.cos(omega * peak)) <= .02:
                k -= 1
                peak = (k * np.pi - phase) / omega
            def exact_band_error(t):
                return abs(float((C @ expm(generator * t)[:-1, -1] + direct)[0]) / amplitude - 1) - .02
            oscillatory_crossing = float(brentq(exact_band_error, peak, (k + .5) * np.pi / omega, xtol=1e-13))
            # The pole-based peak locates the final excursion; SciPy expm and
            # brentq independently establish its actual target-band crossing.
            js_time = result['channels'][0]['metrics']['settlingTimeSeconds']
            if js_time is not None:
                assert js_time >= oscillatory_crossing - 1e-10, (name, 'early oscillatory certificate', js_time, oscillatory_crossing)
                assert abs(js_time - oscillatory_crossing) <= max(.002, .01 * oscillatory_crossing)
            if omega == 20000:
                assert result['status'] == 'resolutionLimited' and js_time is None, (name, 'unsupported oscillatory resolution')
            witness_time = k * np.pi / omega
            witness = dict(timeSeconds=float(witness_time), output=float(waveform(generator, C, direct, [witness_time])[0, 0]))
        grid = refined_times(poles, float(times[-1]))
        if oscillatory_crossing is not None:
            grid = np.unique(np.r_[grid, peak, oscillatory_crossing + 1e-11])
        dense = waveform(generator, C, direct, grid)
        channels, max_settling, max_overshoot, max_settling_ratio = [], 0.0, 0.0, 0.0
        if result['status'] in ('completed', 'approximateDelay'):
            assert stable, (name, 'nonstable completion')
            assert result['channels'][target_index]['metrics']['settlingTimeSeconds'] is not None
            assert np.max(np.abs(dense[-1] - ss)) / abs(amplitude) <= item['policy']['tailRelativeTolerance'], (name, 'false tail convergence')
        for i, channel in enumerate(result['channels']):
            expected = expected_channels[i]
            ref = metrics(grid, dense[:, i], expected['targetDelta'], None if ss is None else ss[i])
            js = channel['metrics']
            unit = model['outputs'][i].get('unit', 'pu')
            sampled_peak, sampled_residual = ref['peakAbsPu'], ref['residualOffsetPu']
            if unit != 'pu':
                ref['peakAbsPu'], ref['residualOffsetPu'] = None, None
                assert js['peakAbsPu'] is None and js['residualOffsetPu'] is None, (name, 'non-pu diagnostic mislabeled', i)
            metric_errors = {}
            for key in ['peakAbsPu','residualOffsetPu','steadyStateErrorPu']:
                error_pu,error_pp = assert_pu_metric(key,js[key],ref[key],amplitude,item['policy']['overshootTolerancePercentagePoints'])
                metric_errors[key] = dict(absoluteErrorPu=error_pu,errorPercentagePoints=error_pp)
            # Cross and diagnostic channels have no target-relative tracking
            # metrics. A missing certificate is permitted for unresolved tracking,
            # but an inapplicable/false certificate must never be manufactured.
            if expected['role']!='tracking':
                for key in ['overshootPercent','settlingTimeSeconds','steadyStateErrorPercent']:
                    assert js[key] is None, ('nontracking metric must be null',key,i)
            elif ref['steadyStateErrorPercent'] is None:
                assert js['steadyStateErrorPercent'] is None, ('unverified steady-state error must be null',i)
            else:
                assert js['steadyStateErrorPercent'] is not None and np.isfinite(js['steadyStateErrorPercent']), ('missing steady-state error',i)
            ts_error, os_error = None, None
            if js['settlingTimeSeconds'] is not None:
                assert ref['settlingTimeSeconds'] is not None, (name, 'false settling', i)
                ts_error = abs(js['settlingTimeSeconds'] - ref['settlingTimeSeconds'])
                tolerance = max(.002, .01 * ref['settlingTimeSeconds'])
                assert ts_error <= tolerance, (name, 'settling', ts_error, tolerance)
                max_settling = max(max_settling, ts_error)
                max_settling_ratio = max(max_settling_ratio, ts_error / tolerance)
            if js['overshootPercent'] is not None:
                os_error = abs(js['overshootPercent'] - ref['overshootPercent'])
                assert os_error <= .2, (name, 'overshoot pp', os_error)
                max_overshoot = max(max_overshoot, os_error)
            if expected['role'] != 'tracking':
                assert js['overshootPercent'] is None and js['steadyStateErrorPercent'] is None
            if js['steadyStateErrorPercent'] is not None:
                assert abs(js['steadyStateErrorPercent'] - ref['steadyStateErrorPercent']) <= item['policy']['overshootTolerancePercentagePoints']
            channels.append(dict(outputId=expected['outputId'], role=expected['role'], requestedTargetDelta=expected['targetDelta'], unit=unit, referenceMetrics=ref, metricErrors=metric_errors,
                                 sampledPeakAbs=sampled_peak, sampledResidualOffset=sampled_residual,
                                 settlingErrorSeconds=ts_error, overshootErrorPercentagePoints=os_error,
                                 transientToSteadyErrorPu=None if ss is None else float(abs(dense[-1, i] - ss[i]))))
        reports.append(dict(name=name, status=result['status'], scipyStable=stable, independentPhysicalRecord=physical_record,
                            waveformErrorPercentagePoints=wave_error_pp, steadyStateErrorPercentagePoints=ss_error,
                            scipySteadyStateNormalizedResidual=residual,
                            jsSteadyStateNormalizedResidual=result['quality']['steadyState']['normalizedResidual'],
                            maxSettlingErrorSeconds=max_settling, maxSettlingToleranceFraction=max_settling_ratio, maxOvershootErrorPercentagePoints=max_overshoot,
                            exactSamples=len(times), refinedSamples=len(grid), independentFinalOscillatoryCrossingSeconds=oscillatory_crossing, lateExcursionWitness=witness, channels=channels))
        print(f"{name}: waveform={wave_error_pp:.9g} pp, settling={max_settling:.9g} s, overshoot={max_overshoot:.9g} pp", flush=True)
    except Exception as error:
        failures.append(dict(name=name, error=str(error)))
        print(f'FAIL {name}: {error}', flush=True)

report = dict(scipy=scipy.__version__, numpy=np.__version__, python=platform.python_version(), platform=platform.platform(), passed=len(reports), failed=len(failures),
              criteria=dict(waveformPercentagePoints=.1, settlingSeconds='max(.002,.01*T)', overshootPercentagePoints=.2,
                            steadyStateNormalizedResidual=1e-12, puMetricErrorPercentagePoints=.1,
                            puMetricErrorDefinition='100 * absolute pu discrepancy / abs(requested step amplitude)',
                            targetDefinition='requested step amplitude on targetOutputId; zero on every other output'),
              maxWaveformErrorPercentagePoints=max((r['waveformErrorPercentagePoints'] for r in reports), default=None),
              maxSteadyStateErrorPercentagePoints=max((r['steadyStateErrorPercentagePoints'] for r in reports if r['steadyStateErrorPercentagePoints'] is not None), default=None),
              maxSettlingErrorSeconds=max((r['maxSettlingErrorSeconds'] for r in reports), default=None),
              maxSettlingToleranceFraction=max((r['maxSettlingToleranceFraction'] for r in reports), default=None),
              maxMainlineSettlingErrorSeconds=max((r['maxSettlingErrorSeconds'] for r in reports if r['name'].startswith('mainline-')), default=None),
              maxOvershootErrorPercentagePoints=max((r['maxOvershootErrorPercentagePoints'] for r in reports), default=None),
              maxPuMetricErrorPercentagePoints=max((m['errorPercentagePoints'] for r in reports for c in r['channels'] for m in c['metricErrors'].values() if m['errorPercentagePoints'] is not None), default=None),
              results=reports, failures=failures)
(OUT / 'response-verification.json').write_text(json.dumps(report, indent=2, allow_nan=False) + '\n')
canonical = OUT.parent / 'gfl-advisor'
canonical.mkdir(parents=True, exist_ok=True)
(canonical / 'mainline-response-verification.json').write_text(json.dumps(report, indent=2, allow_nan=False) + '\n')
print(json.dumps({k: v for k, v in report.items() if k != 'results'}, indent=2))
assert not failures, failures
