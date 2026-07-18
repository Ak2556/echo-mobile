import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, Switch, Clipboard, StyleSheet } from 'react-native';
import * as Crypto from 'expo-crypto';
import { ArrowClockwise, Copy, Check, LockKey, ShieldCheck, Warning, ShieldWarning, Key, DiceSix, Fingerprint, EyeSlash, Vault, Timer } from 'phosphor-react-native';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { MiniAppShell } from '../../components/mini-apps/MiniAppShell';
import { EdgeFeaturePanel } from '../../components/mini-apps/EdgeFeaturePanel';
import { MiniCommandDeck } from '../../components/mini-apps/MiniKit';
import { useTheme } from '../../lib/theme';

const CHARS = {
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lower: 'abcdefghijklmnopqrstuvwxyz',
  digits: '0123456789',
  symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?',
};
const AMBIGUOUS = /[O0Il1|]/g;
const PASSPHRASE_WORDS = [
  'anchor', 'atlas', 'bright', 'canyon', 'cedar', 'cobalt', 'delta', 'ember',
  'falcon', 'forest', 'harbor', 'honest', 'island', 'jupiter', 'lantern',
  'magnet', 'meadow', 'noble', 'orbit', 'pixel', 'quiet', 'river', 'signal',
  'silver', 'summit', 'timber', 'velvet', 'voyage', 'winter', 'zenith',
];
type GeneratorMode = 'password' | 'passphrase' | 'pin';

// `tone` resolves to a theme token at render so strength color adapts per theme.
function getStrength(pwd: string): { label: string; tone: 'danger' | 'warning' | 'accent' | 'success'; score: number; icon: any } {
  let s = 0;
  if (pwd.length >= 8) s++;
  if (pwd.length >= 12) s++;
  if (pwd.length >= 16) s++;
  if (/[A-Z]/.test(pwd)) s++;
  if (/[a-z]/.test(pwd)) s++;
  if (/[0-9]/.test(pwd)) s++;
  if (/[^A-Za-z0-9]/.test(pwd)) s++;
  if (s <= 2) return { label: 'Weak', tone: 'danger', score: s, icon: Warning };
  if (s <= 4) return { label: 'Fair', tone: 'warning', score: s, icon: ShieldWarning };
  if (s <= 5) return { label: 'Good', tone: 'accent', score: s, icon: ShieldCheck };
  return { label: 'Strong', tone: 'success', score: s, icon: ShieldCheck };
}

const LENGTHS = [8, 12, 16, 20, 24, 32];

function randomIndex(max: number): number {
  const bytes = Crypto.getRandomBytes(4);
  const value = ((bytes[0] << 24) >>> 0) + (bytes[1] << 16) + (bytes[2] << 8) + bytes[3];
  return value % max;
}

function shuffle(chars: string[]): string[] {
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars;
}

function generateFromPool(length: number, pools: string[]): string {
  const fullPool = pools.join('');
  const required = pools.map(pool => pool[randomIndex(pool.length)]);
  const rest = Array.from({ length: Math.max(0, length - required.length) }, () => fullPool[randomIndex(fullPool.length)]);
  return shuffle([...required, ...rest]).join('');
}

function generatePassphrase(words = 4): string {
  return Array.from({ length: words }, () => PASSPHRASE_WORDS[randomIndex(PASSPHRASE_WORDS.length)]).join('-');
}

function crackTimeLabel(pwd: string): string {
  if (!pwd) return 'None';
  const pool =
    (/[a-z]/.test(pwd) ? 26 : 0) +
    (/[A-Z]/.test(pwd) ? 26 : 0) +
    (/[0-9]/.test(pwd) ? 10 : 0) +
    (/[^A-Za-z0-9]/.test(pwd) ? 32 : 0);
  const guesses = Math.pow(Math.max(pool, 10), Math.min(pwd.length, 18));
  const seconds = guesses / 1_000_000_000;
  if (seconds < 60) return 'Seconds';
  if (seconds < 3600) return 'Minutes';
  if (seconds < 86400) return 'Hours';
  if (seconds < 31_536_000) return 'Months';
  if (seconds < 31_536_000_000) return 'Years';
  return 'Centuries';
}

