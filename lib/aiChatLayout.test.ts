import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// 2026-09-30 AI chat UI pass (reported from a screenshot).
const chat = readFileSync('app/(tabs)/chat.tsx', 'utf8');
const input = readFileSync('components/ai/ChatInput.tsx', 'utf8');

describe('AI chat layout', () => {
  it('the header is one row, with no share button in it', () => {
    expect(chat).toMatch(/const headerHeight = insets\.top \+ 54;/);
    expect(chat).not.toMatch(/<HeaderIconButton icon=\{<ShareNetwork/);
    expect(chat).toMatch(/label=\{`\$\{ttx\('AI model'\)\}/);
  });

  it('"Draft ready" keeps its layout on an inner View so the text renders', () => {
    expect(chat).toMatch(/<AnimatedPressable onPress=\{handleShare\} haptic="medium" accessibilityRole="button">/);
    expect(chat).toMatch(/\{ttx\('Draft ready'\)\}/);
  });

  it('the empty screen has one text box, the composer', () => {
    expect(chat).not.toMatch(/onPrompt\(t\('chat\.promptPrefix'\)\)/);
  });

  it('the composer clears the tab bar, not the scroll padding, and is not boxed in a GlassPanel', () => {
    expect(chat).toMatch(/paddingBottom: layout\.bottomBarClearance/);
    expect(input).not.toMatch(/<GlassPanel/);
  });
});

describe('overlays are readable on Android', () => {
  const panel = readFileSync('components/ui/GlassPanel.tsx', 'utf8');

  it('GlassPanel gives overlays a near-opaque surface where expo-blur draws nothing', () => {
    expect(panel).toMatch(/const androidOverlay = overlay && !clear && Platform\.OS === 'android';/);
  });

  it('the chat drawer and the shared action sheet are overlays', () => {
    expect(readFileSync('components/ai/SessionsDrawer.tsx', 'utf8')).toMatch(/<GlassPanel overlay/);
    const sheet = readFileSync('components/common/ActionSheet.tsx', 'utf8');
    expect(sheet.match(/<GlassPanel\n\s+overlay/g)).toHaveLength(2);
  });
});
