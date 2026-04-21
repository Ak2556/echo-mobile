import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Eye, Code, Copy, Check, Trash } from 'phosphor-react-native';
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
console.log(hello);
\`\`\`

---

**Links** and ~~strikethrough~~ work too!
`;

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
      elements.push(<View key={i} style={{ height: 1, backgroundColor: colors.border, marginVertical: 12 }} />);
    } else if (line === '') {
      elements.push(<View key={i} style={{ height: 6 }} />);
    } else {
      elements.push(<Text key={i} style={{ color: colors.textSecondary, fontSize: 15, lineHeight: 23, marginVertical: 1 }}>{applyInline(line, colors)}</Text>);
    }
  }
  return elements;
}

function applyInline(text: string, colors: any): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|~~[^~]+~~)/g);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) return <Text key={i} style={{ fontWeight: '800', color: colors.text }}>{p.slice(2,-2)}</Text>;
    if (p.startsWith('*') && p.endsWith('*')) return <Text key={i} style={{ fontStyle: 'italic', color: colors.text }}>{p.slice(1,-1)}</Text>;
    if (p.startsWith('`') && p.endsWith('`')) return <Text key={i} style={{ fontFamily: 'monospace', backgroundColor: colors.surfaceHover, color: colors.accent, fontSize: 13 }}>{p.slice(1,-1)}</Text>;
    if (p.startsWith('~~') && p.endsWith('~~')) return <Text key={i} style={{ textDecorationLine: 'line-through', color: colors.textMuted }}>{p.slice(2,-2)}</Text>;
    return p;
  });
}

export default function MarkdownScreen() {
  const { colors, fontSizes } = useTheme();
  const router = useRouter();
  const [text, setText] = useState(SAMPLE);
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const [copied, setCopied] = useState(false);

  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const chars = text.length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 }}>
        <Pressable onPress={() => router.back()} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surfaceHover, alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
          <ArrowLeft color={colors.text} size={20} weight="bold" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: fontSizes.title }}>Markdown</Text>
          <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>{words} words · {chars} chars</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable onPress={() => setText('')} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceHover, alignItems: 'center', justifyContent: 'center' }}>
            <Trash color={colors.textMuted} size={16} weight="bold" />
          </Pressable>
        </View>
      </View>

      {/* Tab bar */}
      <View style={{ flexDirection: 'row', marginHorizontal: 20, marginBottom: 12, backgroundColor: colors.surfaceHover, borderRadius: 16, padding: 4 }}>
        {[{ id: 'edit', label: '✏️ Editor', Icon: Code }, { id: 'preview', label: '👁 Preview', Icon: Eye }].map(t => (
          <Pressable key={t.id} onPress={() => setTab(t.id as any)} style={{ flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: tab === t.id ? colors.surface : 'transparent', alignItems: 'center', borderWidth: tab === t.id ? 1 : 0, borderColor: colors.border }}>
            <Text style={{ color: tab === t.id ? colors.text : colors.textMuted, fontWeight: '700', fontSize: 14 }}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* Content */}
      {tab === 'edit' ? (
        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          style={{
            flex: 1, marginHorizontal: 20, marginBottom: 20,
            backgroundColor: '#0D1117', borderRadius: 20, borderWidth: 1, borderColor: colors.border,
            padding: 16, color: '#E2E8F0', fontSize: 14, fontFamily: 'monospace',
            lineHeight: 22, textAlignVertical: 'top',
          }}
        />
      ) : (
        <ScrollView style={{ flex: 1, marginHorizontal: 20, marginBottom: 20, backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border }} contentContainerStyle={{ padding: 20 }}>
          {renderMarkdown(text, colors)}
          <View style={{ height: 8 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
