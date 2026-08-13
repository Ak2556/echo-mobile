import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Clipboard } from 'react-native';
import Animated, { 
  FadeIn, FadeOut, SlideInDown, SlideOutDown, 
  useSharedValue, useAnimatedStyle, withSpring, withTiming, 
  withSequence
} from 'react-native-reanimated';
import * as Crypto from 'expo-crypto';
import { tap } from '../../lib/haptics';
import { BlurView } from 'expo-blur';
import { 
  ArrowClockwise, Copy, Check, LockKey, ShieldCheck, Warning, ShieldWarning, 
  DiceSix, Fingerprint, CreditCard, FileText, 
  IdentificationCard, Plus, Globe, Backspace, X
} from 'phosphor-react-native';

import { GlassPanel } from '../../components/ui/GlassPanel';
import { MiniAppShell } from '../../components/mini-apps/MiniAppShell';
import { EdgeFeaturePanel } from '../../components/mini-apps/EdgeFeaturePanel';
import { MiniCommandDeck } from '../../components/mini-apps/MiniKit';
import { useTheme } from '../../lib/theme';
import { ttx } from '../../lib/i18n';

// --- MOCK DATA ---
const VAULT_ITEMS = [
  { id: '1', type: 'login', title: 'Google', subtitle: 'user@gmail.com', icon: Globe, strength: 'success', secret: 'Sup3rS3cr3t!99', hasTotp: true },
  { id: '2', type: 'login', title: 'GitHub', subtitle: 'dev_user', icon: Globe, strength: 'accent', secret: 'github_p@ssw0rd', hasTotp: true },
  { id: '3', type: 'card', title: 'Chase Sapphire', subtitle: '•••• 4242', icon: CreditCard, strength: 'warning', secret: '4242 4242 4242 4242', hasTotp: false },
  { id: '4', type: 'note', title: 'Wifi Network', subtitle: 'Home Setup', icon: FileText, strength: 'danger', secret: 'password123', hasTotp: false },
  { id: '5', type: 'identity', title: 'SSN', subtitle: 'Social Security', icon: IdentificationCard, strength: 'success', secret: '000-00-0000', hasTotp: false },
];

// --- GENERATOR LOGIC ---
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

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// --- UI COMPONENTS ---

function PinPadOverlay({ onUnlock, colors, accent }: { onUnlock: () => void; colors: any; accent: string }) {
  const { radius } = useTheme();
  const [pin, setPin] = useState('');
  const shakeOffset = useSharedValue(0);

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeOffset.value }]
  }));

  const handlePress = (digit: string) => {
    tap('light');
    if (pin.length < 4) {
      const newPin = pin + digit;
      setPin(newPin);
      if (newPin.length === 4) {
        if (newPin === '0000') {
          tap('success');
          setTimeout(onUnlock, 300);
        } else {
          tap('error');
          shakeOffset.value = withSequence(
            withTiming(10, { duration: 50 }),
            withTiming(-10, { duration: 50 }),
            withTiming(10, { duration: 50 }),
            withTiming(0, { duration: 50 })
          );
          setTimeout(() => setPin(''), 400);
        }
      }
    }
  };

  const handleBackspace = () => {
    tap('light');
    setPin(prev => prev.slice(0, -1));
  };

  return (
    <Animated.View exiting={FadeOut.duration(300)} style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg, zIndex: 100, justifyContent: 'center', alignItems: 'center' }]}>
      <BlurView intensity={100} tint={colors.isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      <View style={{ alignItems: 'center', marginBottom: 50 }}>
        <LockKey color={accent} size={42} weight="duotone" style={{ marginBottom: 20 }} />
        <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800', marginBottom: 30 }}>{ttx("Enter PIN")}</Text>
        <Animated.View style={[{ flexDirection: 'row', gap: 20 }, shakeStyle]}>
          {[0,1,2,3].map(i => (
            <View key={i} style={{ width: 16, height: 16, borderRadius: radius.sm, backgroundColor: i < pin.length ? accent : colors.surfaceHover, borderWidth: i < pin.length ? 0 : 1, borderColor: colors.glassBorder }} />
          ))}
        </Animated.View>
        <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 20 }}>Default PIN is 0000</Text>
      </View>
      
      <View style={{ width: 280, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 20 }}>
        {['1','2','3','4','5','6','7','8','9','','0','back'].map((key, idx) => {
          if (key === '') return <View key={idx} style={{ width: 75, height: 75 }} />;
          if (key === 'back') return (
            <Pressable key={idx} onPress={handleBackspace} style={{ width: 75, height: 75, borderRadius: radius.full, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.surfaceHover }}>
               <Backspace color={colors.text} size={28} weight="duotone" /> 
            </Pressable>
          );
          return (
            <Pressable key={idx} onPress={() => handlePress(key)} style={{ width: 75, height: 75, borderRadius: radius.full, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.surfaceHover }}>
              <Text style={{ color: colors.text, fontSize: 28, fontWeight: '600' }}>{key}</Text>
            </Pressable>
          )
        })}
      </View>
    </Animated.View>
  );
}

