const fs = require('fs');

const path = 'app/mini-apps/tasks.tsx';
let code = fs.readFileSync(path, 'utf8');

// 1. Add state
code = code.replace(
  "const [showAlarmPicker, setShowAlarmPicker] = useState(false);",
  "const [showAlarmPicker, setShowAlarmPicker] = useState(false);\n  const [showAddSheet, setShowAddSheet] = useState(false);"
);

// 2. Wrap root and add Bottom Sheet + FAB
const returnStart = "return (\n    <MiniAppShell title={tt('Tasks')} subtitle={tt('Action')}>";
const returnStartNew = "return (\n    <View style={{ flex: 1, backgroundColor: colors.background }}>\n    <MiniAppShell title={tt('Tasks')} subtitle={tt('Action')}>";
code = code.replace(returnStart, returnStartNew);

// Extract the inline form
const glassPanelStart = "<GlassPanel variant=\"light\" borderRadius={22} contentStyle={{ padding: 16, gap: 12 }} style={{ marginBottom: 16 }}>";
const glassPanelEnd = "</GlassPanel>\n\n      <ScrollView horizontal";
const startIndex = code.indexOf(glassPanelStart);
const endIndex = code.indexOf("</GlassPanel>", startIndex) + "</GlassPanel>".length;

if (startIndex > -1 && endIndex > -1) {
  const inlineForm = code.substring(startIndex, endIndex);
  
  // Remove inline form from scroll flow
  code = code.substring(0, startIndex) + code.substring(endIndex + 1);
  
  // Inject FAB and Sheet at the bottom before final closing tags
  const closingTags = "    </MiniAppShell>\n  );";
  
  const bottomSheet = `
    </MiniAppShell>
    
    {/* FAB */}
    <Pressable 
      onPress={() => setShowAddSheet(true)}
      style={{ position: 'absolute', bottom: 40, right: 24, width: 64, height: 64, borderRadius: 32, backgroundColor: accent, justifyContent: 'center', alignItems: 'center', shadowColor: accent, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 10 }}
    >
      <Plus color="#fff" size={28} weight="bold" />
    </Pressable>

    {/* Bottom Sheet */}
    {showAddSheet && (
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }} onPress={() => setShowAddSheet(false)} />
        <Animated.View entering={SlideInDown.springify().damping(18).stiffness(200)} exiting={SlideOutDown} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.surface, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: 64, shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.2, shadowRadius: 20 }}>
          
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 20 }} />
          
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder={tt('What needs to be done?')}
            placeholderTextColor={colors.textMuted}
            style={{ color: colors.text, fontSize: 24, fontWeight: '800', marginBottom: 24 }}
            returnKeyType="done"
            onSubmitEditing={() => { add(); setShowAddSheet(false); }}
            autoFocus
          />
          
          <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '700', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>{tt('Priority')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
            {PRIORITIES.map(item => (
              <Pressable key={item.id} onPress={() => setPriority(item.id)}>
                <View style={{ borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: priority === item.id ? item.color : colors.surfaceHover, borderWidth: priority === item.id ? 0 : 1, borderColor: colors.border }}>
                  <Text style={{ color: priority === item.id ? '#fff' : colors.textSecondary, fontSize: 14, fontWeight: '800' }}>{tt(item.label)}</Text>
                </View>
              </Pressable>
            ))}
          </View>
          
          <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '700', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>{tt('Schedule & Alarm')}</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: showAddPicker ? 16 : 32 }}>
            <Pressable onPress={() => {
              if (!showAddPicker && !alarmTime) {
                setAlarmTime({ hour: 9, minute: 0 });
                setDue(todayTaskDate());
              }
              setShowAddPicker(!showAddPicker);
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: alarmTime ? accent : colors.surfaceHover, borderWidth: alarmTime ? 0 : 1, borderColor: colors.border }}>
                <Bell color={alarmTime ? '#fff' : colors.textSecondary} size={16} weight={alarmTime ? "fill" : "regular"} />
                <Text style={{ color: alarmTime ? '#fff' : colors.textSecondary, fontSize: 14, fontWeight: '800' }}>
                  {alarmTime ? \`Scheduled: \${formatAlarmTime(alarmTime)}\` : tt('Set Schedule...')}
                </Text>
              </View>
            </Pressable>
            {alarmTime && (
              <Pressable onPress={() => { setAlarmTime(null); setShowAddPicker(false); }}>
                <View style={{ borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.surfaceHover, borderWidth: 1, borderColor: colors.border }}>
                  <X color={colors.textSecondary} size={16} weight="bold" />
                </View>
              </Pressable>
            )}
          </View>

          {showAddPicker && alarmTime && due && (
            <View style={{ marginVertical: 8, marginBottom: 32 }}>
              <DateTimePicker 
                value={{ date: due, hour: alarmTime.hour, minute: alarmTime.minute }} 
                onChange={(val) => {
                  setDue(val.date);
                  setAlarmTime({ hour: val.hour, minute: val.minute });
                }} 
              />
            </View>
          )}

          <Pressable onPress={() => { add(); setShowAddSheet(false); }}>
            <View style={{ height: 56, borderRadius: 20, backgroundColor: accent, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10, shadowColor: accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 }}>
              <Plus color="#fff" size={20} weight="bold" />
              <Text style={{ color: '#fff', fontSize: 17, fontWeight: '900' }}>{tt('Create Task')}</Text>
            </View>
          </Pressable>
          
        </Animated.View>
      </View>
    )}
    </View>
  );`;

  code = code.replace(closingTags, bottomSheet);
}

// 3. Improve add() logic so it resets properly
code = code.replace(
  "setShowAddPicker(false);\n    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);",
  "setShowAddPicker(false);\n    setShowAddSheet(false);\n    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);"
)

fs.writeFileSync(path, code);
console.log("Refactored tasks.tsx successfully.");
