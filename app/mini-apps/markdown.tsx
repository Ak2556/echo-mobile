import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Trash } from 'phosphor-react-native';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { MiniAppShell } from '../../components/mini-apps/MiniAppShell';
import { EdgeFeaturePanel } from '../../components/mini-apps/EdgeFeaturePanel';
import { useTheme } from '../../lib/theme';

const SAMPLE = `# Hello, Markdown!

## Features

**Bold text** and *italic text* are easy.

> Blockquotes look great here too.

### Lists

- Item one
- Item two
- Item three

1. First
2. Second
3. Third

### Code

\`inline code\` or blocks:

\`\`\`
const hello = "world";
return hello;
\`\`\`

---

**Links** and ~~strikethrough~~ work too!
`;

function applyInline(text: string, colors: any): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|~~[^~]+~~)/g);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) return <Text key={i} style={{ fontWeight: '800', color: colors.text }}>{p.slice(2,-2)}</Text>;
    if (p.startsWith('*') && p.endsWith('*')) return <Text key={i} style={{ fontStyle: 'italic', color: colors.text }}>{p.slice(1,-1)}</Text>;
    if (p.startsWith('`') && p.endsWith('`')) return <Text key={i} style={{ fontFamily: 'monospace', backgroundColor: colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', color: colors.accent, fontSize: 13 }}>{p.slice(1,-1)}</Text>;
    if (p.startsWith('~~') && p.endsWith('~~')) return <Text key={i} style={{ textDecorationLine: 'line-through', color: colors.textMuted }}>{p.slice(2,-2)}</Text>;
    return p;
  });
}

function renderMarkdown(md: string, colors: any) {
  const lines = md.split('\n');
  const elements: React.ReactNode[] = [];
  let inCode = false, codeLines: string[] = [], codeKey = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('```')) {
      if (inCode) {
        elements.push(
          <View key={`code-${codeKey}`} style={{ backgroundColor: '#0D1117', borderRadius: 12, padding: 14, marginVertical: 6, borderWidth: 1, borderColor: '#30363D' }}>
            <Text style={{ color: '#E2E8F0', fontFamily: 'monospace', fontSize: 13, lineHeight: 20 }}>{codeLines.join('\n')}</Text>
          </View>
        );
        codeLines = []; codeKey++; inCode = false;
      } else { inCode = true; }
      continue;
    }
    if (inCode) { codeLines.push(line); continue; }
    if (line.startsWith('# ')) {
      elements.push(<Text key={i} style={{ color: colors.text, fontSize: 28, fontWeight: '800', marginTop: 12, marginBottom: 4, lineHeight: 34 }}>{line.slice(2)}</Text>);
    } else if (line.startsWith('## ')) {
      elements.push(<Text key={i} style={{ color: colors.text, fontSize: 22, fontWeight: '700', marginTop: 10, marginBottom: 3, lineHeight: 28 }}>{line.slice(3)}</Text>);
    } else if (line.startsWith('### ')) {
      elements.push(<Text key={i} style={{ color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 8, marginBottom: 2 }}>{line.slice(4)}</Text>);
    } else if (line.startsWith('> ')) {
      elements.push(
        <View key={i} style={{ borderLeftWidth: 3, borderLeftColor: colors.accent, paddingLeft: 12, marginVertical: 4 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 15, fontStyle: 'italic', lineHeight: 22 }}>{line.slice(2)}</Text>
        </View>
      );
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(
        <View key={i} style={{ flexDirection: 'row', marginVertical: 2, paddingLeft: 4 }}>
          <Text style={{ color: colors.accent, fontSize: 16, marginRight: 8, lineHeight: 22 }}>•</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 15, flex: 1, lineHeight: 22 }}>{applyInline(line.slice(2), colors)}</Text>
        </View>
      );
    } else if (/^\d+\. /.test(line)) {
      const num = line.match(/^(\d+)\. /)?.[1];
      elements.push(
        <View key={i} style={{ flexDirection: 'row', marginVertical: 2, paddingLeft: 4 }}>
          <Text style={{ color: colors.accent, fontSize: 15, marginRight: 8, fontWeight: '700', minWidth: 20, lineHeight: 22 }}>{num}.</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 15, flex: 1, lineHeight: 22 }}>{applyInline(line.replace(/^\d+\. /, ''), colors)}</Text>
        </View>
      );
    } else if (line === '---' || line === '***') {
      elements.push(<View key={i} style={{ height: 1, backgroundColor: colors.glassBorder, marginVertical: 12 }} />);
    } else if (line === '') {
      elements.push(<View key={i} style={{ height: 6 }} />);
    } else {
      elements.push(<Text key={i} style={{ color: colors.textSecondary, fontSize: 15, lineHeight: 23, marginVertical: 1 }}>{applyInline(line, colors)}</Text>);
    }
  }
  return elements;
}

