import re

with open('app/mini-apps/tasks.tsx', 'r') as f:
    code = f.read()

# 1. Imports
code = code.replace("import { TimePicker } from '../../components/ui/TimePicker';", "import { DateTimePicker } from '../../components/ui/DateTimePicker';")

# 2. formatAlarmTime
format_alarm = """
function formatAlarmTime(alarm: { hour: number; minute: number }): string {
  const ampm = alarm.hour < 12 ? 'AM' : 'PM';
  const h12 = alarm.hour % 12 === 0 ? 12 : alarm.hour % 12;
  return `${h12}:${String(alarm.minute).padStart(2, '0')} ${ampm}`;
}
"""
code = code.replace("function formatTaskTime(hhmm: string): string {\n  const [h, m] = hhmm.split(':').map(Number);\n  const ampm = h < 12 ? 'AM' : 'PM';\n  const h12 = h % 12 === 0 ? 12 : h % 12;\n  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;\n}", 
"function formatTaskTime(hhmm: string): string {\n  const [h, m] = hhmm.split(':').map(Number);\n  const ampm = h < 12 ? 'AM' : 'PM';\n  const h12 = h % 12 === 0 ? 12 : h % 12;\n  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;\n}\n" + format_alarm)

# 3. State
code = code.replace(
"  const [due, setDue] = useState<string | undefined>(todayTaskDate());\n  const [time, setTime] = useState<string | undefined>(undefined);\n  const [remind, setRemind] = useState(false);",
"  const [due, setDue] = useState<string | undefined>(todayTaskDate());\n  const [alarmTime, setAlarmTime] = useState<{ hour: number, minute: number } | null>(null);\n  const [showAddPicker, setShowAddPicker] = useState(false);"
)

# 4. Create Task Logic
code = code.replace(
"const effectiveDue = remind && !due ? todayTaskDate() : due;",
"const effectiveDue = due;"
)

code = code.replace(
"time: effectiveDue ? time : undefined,",
"alarmTime: alarmTime || undefined,"
)

code = code.replace(
"const reminderId = remind ? (await scheduleTaskReminder(base)) ?? undefined : undefined;",
"const reminderId = alarmTime ? (await scheduleTaskReminder(base)) ?? undefined : undefined;"
)

code = code.replace(
"setTitle('');\n    setNotes('');\n    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);",
"setTitle('');\n    setNotes('');\n    setDue(todayTaskDate());\n    setAlarmTime(null);\n    setShowAddPicker(false);\n    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);"
)

# 5. Detail update logic
code = code.replace(
"if (detailAlarm && (!detailTask.alarmTime || detailTask.alarmTime.hour !== detailAlarm.hour || detailTask.alarmTime.minute !== detailAlarm.minute)) {",
"if (detailAlarm && (!detailTask.alarmTime || detailTask.alarmTime.hour !== detailAlarm.hour || detailTask.alarmTime.minute !== detailAlarm.minute || detailTask.due !== detailNotes)) {"
)

# 6. Detail View TimePicker -> DateTimePicker
code = code.replace(
"<TimePicker value={detailAlarm} onChange={setDetailAlarm} />",
"<DateTimePicker \n                          value={{ date: detailTask.due || todayTaskDate(), hour: detailAlarm.hour, minute: detailAlarm.minute }} \n                          onChange={(val) => {\n                            updateTask(detailTask.id, { due: val.date });\n                            setDetailAlarm({ hour: val.hour, minute: val.minute });\n                          }} \n                        />"
)

# 7. Add View New schedule picker
old_add_schedule = """          {DUE_OPTIONS.map(item => (
            <Pressable key={item.label} onPress={() => setDue(item.value)}>
              <View style={{ borderRadius: 999, paddingHorizontal: 11, paddingVertical: 8, backgroundColor: due === item.value ? accent : colors.surfaceHover }}>
                <Text style={{ color: due === item.value ? '#fff' : colors.textSecondary, fontSize: 12, fontWeight: '800' }}>{tt(item.label)}</Text>
              </View>
            </Pressable>
          ))}
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          {TIME_OPTIONS.map(item => {
            const active = time === item.value;
            return (
              <Pressable
                key={item.value}
                onPress={() => { const next = active ? undefined : item.value; setTime(next); if (next) setRemind(true); }}
              >
                <View style={{ borderRadius: 999, paddingHorizontal: 11, paddingVertical: 8, backgroundColor: active ? accent : colors.surfaceHover }}>
                  <Text style={{ color: active ? '#fff' : colors.textSecondary, fontSize: 12, fontWeight: '800' }}>{tt(item.label)}</Text>
                </View>
              </Pressable>
            );
          })}
          <Pressable onPress={() => setRemind(v => !v)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 8, backgroundColor: remind ? `${accent}` : colors.surfaceHover }}>
              {remind ? <Bell color="#fff" size={13} weight="fill" /> : <BellSlash color={colors.textSecondary} size={13} />}
              <Text style={{ color: remind ? '#fff' : colors.textSecondary, fontSize: 12, fontWeight: '800' }}>{remind ? tt('Reminder on') : tt('Remind me')}</Text>
            </View>
          </Pressable>
        </View>"""

