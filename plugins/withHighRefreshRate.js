const { withMainActivity } = require('@expo/config-plugins');

/**
 * Ask Android for the display's fastest refresh rate (90/120 Hz).
 *
 * Owner report 2026-10-01: the feed "is not feeling 60 fps plus". Many phones
 * (Xiaomi/HyperOS, Realme, Oppo in their default "smart"/"auto" modes) keep
 * an app at 60 Hz unless its window asks for a higher mode, and Echo never
 * asked, so on those phones no amount of render work could get above 60.
 *
 * This picks the supported mode with the current resolution and the highest
 * refresh rate and sets it as the window's preferred mode. It only expresses a
 * preference: the system still drops to a lower rate for battery saver, heat,
 * or a static screen on LTPO panels.
 */
const MARKER = '// echo: prefer the highest refresh rate';

const SNIPPET = `
    ${MARKER}
    preferHighestRefreshRate()`;

const METHOD = `
  ${MARKER}
  private fun preferHighestRefreshRate() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
    @Suppress("DEPRECATION")
    val display = windowManager.defaultDisplay ?: return
    val current = display.mode
    val best = display.supportedModes
      .filter { it.physicalWidth == current.physicalWidth && it.physicalHeight == current.physicalHeight }
      .maxByOrNull { it.refreshRate } ?: return
    if (best.modeId == current.modeId && best.refreshRate <= current.refreshRate) return
    window.attributes = window.attributes.also { it.preferredDisplayModeId = best.modeId }
  }
`;

function addHighRefreshRate(src) {
  if (src.includes(MARKER)) return src;
  const call = 'super.onCreate(null)';
  if (!src.includes(call)) throw new Error('withHighRefreshRate: super.onCreate(null) not found in MainActivity');
  let out = src.replace(call, `${call}${SNIPPET}`);
  if (!/^import android\.os\.Build$/m.test(out)) out = out.replace(/^package .*$/m, m => `${m}\nimport android.os.Build`);
  const anchor = '  override fun getMainComponentName';
  const at = out.indexOf(anchor);
  if (at === -1) throw new Error('withHighRefreshRate: getMainComponentName not found in MainActivity');
  const lineStart = out.lastIndexOf('\n', out.lastIndexOf('/**', at));
  return out.slice(0, lineStart) + METHOD.trimEnd() + '\n' + out.slice(lineStart);
}

module.exports = function withHighRefreshRate(config) {
  return withMainActivity(config, (cfg) => {
    if (cfg.modResults.language !== 'kt') {
      throw new Error('withHighRefreshRate: expected a Kotlin MainActivity');
    }
    cfg.modResults.contents = addHighRefreshRate(cfg.modResults.contents);
    return cfg;
  });
};

module.exports.addHighRefreshRate = addHighRefreshRate;
