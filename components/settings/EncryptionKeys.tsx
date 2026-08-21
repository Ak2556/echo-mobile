import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { ShieldCheck, Key, Warning, ArrowsClockwise } from 'phosphor-react-native';
import { useTheme } from '../../src/shared/lib/theme';
import { GlassPanel } from '../ui/GlassPanel';
import { getMyPublicKey, generateAndStoreKeyPair } from '../../src/shared/lib/e2ee';
import { supabase } from '../../lib/supabase';

export function EncryptionKeys() {
  const { colors, font } = useTheme();
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchKey = async () => {
    const key = await getMyPublicKey();
    setPublicKey(key);
    setLoading(false);
  };

  useEffect(() => {
    fetchKey();
  }, []);

  const handleResetKeys = () => {
    Alert.alert(
      "Reset Encryption Keys?",
      "This will generate a new device keypair. You will NOT be able to decrypt past encrypted messages on this device anymore unless you have them cached in WatermelonDB. This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Reset Keys", 
          style: "destructive",
          onPress: async () => {
            setLoading(true);
            try {
              const newKey = await generateAndStoreKeyPair();
              const { data: { session } } = await supabase.auth.getSession();
              if (session?.user.id) {
                await supabase.from('users').update({ public_key: newKey }).eq('id', session.user.id);
              }
              setPublicKey(newKey);
              Alert.alert("Success", "New E2E keys generated and registered.");
            } catch (e: any) {
              Alert.alert("Error", e.message);
            }
            setLoading(false);
          }
        }
      ]
    );
  };

  return (
    <View style={{ marginBottom: 20 }}>
      <Text style={{
        color: colors.textMuted,
        fontSize: 12,
        fontFamily: 'Inter_600SemiBold',
        letterSpacing: 1.4,
        textTransform: 'uppercase',
        marginBottom: 10,
        marginLeft: 4,
      }}>
        End-to-End Encryption
      </Text>
      
      <GlassPanel borderRadius={16} contentStyle={{ padding: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <ShieldCheck color={colors.success} size={24} weight="duotone" />
          <Text style={{ ...font.bodyBold, color: colors.text, marginLeft: 8 }}>E2E Encryption Active</Text>
        </View>
        
        <Text style={{ ...font.caption, color: colors.textSecondary, marginBottom: 16, lineHeight: 20 }}>
          Your Direct Messages are secured with device-bound Curve25519 cryptography. Neither Echo nor any third party can read your conversations.
        </Text>

        <View style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)', padding: 12, borderRadius: 12, marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
            <Key color={colors.textMuted} size={16} />
            <Text style={{ ...font.caption, color: colors.textSecondary, marginLeft: 6 }}>Device Public Fingerprint</Text>
          </View>
          <Text style={{ ...font.caption, color: colors.text, fontFamily: 'Courier', opacity: 0.8 }} numberOfLines={2}>
            {loading ? "Loading..." : (publicKey ? `\${publicKey.slice(0, 16)}...\${publicKey.slice(-16)}` : "No key found")}
          </Text>
        </View>

        <TouchableOpacity 
          onPress={handleResetKeys}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, backgroundColor: colors.isDark ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.05)', borderRadius: 10 }}
        >
          <ArrowsClockwise color="#ef4444" size={18} />
          <Text style={{ ...font.captionBold, color: '#ef4444', marginLeft: 8 }}>Reset Encryption Keys</Text>
        </TouchableOpacity>
      </GlassPanel>
    </View>
  );
}
