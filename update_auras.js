const fs = require('fs');
const file = 'app/messages/index.tsx';
let code = fs.readFileSync(file, 'utf8');

// Add imports
code = code.replace(
  "import { RemoteConversation, searchRemoteUsers, UserSearchHit } from '../../lib/supabaseEchoApi';",
  "import { RemoteConversation, searchRemoteUsers, UserSearchHit, fetchNetworkAuras, publishAura } from '../../lib/supabaseEchoApi';\nimport { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';"
);

// Replace AurasRow implementation
const startStr = "export function AurasRow() {";
const endStr = "export default function MessagesListScreen() {";

const startIndex = code.indexOf(startStr);
const endIndex = code.indexOf(endStr);

const newAurasRow = `export function AurasRow() {
  const { colors, radius, fontSizes } = useTheme();
  const remote = isSupabaseRemote();
  const qc = useQueryClient();
  
  const { data: networkAuras } = useQuery({
    queryKey: ['network-auras'],
    queryFn: fetchNetworkAuras,
    enabled: remote,
    staleTime: 60_000,
  });

  const publishMutation = useMutation({
    mutationFn: publishAura,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['network-auras'] });
    }
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [auraText, setAuraText] = useState('');
  const [viewingAura, setViewingAura] = useState<any>(null);
  const [musicPickerOpen, setMusicPickerOpen] = useState(false);
  const [selectedMusic, setSelectedMusic] = useState<Song | null>(null);

  const meUserId = useAppStore(s => s.userId);
  const myProfile = useAppStore(s => s.profile);
  
  const allAuras = networkAuras || [];
  const myAuraObj = allAuras.find(a => a.user_id === meUserId);
  const othersAuras = allAuras.filter(a => a.user_id !== meUserId);

  // Fallback to local state if not remote
  const [localMyAura, setLocalMyAura] = useState<any>(null);
  
  const handlePublish = () => {
    const payload = {
      text_content: auraText || undefined,
      music_title: selectedMusic?.title,
      music_artist: selectedMusic?.artist,
      music_url: selectedMusic?.url,
    };
    if (remote) {
      publishMutation.mutate(payload);
    } else {
      setLocalMyAura(payload);
    }
    setModalOpen(false);
    setAuraText('');
    setSelectedMusic(null);
  };

  return (
    <View style={{ paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, backgroundColor: colors.surface }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 8, paddingTop: 16, paddingBottom: 8 }}>
        <StatusAvatar
          name="Me" color={myProfile?.avatarColor || colors.accent} isMe
          aura={remote ? myAuraObj : localMyAura}
          onPress={() => setModalOpen(true)}
        />
        {othersAuras.map((a) => (
          <StatusAvatar key={a.user_id} name={a.name} color={a.color} aura={a} onPress={() => setViewingAura(a)} />
        ))}
        {!remote && (
          <>
            <StatusAvatar key="m1" name="Akash" color="#FF5733" aura={{ text_content: 'Deep work 🎧' }} onPress={() => setViewingAura({ name: 'Akash', color: '#FF5733', aura: { text_content: 'Deep work 🎧' } })} />
            <StatusAvatar key="m2" name="Elena" color="#33FF57" aura={{ text_content: 'At the gym 💪' }} onPress={() => setViewingAura({ name: 'Elena', color: '#33FF57', aura: { text_content: 'At the gym 💪' } })} />
          </>
        )}
      </ScrollView>

      {/* Viewer Modal */}
      <Modal visible={!!viewingAura} animationType="fade" transparent onRequestClose={() => setViewingAura(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' }} onPress={() => setViewingAura(null)}>
          <View style={{ alignItems: 'center', gap: 16 }}>
            <Avatar name={viewingAura?.name ?? '?'} color={viewingAura?.color} size={100} />
            <Text style={{ color: '#fff', fontSize: 24, fontWeight: 'bold' }}>{viewingAura?.name}</Text>
            {viewingAura?.text_content || viewingAura?.aura?.text_content ? (
              <View style={{ backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 24 }}>
                <Text style={{ color: '#fff', fontSize: 20 }}>{viewingAura?.text_content || viewingAura?.aura?.text_content}</Text>
              </View>
            ) : null}
            {viewingAura?.music_title ? (
              <View style={{ backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 24, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: '#fff', fontSize: 16 }}>🎵 {viewingAura.music_title} - {viewingAura.music_artist}</Text>
              </View>
            ) : null}
          </View>
        </Pressable>
      </Modal>

      <Modal visible={modalOpen} animationType="fade" transparent onRequestClose={() => setModalOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.card, padding: 20, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ color: colors.text, fontSize: 20, fontFamily: 'Fraunces_600SemiBold', marginBottom: 16 }}>Set your Aura</Text>
            <TextInput
              value={auraText}
              onChangeText={setAuraText}
              placeholder="What's your vibe? (e.g. Deep work)"
              placeholderTextColor={colors.textMuted}
              style={{ color: colors.text, fontSize: fontSizes.body, backgroundColor: colors.inputBg, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.inputBorder, marginBottom: 12 }}
            />
            {selectedMusic ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceHover, padding: 10, borderRadius: 8, marginBottom: 12 }}>
                <Text style={{ color: colors.text, fontSize: 13, flex: 1 }} numberOfLines={1}>🎵 {selectedMusic.title} - {selectedMusic.artist}</Text>
                <Pressable onPress={() => setSelectedMusic(null)} hitSlop={10}><Text style={{ color: colors.danger, fontWeight: '700' }}>X</Text></Pressable>
              </View>
            ) : (
              <Pressable onPress={() => setMusicPickerOpen(true)} style={{ alignSelf: 'flex-start', marginBottom: 16 }}>
                <Text style={{ color: colors.accent, fontWeight: '600' }}>+ Add Music</Text>
              </Pressable>
            )}
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Pressable style={{ flex: 1, padding: 14, alignItems: 'center', borderRadius: 12, backgroundColor: colors.surfaceHover }} onPress={() => setModalOpen(false)}>
                <Text style={{ color: colors.text, fontWeight: '700' }}>Cancel</Text>
              </Pressable>
              <Pressable style={{ flex: 1, padding: 14, alignItems: 'center', borderRadius: 12, backgroundColor: colors.accent }} onPress={handlePublish}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Publish</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <MusicPickerModal visible={musicPickerOpen} onClose={() => setMusicPickerOpen(false)} onSelect={(song) => { setSelectedMusic(song); setMusicPickerOpen(false); }} />
    </View>
  );
}

`;

code = code.substring(0, startIndex) + newAurasRow + code.substring(endIndex);
fs.writeFileSync(file, code);