function SecurityCoach({ strength, crackTime, hasSymbols, noAmbiguous, colors, accent }: {
  strength: ReturnType<typeof getStrength> | null;
  crackTime: string;
  hasSymbols: boolean;
  noAmbiguous: boolean;
  colors: any;
  accent: string;
}) {
  const items = [
    { label: 'Random', value: 'Crypto', icon: Key },
    { label: 'Guess time', value: crackTime, icon: Timer },
    { label: 'Readable', value: noAmbiguous ? 'Clean' : 'Mixed', icon: EyeSlash },
    { label: 'Policy', value: hasSymbols ? 'Strict' : 'Friendly', icon: Vault },
  ];
  return (
    <GlassPanel variant="light" borderRadius={20} contentStyle={{ padding: 15, gap: 12 }} style={{ marginBottom: 14, borderColor: `${strength ? colors[strength.tone] : accent}38` }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 42, height: 42, borderRadius: 15, backgroundColor: `${strength ? colors[strength.tone] : accent}20`, alignItems: 'center', justifyContent: 'center' }}>
          <ShieldCheck color={strength ? colors[strength.tone] : accent} size={20} weight="fill" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '900' }}>Security cockpit</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12.5, fontWeight: '600', marginTop: 2 }}>
            Generate. Copy. Rotate.
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {items.map(item => {
          const Icon = item.icon;
          return (
            <View key={item.label} style={{ width: '48.5%', minHeight: 58, borderRadius: 16, padding: 11, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Icon color={accent} size={14} weight="bold" />
                <Text style={{ color: colors.textMuted, fontSize: 10.5, fontWeight: '900', textTransform: 'uppercase' }}>{item.label}</Text>
              </View>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: '900', marginTop: 6 }} numberOfLines={1}>{item.value}</Text>
            </View>
          );
        })}
      </View>
    </GlassPanel>
  );
}

function Toggle({ label, sub, value, onChange, colors }: { label: string; sub: string; value: boolean; onChange: (v: boolean) => void; colors: any }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.glassBorder }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{label}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{sub}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ false: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', true: colors.accent }} thumbColor="#fff" ios_backgroundColor={colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'} />
    </View>
  );
}