new_add_schedule = """          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable onPress={() => {
              if (!showAddPicker && !alarmTime) {
                setAlarmTime({ hour: 9, minute: 0 });
                setDue(todayTaskDate());
              }
              setShowAddPicker(!showAddPicker);
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 8, backgroundColor: alarmTime ? accent : colors.surfaceHover }}>
                <Bell color={alarmTime ? '#fff' : colors.textSecondary} size={13} weight={alarmTime ? "fill" : "regular"} />
                <Text style={{ color: alarmTime ? '#fff' : colors.textSecondary, fontSize: 12, fontWeight: '800' }}>
                  {alarmTime ? `Scheduled: ${formatAlarmTime(alarmTime)}` : tt('Schedule...')}
                </Text>
              </View>
            </Pressable>
            {alarmTime && (
              <Pressable onPress={() => { setAlarmTime(null); setShowAddPicker(false); }}>
                <View style={{ borderRadius: 999, paddingHorizontal: 11, paddingVertical: 8, backgroundColor: colors.surfaceHover }}>
                  <X color={colors.textSecondary} size={13} />
                </View>
              </Pressable>
            )}
          </View>
        </View>

        {showAddPicker && alarmTime && due && (
          <View style={{ marginVertical: 8 }}>
            <DateTimePicker 
              value={{ date: due, hour: alarmTime.hour, minute: alarmTime.minute }} 
              onChange={(val) => {
                setDue(val.date);
                setAlarmTime({ hour: val.hour, minute: val.minute });
              }} 
            />
          </View>
        )}"""

code = code.replace(old_add_schedule, new_add_schedule)

# 8. Detail schedule picker cleanup
old_detail_schedule = """                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                    {DUE_OPTIONS.map(d => (
                      <Pressable key={d.label} onPress={() => updateTask(detailTask.id, { due: d.value })}>
                        <View style={{ backgroundColor: detailTask.due === d.value ? accent : colors.surfaceHover, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 }}>
                          <Text style={{ color: detailTask.due === d.value ? '#fff' : colors.textSecondary, fontSize: 13, fontWeight: '700' }}>{d.label}</Text>
                        </View>
                      </Pressable>
                    ))}
                  </View>"""
code = code.replace(old_detail_schedule, "")

code = code.replace(
"<Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>Custom Alarm</Text>",
"<Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>Task Schedule</Text>"
)

code = code.replace(
"setDetailAlarm(null); setShowAlarmPicker(false); }",
"setDetailAlarm(null); setShowAlarmPicker(false); updateTask(detailTask.id, { due: undefined }); }"
)

code = code.replace(
"if (!detailAlarm) setDetailAlarm({ hour: 9, minute: 0 });",
"if (!detailAlarm) {\n                            setDetailAlarm({ hour: 9, minute: 0 });\n                            if (!detailTask.due) updateTask(detailTask.id, { due: todayTaskDate() });\n                          }"
)

# Render Task List Items
code = code.replace(
"{task.time && !task.alarmTime && <Text style={{ color: colors.textMuted, fontSize: 12 }}>· {formatTaskTime(task.time)}</Text>}",
"{task.alarmTime && <Text style={{ color: colors.textMuted, fontSize: 12 }}>· {formatAlarmTime(task.alarmTime)}</Text>}\n                      {task.time && !task.alarmTime && <Text style={{ color: colors.textMuted, fontSize: 12 }}>· {formatTaskTime(task.time)}</Text>}"
)

with open('app/mini-apps/tasks.tsx', 'w') as f:
    f.write(code)

