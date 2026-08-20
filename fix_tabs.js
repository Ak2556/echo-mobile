const fs = require('fs');
const file = 'app/(tabs)/_layout.tsx';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  `    <GlassPanel
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
    >`,
  `    <>
    <GlassPanel
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
    >`
);

code = code.replace(
  `        </View>

      <ActionSheet`,
  `        </View>
    </GlassPanel>

      <ActionSheet`
);

code = code.replace(
  `      />
    </View>
  );`,
  `      />
    </>
  );`
);

fs.writeFileSync(file, code);
