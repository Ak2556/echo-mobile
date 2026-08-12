const fs = require('fs');

// 1. Fix tasks.tsx Bottom Sheet wrapper
let tasksPath = 'app/mini-apps/tasks.tsx';
let tasksCode = fs.readFileSync(tasksPath, 'utf8');

const target1 = "<KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>";
const replacement1 = "<KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>";

tasksCode = tasksCode.replace(target1, replacement1);

// Remove autoFocus from TextInput to prevent instant keyboard push
tasksCode = tasksCode.replace("onSubmitEditing={() => { add(); setShowAddSheet(false); }}\n            autoFocus", "onSubmitEditing={() => { add(); setShowAddSheet(false); }}");

fs.writeFileSync(tasksPath, tasksCode);

// 2. Fix DateTimePicker.tsx layout spacing
let dtpPath = 'components/ui/DateTimePicker.tsx';
let dtpCode = fs.readFileSync(dtpPath, 'utf8');

dtpCode = dtpCode.replace(
  '<DrumPicker flex={2.5} items={dates} value={value.date} onChange={handleDate} align="flex-start" />',
  '<DrumPicker flex={1.5} items={dates} value={value.date} onChange={handleDate} align="center" />'
);

dtpCode = dtpCode.replace(
  '<DrumPicker flex={0.8} items={hours} value={hour12} onChange={handleHour} align="flex-end" />\n      <Text style={{ fontSize: 24, fontWeight: \'800\', color: colors.text, marginHorizontal: 2, marginBottom: 4, opacity: 0.8 }}>:</Text>\n      <DrumPicker flex={0.8} items={minutes} value={value.minute} onChange={handleMinute} align="flex-start" />',
  '<DrumPicker flex={0.8} items={hours} value={hour12} onChange={handleHour} align="center" />\n      <Text style={{ fontSize: 24, fontWeight: \'800\', color: colors.text, marginHorizontal: 0, marginBottom: 4, opacity: 0.8 }}>:</Text>\n      <DrumPicker flex={0.8} items={minutes} value={value.minute} onChange={handleMinute} align="center" />'
);

dtpCode = dtpCode.replace(
  '<DrumPicker flex={1.2} items={ampm} value={isPM ? \'PM\' : \'AM\'} onChange={handleAmPm} align="flex-end" />',
  '<DrumPicker flex={1} items={ampm} value={isPM ? \'PM\' : \'AM\'} onChange={handleAmPm} align="center" />'
);

fs.writeFileSync(dtpPath, dtpCode);
console.log("Fixed UI layout correctly.");
