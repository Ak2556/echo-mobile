const fs = require('fs');
const file = 'store/slices/settingsSlice.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  "  reduceAnimations: boolean;\n  setReduceAnimations: (v: boolean) => void;",
  "  reduceAnimations: boolean;\n  setReduceAnimations: (v: boolean) => void;\n  glassTheme: boolean;\n  setGlassTheme: (v: boolean) => void;"
);

fs.writeFileSync(file, code);