export default function PasswordGenScreen() {
  const { colors } = useTheme();
  const accent = colors.accent;

  const [length, setLength] = useState(16);
  const [mode, setMode] = useState<GeneratorMode>('password');
  const [useUpper, setUseUpper] = useState(true);
  const [useLower, setUseLower] = useState(true);
  const [useDigits, setUseDigits] = useState(true);
  const [useSymbols, setUseSymbols] = useState(false);
  const [avoidAmbiguous, setAvoidAmbiguous] = useState(true);
  const [password, setPassword] = useState('');
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<string[]>([]);

  const generate = useCallback(() => {
    let pwd = '';
    if (mode === 'pin') {
      pwd = generateFromPool(Math.min(length, 12), [CHARS.digits]);
    } else if (mode === 'passphrase') {
      pwd = generatePassphrase(length >= 24 ? 5 : 4);
    } else {
      const pools = [
        useUpper ? CHARS.upper : '',
        useLower ? CHARS.lower : '',
        useDigits ? CHARS.digits : '',
        useSymbols ? CHARS.symbols : '',
      ]
        .filter(Boolean)
        .map(pool => avoidAmbiguous ? pool.replace(AMBIGUOUS, '') : pool);
      pwd = generateFromPool(length, pools.length > 0 ? pools : [CHARS.lower]);
    }
    setPassword(pwd);
    setHistory(h => [pwd, ...h].slice(0, 6));
    setCopied(false);
  }, [avoidAmbiguous, length, mode, useUpper, useLower, useDigits, useSymbols]);

  const copy = () => {
    Clipboard.setString(password);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
      Clipboard.setString('');
    }, 30000);
  };

  const swRaw = password ? getStrength(password) : null;
  const sw = swRaw ? { ...swRaw, color: colors[swRaw.tone] } : null;
  const StrengthIcon = sw?.icon;
  const crackTime = crackTimeLabel(password);

  return (
    <MiniAppShell title="Passwords" subtitle="Secure">
      <MiniCommandDeck
        accent={sw?.color ?? accent}
        title="Security without app switching"
        subtitle="Generate, audit, copy."
        metrics={[
          { label: 'Length', value: `${length}`, detail: 'chars' },
          { label: 'Strength', value: sw?.label ?? 'None', detail: 'current' },
          { label: 'Recent', value: `${history.length}`, detail: 'local' },
        ]}
        chips={['Strong generator', 'Copy fast', 'Rotation plan']}
      />
      <SecurityCoach
        strength={swRaw}
        crackTime={crackTime}
        hasSymbols={useSymbols || mode === 'passphrase'}
        noAmbiguous={avoidAmbiguous}
        colors={colors}
        accent={accent}
      />
      <GlassPanel variant="light" borderRadius={16} contentStyle={{ flexDirection: 'row', padding: 4, gap: 4 }} style={{ marginBottom: 14 }}>
        {([
          { key: 'password', label: 'Strong', icon: LockKey },
          { key: 'passphrase', label: 'Phrase', icon: DiceSix },
          { key: 'pin', label: 'PIN', icon: Fingerprint },
        ] as const).map(item => {
          const Icon = item.icon;
          const active = mode === item.key;
          return (
            <Pressable key={item.key} onPress={() => setMode(item.key)} style={{ flex: 1 }}>
              <View style={{ minHeight: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, backgroundColor: active ? accent : 'transparent' }}>
                <Icon color={active ? '#fff' : colors.textMuted} size={15} weight="bold" />
                <Text style={{ color: active ? '#fff' : colors.textMuted, fontSize: 12.5, fontWeight: '900' }}>{item.label}</Text>
              </View>
            </Pressable>
          );
        })}
      </GlassPanel>
      {/* Password display */}
      <GlassPanel
        variant="medium"
        borderRadius={24}
        contentStyle={{ padding: 20 }}
        style={{ marginBottom: 14, borderColor: sw ? sw.color + '55' : colors.glassBorder }}
        elevated={!!sw}
      >
        {password ? (
          <>
            <Text style={{ color: colors.text, fontSize: 17, fontFamily: 'monospace', letterSpacing: 1.5, lineHeight: 28, marginBottom: 16 }} selectable numberOfLines={2}>{password}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {StrengthIcon && <StrengthIcon color={sw!.color} size={18} weight="fill" />}
              <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)', overflow: 'hidden' }}>
                <View style={{ width: `${(sw!.score / 7) * 100}%`, height: '100%', borderRadius: 3, backgroundColor: sw!.color }} />
              </View>
              <Text style={{ color: sw!.color, fontSize: 13, fontWeight: '800', minWidth: 52 }}>{sw!.label}</Text>
            </View>
          </>
        ) : (
          <View style={{ alignItems: 'center', paddingVertical: 16 }}>
            <LockKey color={colors.textMuted} size={32} weight="duotone" />
            <Text style={{ color: colors.textMuted, fontSize: 14, marginTop: 8 }}>Tap Generate to create a secret</Text>
          </View>
        )}
      </GlassPanel>

      {/* Actions */}
      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 14 }}>
        <Pressable
          onPress={generate}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16, borderRadius: 18, backgroundColor: accent, shadowColor: accent, shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 4 } }}
        >
          <ArrowClockwise color="#fff" size={20} weight="bold" />
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Generate</Text>
        </Pressable>
        {password && (
          <Pressable
            onPress={copy}
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
              paddingHorizontal: 22, paddingVertical: 16, borderRadius: 18,
              backgroundColor: copied ? colors.success : (colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'),
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: copied ? colors.success : colors.glassBorder,
            }}
          >
            {copied ? <Check color="#fff" size={20} weight="bold" /> : <Copy color={colors.text} size={20} weight="bold" />}
            <Text style={{ color: copied ? '#fff' : colors.text, fontWeight: '700', fontSize: 16 }}>{copied ? 'Done!' : 'Copy'}</Text>
          </Pressable>
        )}
      </View>

      {/* Length */}
      <GlassPanel variant="medium" borderRadius={24} contentStyle={{ padding: 20 }} style={{ marginBottom: 14 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 }}>
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>LENGTH</Text>
          <Text style={{ color: accent, fontSize: 16, fontWeight: '800' }}>
            {mode === 'passphrase' ? `${length >= 24 ? 5 : 4} words` : `${mode === 'pin' ? Math.min(length, 12) : length} chars`}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {LENGTHS.map(l => (
            <Pressable
              key={l}
              onPress={() => setLength(l)}
              style={{
                paddingHorizontal: 18, paddingVertical: 10, borderRadius: 14,
                backgroundColor: l === length ? accent : (colors.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)'),
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: l === length ? 'transparent' : colors.glassBorder,
              }}
            >
              <Text style={{ color: l === length ? '#fff' : colors.text, fontWeight: '700', fontSize: 15 }}>{l}</Text>
            </Pressable>
          ))}
        </View>
      </GlassPanel>

      {/* Options */}
      <GlassPanel variant="medium" borderRadius={24} contentStyle={{ paddingHorizontal: 20, paddingTop: 16 }} style={{ marginBottom: 14 }}>
        <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 4 }}>CHARACTER TYPES</Text>
        <Toggle label="Uppercase" sub="A B C … Z" value={useUpper} onChange={setUseUpper} colors={colors} />
        <Toggle label="Lowercase" sub="a b c … z" value={useLower} onChange={setUseLower} colors={colors} />
        <Toggle label="Numbers" sub="0 1 2 … 9" value={useDigits} onChange={setUseDigits} colors={colors} />
        <Toggle label="Symbols" sub="! @ # $ % …" value={useSymbols} onChange={setUseSymbols} colors={colors} />
        <Toggle label="Avoid confusing chars" sub="Removes O, 0, I, l, 1, |" value={avoidAmbiguous} onChange={setAvoidAmbiguous} colors={colors} />
        <View style={{ height: 4 }} />
      </GlassPanel>

      <EdgeFeaturePanel
        appName="Passwords"
        accent={sw?.color ?? accent}
        headline="Generate, audit, then replace"
        caption="Use strength checks to plan account upgrades without sharing the secret itself."
        metrics={[
          { label: 'Length', value: `${length}` },
          { label: 'Strength', value: sw?.label ?? 'None' },
          { label: 'Recent', value: `${history.length}` },
        ]}
        prompt="Help me create a safe password rotation plan for my important accounts."
        shareText={`Password generator settings: ${length} characters, uppercase ${useUpper ? 'on' : 'off'}, lowercase ${useLower ? 'on' : 'off'}, numbers ${useDigits ? 'on' : 'off'}, symbols ${useSymbols ? 'on' : 'off'}.`}
        publishTitle="Password hygiene"
        publishBody={`I generated a ${length}-character password with ${sw?.label ?? 'unrated'} strength and reviewed my password settings without sharing the secret.`}
      />

      {/* History */}
      {history.length > 0 && (
        <GlassPanel variant="light" borderRadius={24} contentStyle={{ overflow: 'hidden' }}>
          <View style={{ paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.glassBorder }}>
            <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>RECENT</Text>
          </View>
          {history.map((h, i) => (
            <Pressable
              key={i}
              onPress={() => { setPassword(h); setCopied(false); }}
              style={{ paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: i < history.length - 1 ? StyleSheet.hairlineWidth : 0, borderBottomColor: colors.glassBorder }}
            >
              <Text style={{ color: colors.textSecondary, fontSize: 13, fontFamily: 'monospace', letterSpacing: 0.5 }} numberOfLines={1}>{h}</Text>
            </Pressable>
          ))}
        </GlassPanel>
      )}
    </MiniAppShell>
  );
}
