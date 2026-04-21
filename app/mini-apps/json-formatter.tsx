import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Clipboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Check, Copy, Trash, CornersIn, CornersOut, Warning, CheckCircle } from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';

type ViewMode = 'formatted' | 'minified';

function colorize(json: string): { text: string; color: string }[] {
  const tokens: { text: string; color: string }[] = [];
  const re = /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?|[{}[\],:])/g;
  let last = 0, m;
  while ((m = re.exec(json)) !== null) {
    if (m.index > last) tokens.push({ text: json.slice(last, m.index), color: '#64748B' });
    const tok = m[0];
    let color = '#64748B';
    if (/^"/.test(tok)) color = /:$/.test(tok) ? '#38BDF8' : '#A3E635';
    else if (/true|false/.test(tok)) color = '#FB923C';
    else if (/null/.test(tok)) color = '#94A3B8';
    else if (/^[{}\[\]]/.test(tok)) color = '#E2E8F0';
    else if (!isNaN(Number(tok))) color = '#C084FC';
    tokens.push({ text: tok, color });
    last = m.index + tok.length;
  }
  if (last < json.length) tokens.push({ text: json.slice(last), color: '#64748B' });
  return tokens;
}

export default function JsonFormatterScreen() {
  const { colors, fontSizes } = useTheme();
  const router = useRouter();

  const [input, setInput] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('formatted');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [parsed, setParsed] = useState<object | null>(null);

  const process = (text: string) => {
    setInput(text); setError(''); setParsed(null);
    if (!text.trim()) return;
    try { setParsed(JSON.parse(text)); } catch (e: any) { setError(e.message); }
  };

  const output = parsed ? (viewMode === 'formatted' ? JSON.stringify(parsed, null, 2) : JSON.stringify(parsed)) : '';
  const copy = () => { if (!output) return; Clipboard.setString(output); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  const tokens = output ? colorize(output) : [];
  const stats = parsed ? (() => { const s = JSON.stringify(parsed); const keys = (s.match(/"[^"]+"\s*:/g)||[]).length; const sz = new Blob([s]).size; return { keys, size: sz > 1024 ? `${(sz/1024).toFixed(1)}KB` : `${sz}B` }; })() : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 }}>
        <Pressable onPress={() => router.back()} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surfaceHover, alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
          <ArrowLeft color={colors.text} size={20} weight="bold" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: fontSizes.title }}>JSON Tools</Text>
          <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>Format · validate · minify</Text>
        </View>
        {output && (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable onPress={() => setViewMode(v => v === 'formatted' ? 'minified' : 'formatted')}
              style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12, backgroundColor: colors.surfaceHover, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              {viewMode === 'formatted' ? <CornersIn color={colors.textMuted} size={15} weight="bold" /> : <CornersOut color={colors.textMuted} size={15} weight="bold" />}
              <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>{viewMode === 'formatted' ? 'Minify' : 'Format'}</Text>
            </Pressable>
            <Pressable onPress={copy} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12, backgroundColor: copied ? '#10B981' : colors.accent, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              {copied ? <Check color="#fff" size={15} weight="bold" /> : <Copy color="#fff" size={15} weight="bold" />}
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>{copied ? 'Done!' : 'Copy'}</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* Input */}
      <View style={{ marginHorizontal: 20, marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>PASTE JSON</Text>
          <Pressable onPress={() => { setInput(''); setError(''); setParsed(null); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Trash color={colors.textMuted} size={14} weight="bold" />
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>Clear</Text>
          </Pressable>
        </View>
        <TextInput
          value={input}
          onChangeText={process}
          multiline
          placeholder={'{\n  "key": "value"\n}'}
          placeholderTextColor={colors.textMuted}
          style={{
            backgroundColor: '#0D1117', borderRadius: 18, borderWidth: 1.5,
            borderColor: error ? '#EF4444' : parsed ? '#10B981' : colors.border,
            padding: 16, color: '#E2E8F0', fontSize: 13, fontFamily: 'monospace',
            height: 160, textAlignVertical: 'top', lineHeight: 20,
          }}
        />
        {/* Status */}
        {error ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 8, padding: 12, backgroundColor: '#EF444418', borderRadius: 12, borderWidth: 1, borderColor: '#EF444433' }}>
            <Warning color="#EF4444" size={16} weight="fill" />
            <Text style={{ color: '#EF4444', fontSize: 13, flex: 1, fontFamily: 'monospace' }}>{error}</Text>
          </View>
        ) : parsed ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <CheckCircle color="#10B981" size={16} weight="fill" />
            <Text style={{ color: '#10B981', fontSize: 13, fontWeight: '600' }}>Valid JSON</Text>
            {stats && <Text style={{ color: colors.textMuted, fontSize: 13 }}>· {stats.keys} keys · {stats.size}</Text>}
          </View>
        ) : null}
      </View>

      {/* Output */}
      {output ? (
        <View style={{ flex: 1, marginHorizontal: 20, marginBottom: 20 }}>
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 8 }}>OUTPUT</Text>
          <ScrollView style={{ backgroundColor: '#0D1117', borderRadius: 18, borderWidth: 1, borderColor: colors.border, flex: 1 }} contentContainerStyle={{ padding: 16 }}>
            <Text style={{ fontFamily: 'monospace', fontSize: 13, lineHeight: 22 }}>
              {tokens.map((t, i) => <Text key={i} style={{ color: t.color }}>{t.text}</Text>)}
            </Text>
          </ScrollView>
        </View>
      ) : null}
    </SafeAreaView>
  );
}