function TotpWidget({ colors, accent }: { colors: any; accent: string }) {
  const { radius } = useTheme();
  const [code, setCode] = useState('000 000');
  const [progress, setProgress] = useState(1);

  useEffect(() => {
    const updateCode = () => {
      const c = Math.floor(100000 + Math.random() * 900000).toString();
      setCode(`${c.slice(0,3)} ${c.slice(3)}`);
    };
    updateCode();
    
    let time = 30;
    const interval = setInterval(() => {
      time -= 1;
      if (time <= 0) {
        time = 30;
        updateCode();
      }
      setProgress(time / 30);
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface, padding: 12, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder, marginTop: 12 }}>
      <View>
        <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '800', marginBottom: 4, letterSpacing: 0.5 }}>{ttx("ONE-TIME PASSWORD")}</Text>
        <Text style={{ color: colors.text, fontSize: 22, fontFamily: 'monospace', fontWeight: '900', letterSpacing: 2 }}>{code}</Text>
      </View>
      <View style={{ width: 36, height: 36, borderRadius: radius.full, borderWidth: 3, borderColor: progress < 0.2 ? colors.danger : accent, justifyContent: 'center', alignItems: 'center', opacity: 0.8 }}>
        <Text style={{ color: progress < 0.2 ? colors.danger : accent, fontSize: 10, fontWeight: '900' }}>{Math.ceil(progress * 30)}s</Text>
      </View>
    </View>
  );
}

function VaultItem({ item, colors, accent }: { item: typeof VAULT_ITEMS[0], colors: any, accent: string }) {
  const { radius } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const Icon = item.icon;
  const scale = useSharedValue(1);

  const handlePressIn = () => { scale.value = withSpring(0.98); };
  const handlePressOut = () => { scale.value = withSpring(1); };
  const toggleExpand = () => {
    tap('light');
    setExpanded(!expanded);
    if (expanded) setRevealed(false);
  };

  const copy = () => {
    tap('success');
    Clipboard.setString(item.secret);
  };

  return (
    <AnimatedPressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={toggleExpand}
      style={[{ marginBottom: 10 }, useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))]}
    >
      <GlassPanel variant="light" borderRadius={radius.card} contentStyle={{ padding: 16 }} elevated={expanded}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.surfaceHover, justifyContent: 'center', alignItems: 'center' }}>
            <Icon color={accent} size={24} weight="duotone" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>{item.title}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 2 }}>{item.subtitle}</Text>
          </View>
          <View style={{ width: 8, height: 8, borderRadius: radius.sm, backgroundColor: colors[item.strength as keyof typeof colors] as string || colors.textMuted }} />
        </View>

        {expanded && (
          <Animated.View entering={FadeIn} style={{ marginTop: 16, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.glassBorder }}>
            <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '800', marginBottom: 8, letterSpacing: 0.5 }}>{ttx("SECRET")}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Pressable 
                onPress={() => {
                  tap('light');
                  setRevealed(!revealed);
                }} 
                style={{ flex: 1, height: 44, backgroundColor: colors.surfaceHover, borderRadius: radius.md, justifyContent: 'center', paddingHorizontal: 12, overflow: 'hidden' }}
              >
                {!revealed && (
                  <BlurView intensity={30} tint={colors.isDark ? 'dark' : 'light'} style={[StyleSheet.absoluteFill, { zIndex: 10 }]} />
                )}
                <Text style={{ color: colors.text, fontSize: 15, fontFamily: 'monospace', opacity: revealed ? 1 : 0.3 }} numberOfLines={1}>
                  {item.secret}
                </Text>
              </Pressable>
              <Pressable onPress={copy} style={{ width: 44, height: 44, borderRadius: radius.md, backgroundColor: accent, justifyContent: 'center', alignItems: 'center' }}>
                <Copy color={colors.bg} size={20} weight="bold" />
              </Pressable>
            </View>

            {item.hasTotp && <TotpWidget colors={colors} accent={accent} />}
          </Animated.View>
        )}
      </GlassPanel>
    </AnimatedPressable>
  );
}

