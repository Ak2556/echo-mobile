const fs = require('fs');
const file = 'app/settings.tsx';
let code = fs.readFileSync(file, 'utf8');

if (!code.includes('import { EncryptionKeys }')) {
  code = code.replace("import { GlassPanel } from '../components/ui/GlassPanel';", "import { GlassPanel } from '../components/ui/GlassPanel';\nimport { EncryptionKeys } from '../components/settings/EncryptionKeys';");
  
  const target = `{showGroup('privacy') && <Animated.View entering={animation(FadeInDown.delay(100).duration(220))} style={sectionStyle}>`;
  
  code = code.replace(
    target,
    `{showGroup('privacy') && <Animated.View entering={animation(FadeInDown.delay(150).duration(220))} style={sectionStyle}><EncryptionKeys /></Animated.View>}\n\n        ` + target
  );
  
  fs.writeFileSync(file, code);
}
