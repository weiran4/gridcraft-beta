"""Read-only mutation regression tests of the actual independent verifier loop.

Run after `node scripts/validate-gfl-mainline-response.mjs`. No generated inputs
or reports are replaced by these tests, and no JS metric is used as an oracle.
"""
import ast
import contextlib
import copy
import io
import math
from pathlib import Path
import unittest

FILE = Path(__file__).resolve().parent.parent / 'scripts/validate-gfl-mainline-response.py'
TREE = ast.parse(FILE.read_text(), str(FILE))
BOUNDARY = next(i for i, node in enumerate(TREE.body)
                if isinstance(node, ast.For) and ast.unparse(node.iter) == "data['items']")
SCOPE = {'__file__': str(FILE), '__name__': 'verifier_regression'}
exec(compile(ast.Module(body=TREE.body[:BOUNDARY], type_ignores=[]), str(FILE), 'exec'), SCOPE)
ITEMS = SCOPE['data']['items']
LOOP = compile(ast.Module(body=[TREE.body[BOUNDARY]], type_ignores=[]), str(FILE), 'exec')


def item(name, column=0):
    return copy.deepcopy(next(x for x in ITEMS if x['name']==name and x['inputIndex']==column))


def verify(case):
    SCOPE['reports'], SCOPE['failures'] = [], []
    SCOPE['data']['items'] = [case]
    with contextlib.redirect_stdout(io.StringIO()):
        exec(LOOP, SCOPE)
    return SCOPE['reports'], SCOPE['failures']


class IndependentMetricOracle(unittest.TestCase):
    def assert_rejected(self, case, reason):
        reports, failures = verify(case)
        self.assertEqual(reports, [], reason+' was wrongly accepted')
        self.assertEqual(len(failures), 1, reason+' did not raise a verification failure')

    def test_false_final_gain_normalized_certificate_is_rejected(self):
        case=item('nonunit-gain'); channel=case['result']['channels'][0]
        channel['targetDelta']=channel['steadyStateDelta']
        channel['metrics'].update(settlingTimeSeconds=-math.log(.02),steadyStateErrorPu=0,steadyStateErrorPercent=0)
        case['result']['status']='completed'
        self.assert_rejected(case,'I1 final-gain-normalized completion certificate')

    def test_zeroed_cross_peak_is_rejected(self):
        case=item('coupled-2x2');case['result']['channels'][1]['metrics']['peakAbsPu']=0
        self.assert_rejected(case,'I2 zeroed cross-axis peak')

    def test_zeroed_cross_residual_is_rejected(self):
        case=item('coupled-2x2');case['result']['channels'][1]['metrics']['residualOffsetPu']=0
        self.assert_rejected(case,'I2 zeroed cross-axis residual')

    def test_wrong_signed_steady_state_error_is_rejected(self):
        case=item('nonunit-gain');metrics=case['result']['channels'][0]['metrics']
        metrics['steadyStateErrorPu']=-metrics['steadyStateErrorPu']
        self.assert_rejected(case,'I2 wrong signed steady-state error')

    def test_channel_identity_role_and_target_mapping_are_verified(self):
        for field,value in [('outputId','wrong-output'),('role','diagnostic'),('targetDelta',0)]:
            with self.subTest(field=field):
                case=item('coupled-2x2');case['result']['channels'][1][field]=value if field!='targetDelta' else .01
                self.assert_rejected(case,'I1 wrong channel '+field)

    def test_response_identity_amplitude_and_indices_are_verified(self):
        for field,value in [('inputId','wrong-input'),('targetOutputId','wrong-output'),('amplitudePu',-.01)]:
            with self.subTest(field=field):
                case=item('one-pole');case['result'][field]=value
                self.assert_rejected(case,'I1 wrong response '+field)
        for field in ['inputIndex','targetIndex']:
            with self.subTest(field=field):
                case=item('coupled-2x2');case[field]=1
                self.assert_rejected(case,'I1 wrong exported '+field)

    def test_cross_metrics_have_no_tracking_error_or_settling(self):
        for field in ['steadyStateErrorPu','steadyStateErrorPercent','settlingTimeSeconds','overshootPercent']:
            with self.subTest(field=field):
                case=item('coupled-2x2');case['result']['channels'][1]['metrics'][field]=0
                self.assert_rejected(case,'I2 inapplicable '+field)

    def test_loose_reported_policy_cannot_redefine_requested_two_percent_settling(self):
        case=item('nonunit-gain')
        case['policy']['settlingBandFraction']=.5
        case['result']['quality']['policy']['settlingBandFraction']=.5
        case['result']['status']='completed'
        case['result']['channels'][0]['metrics']['settlingTimeSeconds']=1.0
        self.assert_rejected(case,'fixed 2% metric despite loose reported policy')

    def test_positive_negative_nonunit_and_cross_valid_records_are_accepted(self):
        for name in ['one-pole','negative-step','nonunit-gain','coupled-2x2']:
            with self.subTest(name=name):
                reports,failures=verify(item(name));self.assertEqual(failures,[]);self.assertEqual(len(reports),1)


if __name__=='__main__': unittest.main(verbosity=2)
