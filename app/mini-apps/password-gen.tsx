import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, Switch, Clipboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, ArrowClockwise, Copy, Check, ShieldCheck, Warning, ShieldWarning } from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';

const CHARS = {
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lower: 'abcdefghijklmnopqrstuvwxyz',
  digits: '0123456789',
  symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?',
};

function getStrength(pwd: string): { label: string; color: string; score: number; icon: any } {
  let s = 0;
  if (pwd.length >= 8) s++;
  if (pwd.length >= 12) s++;
  if (pwd.length >= 16) s++;
  if (/[A-Z]/.test(pwd)) s++;
  if (/[a-z]/.test(pwd)) s++;
  if (/[0-9]/.test(pwd)) s++;
  if (/[^A-Za-z0-9]/.test(pwd)) s++;
  if (s <= 2) return { label: 'Weak', color: '#EF4444', score: s, icon: Warning };
  if (s <= 4) return { label: 'Fair', color: '#F59E0B', score: s, icon: ShieldWarning };
  if (s <= 5) return { label: 'Good', color: '#3B82F6', score: s, icon: ShieldCheck };
  return { label: 'Strong', color: '#10B981', score: s, icon: ShieldCheck };
}

const LENGTHS = [8, 12, 16, 20, 24, 32];

export default function PasswordGenScreen() {
  const { colors, radius, fontSizes } = useTheme();
  const router = useRouter();

  const [length, setLength] = useState(16);
  const [useUpper, setUseUpper] = useState(true);
  const [useLower, setUseLower] = useState(true);
  const [useDigits, setUseDigits] = useState(true);
  const [useSymbols, setUseSymbols] = useState(false);
  const [password, setPassword] = useState('');
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<string[]>([]);

  const generate = useCallback(() => {
    let pool = (useUpper ? CHARS.upper : '') + (useLower ? CHARS.lower : '') + (useDigits ? CHARS.digits : '') + (useSymbols ? CHARS.symbols : '');
    if (!pool) pool = CHARS.lower;
    let pwd = '';
    for (let i = 0; i < length; i++) pwd += pool[Math.floor(Math.random() * pool.length)];
    setPassword(pwd);
    setHistory(h => [pwd, ...h].slice(0, 6));
    setCopied(false);
  }, [length, useUpper, useLower, useDigits, useSymbols]);

  const copy = () => {
    Clipboard.setString(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sw = password ? getStrength(password) : null;
  const StrengthIcon = sw?.icon;

  const Toggle = ({ label, sub, value, onChange }: { label: string; sub: string; value: boolean; onChange: (v: boolean) => void }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{label}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{sub}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ false: colors.surfaceHover, true: colors.accent }} thumbColor="#fff" ios_backgroundColor={colors.surfaceHover} />
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 }}>
        <Pressable onPress={() => router.back()} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surfaceHover, alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
          <ArrowLeft color={colors.text} size={20} weight="bold" />
        </Pressable>
        <View>
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: fontSizes.title }}>Passwords</Text>
          <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>Secure generator</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} showsVerticalScrollIndicator={false}>
        {/* Password display */}
        <View style={{
          backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1.5,
          borderColor: sw ? sw.color + '55' : colors.border, padding: 20,
          shadowColor: sw?.color ?? 'transparent', shadowOpacity: 0.15, shadowRadius: 16, shadowOffset: { width: 0, height: 4 },
        }}>
          {password ? (
            <>
              <Text style={{ color: colors.text, fontSize: 17, fontFamily: 'monospace', letterSpacing: 1.5, lineHeight: 28, marginBottom: 16 }} selectable numberOfLines={2}>{password}</Text>
              {/* Strength bar */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {StrengthIcon && <StrengthIcon color={sw!.color} size={18} weight="fill" />}
                <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.surfaceHover, overflow: 'hidden' }}>
                  <View style={{ width: `${(sw!.score / 7) * 100}%`, height: '100%', borderRadius: 3, backgroundColor: sw!.color }} />
                </View>
                <Text style={{ color: sw!.color, fontSize: 13, fontWeight: '800', minWidth: 52 }}>{sw!.label}</Text>
              </View>
            </>
          ) : (
            <View style={{ alignItems: 'center', paddingVertical: 16 }}>
              <Text style={{ color: colors.textMuted, fontSize: 32 }}>🔐</Text>
              <Text style={{ color: colors.textMuted, fontSize: 14, marginTop: 8 }}>Tap Generate to create a password</Text>
            </View>
          )}
        </View>

        {/* Actions */}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Pressable
            onPress={generate}
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16, borderRadius: 18, backgroundColor: colors.accent, shadowColor: colors.accent, shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 4 } }}
          >
            <ArrowClockwise color="#fff" size={20} weight="bold" />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Generate</Text>
          </Pressable>
          {password && (
            <Pressable
              onPress={copy}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 22, paddingVertical: 16, borderRadius: 18, backgroundColor: copied ? '#10B981' : colors.surfaceHover, borderWidth: 1.5, borderColor: copied ? '#10B981' : colors.border }}
            >
              {copied ? <Check color="#fff" size={20} weight="bold" /> : <Copy color={colors.text} size={20} weight="bold" />}
              <Text style={{ color: copied ? '#fff' : colors.text, fontWeight: '700', fontSize: 16 }}>{copied ? 'Done!' : 'Copy'}</Text>
            </Pressable>
          )}
        </View>

        {/* Length */}
        <View style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.border, padding: 20 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 }}>
            <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>LENGTH</Text>
            <Text style={{ color: colors.accent, fontSize: 16, fontWeight: '800' }}>{length} chars</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {LENGTHS.map(l => (
              <Pressable
                key={l}
                onPress={() => setLength(l)}
                style={{ paddingHorizontal: 18, paddingVertical: 10, borderRadius: 14, backgroundColor: l === length ? colors.accent : colors.surfaceHover, borderWidth: 1.5, borderColor: l === length ? colors.accent : colors.border }}
              >
                <Text style={{ color: l === length ? '#fff' : colors.text, fontWeight: '700', fontSize: 15 }}>{l}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Options */}
        <View style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 20, paddingTop: 16 }}>
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 4 }}>CHARACTER TYPES</Text>
          <Toggle label="Uppercase" sub="A B C … Z" value={useUpper} onChange={setUseUpper} />
          <Toggle label="Lowercase" sub="a b c … z" value={useLower} onChange={setUseLower} />
          <Toggle label="Numbers" sub="0 1 2 … 9" value={useDigits} onChange={setUseDigits} />
          <Toggle label="Symbols" sub="! @ # $ % …" value={useSymbols} onChange={setUseSymbols} />
          <View style={{ height: 4 }} />
        </View>

        {/* History */}
        {history.length > 0 && (
          <View style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
            <View style={{ paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>RECENT</Text>
            </View>
            {history.map((h, i) => (
              <Pressable key={i} onPress={() => { setPassword(h); setCopied(false); }}
                style={{ paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: i < history.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
                <Text style={{ color: colors.textSecondary, fontSize: 13, fontFamily: 'monospace', letterSpacing: 0.5 }} numberOfLines={1}>{h}</Text>
              </Pressable>
            ))}
          </View>
        )}
        <View style={{ height: 8 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
