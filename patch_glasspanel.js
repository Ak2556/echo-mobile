const fs = require('fs');
const file = 'components/ui/GlassPanel.tsx';
let code = fs.readFileSync(file, 'utf8');

if (!code.includes('DynamicReflection')) {
  code = code.replace(
    "import { usePerformanceProfile } from '../../src/shared/lib/performance';",
    "import { usePerformanceProfile } from '../../src/shared/lib/performance';\nimport { DynamicReflection } from './DynamicReflection';"
  );
  
  // Inject before bottomHighlight
  code = code.replace(
    "{/* Optional bottom edge highlight */}",
    "{/* Dynamic Device Reflection */}\n        <DynamicReflection intensity={colors.isDark ? 0.6 : 0.8} />\n        {/* Optional bottom edge highlight */}"
  );
  
  fs.writeFileSync(file, code);
}