export default function MarkdownScreen() {
  const { colors } = useTheme();
  const [text, setText] = useState(SAMPLE);
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');

  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const chars = text.length;

  const ClearBtn = (
    <Pressable
      onPress={() => setText('')}
      style={{
        width: 34, height: 34, borderRadius: 17,
        backgroundColor: colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
        alignItems: 'center', justifyContent: 'center',
        borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder,
      }}
    >
      <Trash color={colors.textMuted} size={16} weight="bold" />
    </Pressable>
  );

  return (
    <MiniAppShell title="Markdown" subtitle={`${words} words · ${chars} chars`} headerRight={ClearBtn} scrollable={false}>
      <View style={{ flex: 1, padding: 16 }}>
        <EdgeFeaturePanel
          appName="Markdown"
          accent={colors.accent}
          headline="Draft once, publish anywhere"
          caption="Use markdown drafts as source material for posts, notes, documentation, and Echo updates."
          metrics={[
            { label: 'Words', value: `${words}` },
            { label: 'Chars', value: `${chars}` },
            { label: 'Mode', value: tab === 'edit' ? 'Edit' : 'Preview' },
          ]}
          prompt="Review this markdown draft and turn it into a sharper public Echo or action-oriented summary."
          shareText={`Markdown draft progress: ${words} words and ${chars} characters.`}
          publishTitle="Markdown draft"
          publishBody={text}
        />

        <GlassPanel variant="light" borderRadius={16} contentStyle={{ flexDirection: 'row', padding: 4 }} style={{ marginBottom: 12 }}>
          {[{ id: 'edit', label: 'Editor' }, { id: 'preview', label: 'Preview' }].map(t => (
            <Pressable
              key={t.id}
              onPress={() => setTab(t.id as any)}
              style={{
                flex: 1, paddingVertical: 10, borderRadius: 12,
                backgroundColor: tab === t.id ? colors.isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)' : 'transparent',
                alignItems: 'center',
              }}
            >
              <Text style={{ color: tab === t.id ? colors.text : colors.textMuted, fontWeight: '700', fontSize: 14 }}>{t.label}</Text>
            </Pressable>
          ))}
        </GlassPanel>

        {tab === 'edit' ? (
          <TextInput
            value={text}
            onChangeText={setText}
            multiline
            style={{
              flex: 1,
              backgroundColor: '#0D1117', borderRadius: 20,
              borderWidth: 1, borderColor: colors.glassBorder,
              padding: 16, color: '#E2E8F0', fontSize: 14, fontFamily: 'monospace',
              lineHeight: 22, textAlignVertical: 'top',
            }}
          />
        ) : (
          <GlassPanel variant="medium" borderRadius={20} style={{ flex: 1 }} contentStyle={{ flex: 1 }}>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
              {renderMarkdown(text, colors)}
              <View style={{ height: 8 }} />
            </ScrollView>
          </GlassPanel>
        )}
      </View>
    </MiniAppShell>
  );
}
