const fs = require('fs');
const file = 'app/(tabs)/_layout.tsx';
let code = fs.readFileSync(file, 'utf8');

code = code.replace("import { BlurView } from 'expo-blur';", "import { BlurView } from 'expo-blur';\nimport { GlassPanel } from '../../components/ui/GlassPanel';");

const oldView = `<View
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: tabHeight + insets.bottom,
        paddingBottom: insets.bottom,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border,
        overflow: 'hidden',
      }}
      pointerEvents="box-none"
    >
      <BlurView
        intensity={50}
        tint={colors.isDark ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: colors.bg, opacity: 0.72 },
        ]}
        pointerEvents="none"
      />`;

const newView = `<GlassPanel
      borderRadius={0}
      elevated={false}
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: tabHeight + insets.bottom,
        paddingBottom: insets.bottom,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border,
      }}
    >`;

code = code.replace(oldView, newView);
code = code.replace(
  `        </View>
      </View>
      {/* Mini App Action Sheet */}`,
  `        </View>
      </GlassPanel>
      {/* Mini App Action Sheet */}`
);

fs.writeFileSync(file, code);
