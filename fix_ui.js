const fs = require('fs');

// 1. Fix DateTimePicker.tsx
let dtpPath = 'components/ui/DateTimePicker.tsx';
let dtpCode = fs.readFileSync(dtpPath, 'utf8');

dtpCode = dtpCode.replace(
  "backgroundColor: 'rgba(255,255,255,0.08)'",
  "backgroundColor: colors.isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)'"
);

dtpCode = dtpCode.replace(
  "fontSize: 21,\n        fontWeight: '600',\n        color: colors.text,\n        letterSpacing: -0.5,",
  "fontSize: 22,\n        fontWeight: '700',\n        color: colors.text,"
);

dtpCode = dtpCode.replace(
  "const opacity = interpolate(scrollY.value, input, [0.2, 0.4, 1, 0.4, 0.2]",
  "const opacity = interpolate(scrollY.value, input, [0.1, 0.3, 1, 0.3, 0.1]"
);

dtpCode = dtpCode.replace(
  "<Text style={{ fontSize: 24, fontWeight: '700', color: colors.text, marginHorizontal: 2, marginBottom: 2 }}>:</Text>",
  "<Text style={{ fontSize: 24, fontWeight: '800', color: colors.text, marginHorizontal: 2, marginBottom: 4, opacity: 0.8 }}>:</Text>"
);

fs.writeFileSync(dtpPath, dtpCode);

// 2. Fix tasks.tsx Bottom Sheet cut-off
let tasksPath = 'app/mini-apps/tasks.tsx';
let tasksCode = fs.readFileSync(tasksPath, 'utf8');

// Find the bottom sheet block
const bottomSheetStart = "{/* Bottom Sheet */}\n    {showAddSheet && (\n      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }}>\n        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }} onPress={() => setShowAddSheet(false)} />\n        <Animated.View entering={SlideInDown.springify().damping(18).stiffness(200)} exiting={SlideOutDown} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.surface, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: 64, shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.2, shadowRadius: 20 }}>";

const bottomSheetNew = "{/* Bottom Sheet */}\n    {showAddSheet && (\n      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }}>\n        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }} onPress={() => setShowAddSheet(false)} />\n        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>\n          <Animated.View entering={SlideInDown.springify().damping(18).stiffness(200)} exiting={SlideOutDown} style={{ backgroundColor: colors.surface, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: 40, shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.2, shadowRadius: 20, maxHeight: '90%' }}>\n            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>";

tasksCode = tasksCode.replace(bottomSheetStart, bottomSheetNew);

// Add closing ScrollView and KeyboardAvoidingView
const bottomSheetEnd = "        </Animated.View>\n      </View>\n    )}";
const bottomSheetEndNew = "            </ScrollView>\n          </Animated.View>\n        </KeyboardAvoidingView>\n      </View>\n    )}";
tasksCode = tasksCode.replace(bottomSheetEnd, bottomSheetEndNew);

fs.writeFileSync(tasksPath, tasksCode);
console.log("Fixed UI successfully.");
