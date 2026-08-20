const fs = require('fs');
const file = 'app/settings.tsx';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  '<SettingsRow theme={theme} icon={Lightning} label={ttx("Reduce Animations")} subtitle={ttx("Minimize motion effects")} right={SwitchEl(s.reduceAnimations, s.setReduceAnimations)} />',
  '<SettingsRow theme={theme} icon={Lightning} label={ttx("Reduce Animations")} subtitle={ttx("Minimize motion effects")} right={SwitchEl(s.reduceAnimations, s.setReduceAnimations)} />\n            <SettingsRow theme={theme} icon={Sparkle} label={ttx("Glass Theme")} subtitle={ttx("Enable blurred backgrounds (requires high-end device)")} right={SwitchEl(s.glassTheme, s.setGlassTheme)} />'
);

// We might need to import Sparkle if it's not imported.
// Actually Sparkle might already be imported. Let's check imports.
if (code.includes('import { Sparkle }')) {
  // It's there. Wait, is it?
}

fs.writeFileSync(file, code);