function Toggle({ label, sub, value, onChange, colors }: { label: string; sub: string; value: boolean; onChange: (v: boolean) => void; colors: any }) {
  const { radius } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.glassBorder }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{label}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{sub}</Text>
      </View>
      <Pressable
        onPress={() => {
          tap('light');
          onChange(!value);
        }}
        style={{ width: 50, height: 30, borderRadius: radius.full, backgroundColor: value ? colors.accent : colors.surfaceHover, justifyContent: 'center', paddingHorizontal: 2 }}
      >
        <Animated.View style={[{ width: 26, height: 26, borderRadius: radius.full, backgroundColor: colors.text, elevation: 2 }, { transform: [{ translateX: value ? 20 : 0 }] }]} />
      </Pressable>
    </View>
  );
}

// --- MAIN SCREENS ---

export default function PasswordGenScreen() {
  const { colors, radius } = useTheme();
  const accent = colors.accent;
  
  const [unlocked, setUnlocked] = useState(false);
  const [showGenerator, setShowGenerator] = useState(false);

  // Generator State
  const [length, setLength] = useState(16);
  const [mode, setMode] = useState<GeneratorMode>('password');
  const [useUpper, setUseUpper] = useState(true);
  const [useLower, setUseLower] = useState(true);
  const [useDigits, setUseDigits] = useState(true);
  const [useSymbols, setUseSymbols] = useState(false);
  const [avoidAmbiguous, setAvoidAmbiguous] = useState(true);
  const [password, setPassword] = useState('');
  const [copied, setCopied] = useState(false);

  const generate = useCallback(() => {
    tap('medium');
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
      ].filter(Boolean).map(pool => avoidAmbiguous ? pool.replace(AMBIGUOUS, '') : pool);
      pwd = generateFromPool(length, pools.length > 0 ? pools : [CHARS.lower]);
    }
    setPassword(pwd);
    setCopied(false);
  }, [avoidAmbiguous, length, mode, useUpper, useLower, useDigits, useSymbols]);

  const copyToClipboard = () => {
    tap('success');
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

  return (
    <MiniAppShell title={ttx("Vault")} subtitle={ttx("Secure")}>
      {!unlocked && <PinPadOverlay onUnlock={() => setUnlocked(true)} colors={colors} accent={accent} />}
      
      <View style={{ flex: 1, opacity: unlocked ? 1 : 0 }}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
          <Animated.View entering={FadeIn}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text style={{ color: colors.text, fontSize: 24, fontWeight: '900' }}>{ttx("Vault")}</Text>
            </View>

            <MiniCommandDeck
              accent={accent}
              title={ttx("Vault Status")}
              subtitle={ttx("End-to-end encrypted locally.")}
              metrics={[
                { label: 'Total', value: `${VAULT_ITEMS.length}`, detail: 'items' },
                { label: 'Weak', value: '1', detail: 'found' },
              ]}
              chips={['Analyze Security', 'Sync']}
            />

            <View style={{ height: 16 }} />

            {VAULT_ITEMS.map((item) => (
              <VaultItem key={item.id} item={item} colors={colors} accent={accent} />
            ))}
          </Animated.View>
        </ScrollView>
        
        {/* FAB */}
        <Pressable
          onPress={() => {
            tap('medium');
            setShowGenerator(true);
          }}
          style={{ position: 'absolute', bottom: 30, right: 20, width: 60, height: 60, borderRadius: radius.full, backgroundColor: accent, justifyContent: 'center', alignItems: 'center', elevation: 10 }}
        >
          <Plus color={colors.bg} size={28} weight="bold" />
        </Pressable>
      </View>
      
      {showGenerator && (
        <Animated.View
          entering={SlideInDown.duration(400).springify()}
          exiting={SlideOutDown.duration(300)}
          style={[StyleSheet.absoluteFill, { zIndex: 200, justifyContent: 'flex-end' }]}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowGenerator(false)}>
            <BlurView intensity={30} style={StyleSheet.absoluteFill} tint={colors.isDark ? 'dark' : 'light'} />
          </Pressable>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: 20, paddingBottom: 40, maxHeight: '90%', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder }}>
            <View style={{ width: 40, height: 5, borderRadius: radius.sm, backgroundColor: colors.glassBorder, alignSelf: 'center', marginBottom: 20 }} />
            
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800' }}>{ttx("Generate Password")}</Text>
              <Pressable onPress={() => setShowGenerator(false)} style={{ width: 32, height: 32, borderRadius: radius.full, backgroundColor: colors.surfaceHover, justifyContent: 'center', alignItems: 'center' }}>
                <X color={colors.text} size={16} weight="bold" />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <GlassPanel variant="light" borderRadius={radius.card} contentStyle={{ flexDirection: 'row', padding: 4, gap: 4 }} style={{ marginBottom: 14 }}>
                {([
                  { key: 'password', label: 'Strong', icon: LockKey },
                  { key: 'passphrase', label: 'Phrase', icon: DiceSix },
                  { key: 'pin', label: 'PIN', icon: Fingerprint },
                ] as const).map(item => {
                  const Icon = item.icon;
                  const active = mode === item.key;
                  return (
                    <Pressable 
                      key={item.key} 
                      onPress={() => {
                        tap('light');
                        setMode(item.key);
                      }} 
                      style={{ flex: 1 }}
                    >
                      <View style={{ minHeight: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, backgroundColor: active ? accent : 'transparent' }}>
                        <Icon color={active ? colors.bg : colors.textMuted} size={15} weight="bold" />
                        <Text style={{ color: active ? colors.bg : colors.textMuted, fontSize: 12.5, fontWeight: '900' }}>{item.label}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </GlassPanel>

              {/* Password display */}
              <GlassPanel
                variant="medium"
                borderRadius={radius.xl}
                contentStyle={{ padding: 20 }}
                style={{ marginBottom: 14, borderColor: sw ? sw.color : colors.glassBorder }}
                elevated={!!sw}
              >
                {password ? (
                  <>
                    <Text style={{ color: colors.text, fontSize: 17, fontFamily: 'monospace', letterSpacing: 1.5, lineHeight: 28, marginBottom: 16 }} selectable numberOfLines={2}>{password}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      {StrengthIcon && <StrengthIcon color={sw!.color} size={18} weight="fill" />}
                      <View style={{ flex: 1, height: 6, borderRadius: radius.sm, backgroundColor: colors.surfaceHover, overflow: 'hidden' }}>
                        <Animated.View style={{ width: `${(sw!.score / 7) * 100}%`, height: '100%', borderRadius: radius.sm, backgroundColor: sw!.color }} />
                      </View>
                      <Text style={{ color: sw!.color, fontSize: 13, fontWeight: '800', minWidth: 52 }}>{sw!.label}</Text>
                    </View>
                  </>
                ) : (
                  <View style={{ alignItems: 'center', paddingVertical: 16 }}>
                    <LockKey color={colors.textMuted} size={32} weight="duotone" />
                    <Text style={{ color: colors.textMuted, fontSize: 14, marginTop: 8 }}>{ttx("Tap Generate to create a secret")}</Text>
                  </View>
                )}
              </GlassPanel>

              {/* Actions */}
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 14 }}>
                <Pressable
                  onPress={generate}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16, borderRadius: radius.xl, backgroundColor: accent }}
                >
                  <ArrowClockwise color={colors.bg} size={20} weight="bold" />
                  <Text style={{ color: colors.bg, fontWeight: '700', fontSize: 16 }}>{ttx("Generate")}</Text>
                </Pressable>
                {password ? (
                  <Pressable
                    onPress={copyToClipboard}
                    style={{
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                      paddingHorizontal: 22, paddingVertical: 16, borderRadius: radius.xl,
                      backgroundColor: copied ? colors.success : colors.surfaceHover,
                      borderWidth: StyleSheet.hairlineWidth,
                      borderColor: copied ? colors.success : colors.glassBorder,
                    }}
                  >
                    {copied ? <Check color={colors.bg} size={20} weight="bold" /> : <Copy color={colors.text} size={20} weight="bold" />}
                    <Text style={{ color: copied ? colors.bg : colors.text, fontWeight: '700', fontSize: 16 }}>{copied ? 'Done!' : 'Copy'}</Text>
                  </Pressable>
                ) : null}
              </View>

              {/* Length */}
              <GlassPanel variant="medium" borderRadius={radius.xl} contentStyle={{ padding: 20 }} style={{ marginBottom: 14 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>{ttx("LENGTH")}</Text>
                  <Text style={{ color: accent, fontSize: 16, fontWeight: '800' }}>
                    {mode === 'passphrase' ? `${length >= 24 ? 5 : 4} words` : `${mode === 'pin' ? Math.min(length, 12) : length} chars`}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {[8, 12, 16, 20, 24, 32].map(l => (
                    <Pressable
                      key={l}
                      onPress={() => {
                        tap('selection');
                        setLength(l);
                      }}
                      style={{
                        paddingHorizontal: 18, paddingVertical: 10, borderRadius: radius.card,
                        backgroundColor: l === length ? accent : colors.surfaceHover,
                        borderWidth: StyleSheet.hairlineWidth,
                        borderColor: l === length ? 'transparent' : colors.glassBorder,
                      }}
                    >
                      <Text style={{ color: l === length ? colors.bg : colors.text, fontWeight: '700', fontSize: 15 }}>{l}</Text>
                    </Pressable>
                  ))}
                </View>
              </GlassPanel>

              {/* Options */}
              <GlassPanel variant="medium" borderRadius={radius.xl} contentStyle={{ paddingHorizontal: 20, paddingTop: 16 }} style={{ marginBottom: 14 }}>
                <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 4 }}>{ttx("CHARACTER TYPES")}</Text>
                <Toggle label={ttx("Uppercase")} sub="A B C … Z" value={useUpper} onChange={setUseUpper} colors={colors} />
                <Toggle label={ttx("Lowercase")} sub="a b c … z" value={useLower} onChange={setUseLower} colors={colors} />
                <Toggle label={ttx("Numbers")} sub="0 1 2 … 9" value={useDigits} onChange={setUseDigits} colors={colors} />
                <Toggle label={ttx("Symbols")} sub="! @ # $ % …" value={useSymbols} onChange={setUseSymbols} colors={colors} />
                <Toggle label={ttx("Avoid confusing chars")} sub="Removes O, 0, I, l, 1, |" value={avoidAmbiguous} onChange={setAvoidAmbiguous} colors={colors} />
                <View style={{ height: 4 }} />
              </GlassPanel>
            </ScrollView>
          </View>
        </Animated.View>
      )}
    </MiniAppShell>
  );
}
