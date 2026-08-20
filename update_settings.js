const fs = require('fs');
const file = 'store/slices/settingsSlice.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  "reduceAnimations: boolean;\n  setReduceAnimations: (v: boolean) => void;",
  "reduceAnimations: boolean;\n  setReduceAnimations: (v: boolean) => void;\n  glassTheme: boolean;\n  setGlassTheme: (v: boolean) => void;"
);

code = code.replace(
  "reduceAnimations: b('reduceAnimations', false), setReduceAnimations: s(set, 'reduceAnimations'),",
  "reduceAnimations: b('reduceAnimations', false), setReduceAnimations: s(set, 'reduceAnimations'),\n    glassTheme: b('glassTheme', false), setGlassTheme: s(set, 'glassTheme'),"
);

fs.writeFileSync(file, code);
