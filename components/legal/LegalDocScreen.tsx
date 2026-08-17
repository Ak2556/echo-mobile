import React from 'react';
import { View, ScrollView, StyleSheet, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Markdown from 'react-native-markdown-display';
import { ScreenHeader } from '../ui/ScreenHeader';
import { useTheme } from '../../src/shared/lib/theme';

interface LegalDocScreenProps {
  title: string;
  /** Human-readable "last updated" string, shown under the title. */
  updated?: string;
  /** The document body, in Markdown. */
  markdown: string;
}

// Themed markdown styles for long-form legal copy — adapted from the AI chat
// bubble's buildMarkdownStyles (components/ai/MessageBubble.tsx), tuned for
// readable body text plus the tables the privacy policy uses.
function buildLegalStyles(colors: any) {
  const text = 15;
  return StyleSheet.create({
    body: { color: colors.text, fontSize: text, lineHeight: text * 1.6 },
    heading1: { color: colors.text, fontSize: text * 1.55, fontWeight: '800', marginTop: 8, marginBottom: 10, letterSpacing: -0.3 },
    heading2: { color: colors.text, fontSize: text * 1.2, fontWeight: '700', marginTop: 20, marginBottom: 6 },
    heading3: { color: colors.text, fontSize: text * 1.02, fontWeight: '700', marginTop: 12, marginBottom: 4 },
    paragraph: { marginTop: 0, marginBottom: 12 },
    bullet_list: { marginBottom: 12 },
    ordered_list: { marginBottom: 12 },
    list_item: { color: colors.text, fontSize: text, lineHeight: text * 1.55 },
    strong: { fontWeight: '700' },
    em: { fontStyle: 'italic' },
    link: { color: colors.accent, textDecorationLine: 'underline' },
    blockquote: { borderLeftColor: colors.accent, borderLeftWidth: 3, paddingLeft: 12, marginLeft: 0, opacity: 0.85, marginVertical: 8 },
    hr: { backgroundColor: colors.border, height: StyleSheet.hairlineWidth, marginVertical: 18 },
    code_inline: {
      color: colors.accent,
      backgroundColor: colors.surfaceHover,
      borderRadius: 4,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      fontSize: text * 0.9,
    },
    // Tables (used by the privacy policy).
    table: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: 8, marginVertical: 10 },
    thead: { backgroundColor: colors.surface },
    th: { padding: 8, fontWeight: '700', color: colors.text },
    tr: { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
    td: { padding: 8, color: colors.text, fontSize: text * 0.95 },
  });
}

// The canonical constants lead with an H1 title and a "**Last updated:**"
// line (kept for the docs/*.md mirror). The ScreenHeader already shows both,
// so drop them from the rendered body to avoid a duplicate title.
function stripLeadingTitle(md: string): string {
  return md
    .replace(/^\s*#\s.*\n+/, '')
    .replace(/^\*\*Last updated:\*\*.*\n+/, '')
    .replace(/^---\n+/, '')
    .trimStart();
}

/**
 * Renders a bundled legal document (Privacy Policy, Terms, EU-rep) as a
 * scrollable markdown screen. Doubles as the public web page for the same
 * route via the Expo static web export.
 */
export function LegalDocScreen({ title, updated, markdown }: LegalDocScreenProps) {
  const { colors } = useTheme();
  const styles = buildLegalStyles(colors);
  const body = stripLeadingTitle(markdown);
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={title} subtitle={updated ? `Updated ${updated}` : undefined} />
      <ScrollView
        contentContainerStyle={{ padding: 18, paddingBottom: 48, width: '100%', maxWidth: 720, alignSelf: 'center' }}
        showsVerticalScrollIndicator
      >
        <Markdown style={styles}>{body}</Markdown>
        <View style={{ height: 8 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
