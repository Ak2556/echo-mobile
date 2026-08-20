const fs = require('fs');
const file = 'app/messages/index.tsx';
let code = fs.readFileSync(file, 'utf8');

// Replace AurasRow implementation
const startStr = "export function AurasRow() {";
const endStr = "export default function MessagesListScreen() {";

const startIndex = code.indexOf(startStr);
const endIndex = code.indexOf(endStr);

const oldAurasRow = code.substring(startIndex, endIndex);

let newAurasRow = oldAurasRow.replace(
  "const [selectedMusic, setSelectedMusic] = useState<Song | null>(null);",
  "const [selectedMusic, setSelectedMusic] = useState<Song | null>(null);\n  const [expiresInHours, setExpiresInHours] = useState(24);"
);

newAurasRow = newAurasRow.replace(
  "music_url: selectedMusic?.url,",
  "music_url: selectedMusic?.url,\n      expires_in_hours: expiresInHours,"
);

newAurasRow = newAurasRow.replace(
  "<View style={{ flexDirection: 'row', gap: 12 }}>",
  `            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 12 }}>
              <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '600' }}>Expires in:</Text>
              {[8, 12, 24].map(hrs => (
                <Pressable key={hrs} onPress={() => setExpiresInHours(hrs)} style={{ backgroundColor: expiresInHours === hrs ? colors.accent : colors.surfaceHover, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 }}>
                  <Text style={{ color: expiresInHours === hrs ? '#fff' : colors.text, fontSize: 13, fontWeight: '600' }}>{hrs}h</Text>
                </Pressable>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 12 }}>`
);

code = code.substring(0, startIndex) + newAurasRow + code.substring(endIndex);
fs.writeFileSync(file, code);
