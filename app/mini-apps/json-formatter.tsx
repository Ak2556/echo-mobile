import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet , Clipboard } from 'react-native';
import { Check, Copy, Trash, CornersIn, CornersOut, Warning, CheckCircle } from 'phosphor-react-native';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { MiniAppShell } from '../../components/mini-apps/MiniAppShell';
import { EdgeFeaturePanel } from '../../components/mini-apps/EdgeFeaturePanel';
import { MiniCommandDeck } from '../../components/mini-apps/MiniKit';
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

function inspectJson(value: unknown): { root: string; arrays: number; objects: number } {
  let arrays = 0;
  let objects = 0;
  const walk = (node: unknown) => {
    if (Array.isArray(node)) {
      arrays += 1;
      node.forEach(walk);
      return;
    }
    if (node && typeof node === 'object') {
      objects += 1;
      Object.values(node as Record<string, unknown>).forEach(walk);
    }
  };
  walk(value);
  return {
    root: Array.isArray(value) ? 'Array' : value && typeof value === 'object' ? 'Object' : typeof value,
    arrays,
    objects,
  };
}

function JsonPulse({ accent, status, stats, inspection }: {
  accent: string;
  status: 'Empty' | 'Valid' | 'Invalid';
  stats: { keys: number; size: string } | null;
  inspection: { root: string; arrays: number; objects: number } | null;
}) {
  const { colors } = useTheme();
  const rows = [
    { label: 'Root', value: inspection?.root ?? '-' },
    { label: 'Objects', value: `${inspection?.objects ?? 0}` },
    { label: 'Arrays', value: `${inspection?.arrays ?? 0}` },
  ];
  return (
    <GlassPanel variant="light" borderRadius={22} contentStyle={{ padding: 16, gap: 13 }} style={{ marginBottom: 14, borderColor: `${accent}38` }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 42, height: 42, borderRadius: 15, backgroundColor: `${accent}20`, alignItems: 'center', justifyContent: 'center' }}>
          {status === 'Invalid' ? <Warning color={accent} size={20} weight="fill" /> : <CheckCircle color={accent} size={20} weight="fill" />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '900' }}>Data cockpit</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12.5, fontWeight: '600', marginTop: 2 }}>{status}. {stats ? `${stats.keys} keys, ${stats.size}.` : 'Paste JSON to inspect.'}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {rows.map(row => (
          <View key={row.label} style={{ flex: 1, minHeight: 58, borderRadius: 15, padding: 10, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder }}>
            <Text style={{ color: accent, fontSize: 16, fontWeight: '900' }} numberOfLines={1}>{row.value}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 10.5, fontWeight: '900', textTransform: 'uppercase', marginTop: 5 }}>{row.label}</Text>
          </View>
        ))}
      </View>
    </GlassPanel>
  );
}

