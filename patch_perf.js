const fs = require('fs');
const file = 'src/shared/lib/performance.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  "export function resolvePerformanceProfile(\n  mode: PerformanceMode,\n  options: { reduceAnimations: boolean; dataSaver: boolean }\n)",
  "export function resolvePerformanceProfile(\n  mode: PerformanceMode,\n  options: { reduceAnimations: boolean; dataSaver: boolean; glassTheme: boolean }\n)"
);

code = code.replace(
  "  const isHot = true;\n  const reduceMotion = options.reduceAnimations || options.dataSaver || isHot;\n  const useBlur = false; // Never use heavy BlurViews when max responsive\n  const maxBlurIntensity = 0;",
  "  const isHot = !options.glassTheme;\n  const reduceMotion = options.reduceAnimations || options.dataSaver || isHot;\n  const useBlur = options.glassTheme;\n  const maxBlurIntensity = options.glassTheme ? 100 : 0;"
);

code = code.replace(
  "  const reduceAnimations = useAppStore(s => s.reduceAnimations);\n  const dataSaver = useAppStore(s => s.dataSaver);\n  return resolvePerformanceProfile(mode, { reduceAnimations, dataSaver });",
  "  const reduceAnimations = useAppStore(s => s.reduceAnimations);\n  const dataSaver = useAppStore(s => s.dataSaver);\n  const glassTheme = useAppStore(s => s.glassTheme);\n  return resolvePerformanceProfile(mode, { reduceAnimations, dataSaver, glassTheme });"
);

fs.writeFileSync(file, code);
