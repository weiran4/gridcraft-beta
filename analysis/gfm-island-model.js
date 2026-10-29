import {gfmDynamicModel} from './gfm-dynamics.js';
/** Fixed reference remains an explicit diagnostic; full modes include forming dynamics.
 * The island frame rotates with the controller. Absolute angle is omitted (gauge freedom).
 * voltagePu specifies an equilibrium; P/Q references match its resistive load.
 */
export function buildGfmIslandModel(p,g,implementation={},load={},mode='fixed',modeParameters={}) {
 return gfmDynamicModel(p,g,mode,modeParameters,implementation,{kind:'island',load});
}