export default function JsonFormatterScreen() {
  const { colors } = useTheme();
  const accent = colors.accent;

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
  const inspection = parsed ? inspectJson(parsed) : null;
  const status = error ? 'Invalid' : parsed ? 'Valid' : 'Empty';
  const statusAccent = error ? colors.danger : parsed ? colors.success : accent;

  const HeaderActions = output ? (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Pressable
        onPress={() => setViewMode(v => v === 'formatted' ? 'minified' : 'formatted')}
        style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12, backgroundColor: colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder, flexDirection: 'row', alignItems: 'center', gap: 5 }}
      >
        {viewMode === 'formatted' ? <CornersIn color={colors.textMuted} size={15} weight="bold" /> : <CornersOut color={colors.textMuted} size={15} weight="bold" />}
        <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>{viewMode === 'formatted' ? 'Minify' : 'Format'}</Text>
      </Pressable>
      <Pressable
        onPress={copy}
        style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12, backgroundColor: copied ? colors.success : accent, flexDirection: 'row', alignItems: 'center', gap: 5 }}
      >
        {copied ? <Check color="#fff" size={15} weight="bold" /> : <Copy color="#fff" size={15} weight="bold" />}
        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>{copied ? 'Done!' : 'Copy'}</Text>
      </Pressable>
    </View>
  ) : undefined;

  return (
    <MiniAppShell title="JSON Tools" subtitle="Clean" headerRight={HeaderActions}>
      <View>
        <MiniCommandDeck
          accent={statusAccent}
          title="Format data into clarity"
          subtitle="Validate, inspect, copy."
          metrics={[
            { label: 'Status', value: status, detail: 'parser' },
            { label: 'Keys', value: stats ? `${stats.keys}` : '0', detail: 'fields' },
            { label: 'Size', value: stats?.size ?? '0B', detail: viewMode },
          ]}
          chips={['Pretty print', 'Minify', 'Schema read']}
        />
        <JsonPulse accent={statusAccent} status={status} stats={stats} inspection={inspection} />
        {/* Input */}
        <View style={{ marginBottom: 12 }}>
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
              borderColor: error ? colors.danger : parsed ? colors.success : colors.glassBorder,
              padding: 16, color: '#E2E8F0', fontSize: 13, fontFamily: 'monospace',
              height: 160, textAlignVertical: 'top', lineHeight: 20,
            }}
          />
          {error ? (
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 8, padding: 12, backgroundColor: colors.danger + '18', borderRadius: 12, borderWidth: 1, borderColor: colors.danger + '33' }}>
              <Warning color={colors.danger} size={16} weight="fill" />
              <Text style={{ color: colors.danger, fontSize: 13, flex: 1, fontFamily: 'monospace' }}>{error}</Text>
            </View>
          ) : parsed ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <CheckCircle color={colors.success} size={16} weight="fill" />
              <Text style={{ color: colors.success, fontSize: 13, fontWeight: '600' }}>Valid JSON</Text>
              {stats && <Text style={{ color: colors.textMuted, fontSize: 13 }}>· {stats.keys} keys · {stats.size}</Text>}
            </View>
          ) : null}
        </View>

        {/* Output */}
        {output ? (
          <View style={{ marginBottom: 14 }}>
            <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 8 }}>OUTPUT</Text>
            <GlassPanel variant="medium" borderRadius={18}>
              <ScrollView style={{ maxHeight: 360, backgroundColor: '#0D1117', borderRadius: 18 }} contentContainerStyle={{ padding: 16 }} nestedScrollEnabled>
                <Text style={{ fontFamily: 'monospace', fontSize: 13, lineHeight: 22 }}>
                  {tokens.map((t, i) => <Text key={i} style={{ color: t.color }}>{t.text}</Text>)}
                </Text>
              </ScrollView>
            </GlassPanel>
          </View>
        ) : null}
        <EdgeFeaturePanel
          appName="JSON Tools"
          accent={error ? colors.danger : parsed ? colors.success : accent}
          headline="Debug data faster"
          caption="Validate, summarize, and turn JSON structures into implementation notes."
          metrics={[
            { label: 'Status', value: error ? 'Invalid' : parsed ? 'Valid' : 'Empty' },
            { label: 'Keys', value: stats ? `${stats.keys}` : '0' },
            { label: 'Size', value: stats?.size ?? '0B' },
          ]}
          prompt={error ? `Explain this JSON parse error and how to fix it: ${error}` : 'Summarize this JSON schema and identify the important fields.'}
          shareText={error ? `JSON error: ${error}` : output ? `Valid JSON · ${stats?.keys ?? 0} keys · ${stats?.size ?? '0B'}` : 'JSON Tools ready.'}
          publishTitle="JSON note"
          publishBody={error ? `JSON parse error: ${error}` : output ? `Validated JSON with ${stats?.keys ?? 0} keys and size ${stats?.size ?? '0B'}.` : 'Prepared JSON validation workflow.'}
        />
      </View>
    </MiniAppShell>
  );
}
