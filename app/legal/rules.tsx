import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { useTheme } from '../../src/shared/lib/theme';
import { useI18n } from '../../src/shared/lib/i18n';
import {
  RULES_REMINDER_INTRO,
  RULES_REMINDER_SECTIONS,
  RULES_REMINDER_TITLE,
} from '../../constants/legal/rulesReminder';

const LINKS: { label: string; href: string }[] = [
  { label: 'Terms of Service', href: '/terms' },
  { label: 'Privacy Policy', href: '/privacy' },
  { label: 'Child Safety Standards', href: '/legal/child-safety' },
];

/**
 * The quarterly rules reminder (IT Rules 3(1)(c)). Opened from the
 * 'rules_reminder' notification. Rendered through the reactive translator so
 * it reads in the user's chosen app language, which is what the rule asks for.
 */
export default function RulesReminderScreen() {
  const { colors, fontSizes } = useTheme();
  const { tt, textDirection, rowDirection } = useI18n();
  const router = useRouter();

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={tt(RULES_REMINDER_TITLE)} />
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 48, width: '100%', maxWidth: 720, alignSelf: 'center' }}>
        <Text style={[{ color: colors.textSecondary, fontSize: fontSizes.body, lineHeight: 22 }, textDirection]}>
          {tt(RULES_REMINDER_INTRO)}
        </Text>

        {RULES_REMINDER_SECTIONS.map(section => (
          <View key={section.heading} style={{ marginTop: 22 }}>
            <Text style={[{ color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: 8 }, textDirection]}>
              {tt(section.heading)}
            </Text>
            {section.points.map(point => (
              <View key={point} style={[{ marginBottom: 6 }, rowDirection]}>
                <Text style={{ color: colors.textMuted, fontSize: fontSizes.body, lineHeight: 22, width: 16 }}>•</Text>
                <Text style={[{ color: colors.textSecondary, fontSize: fontSizes.body, lineHeight: 22, flex: 1 }, textDirection]}>
                  {tt(point)}
                </Text>
              </View>
            ))}
          </View>
        ))}

        <Text style={[{ color: colors.textMuted, fontSize: fontSizes.small, lineHeight: 20, marginTop: 22 }, textDirection]}>
          {tt('This is a summary. The full documents below are what apply. To read this in another language, change it in Settings → Language.')}
        </Text>
        <View style={{ marginTop: 12, gap: 4 }}>
          {LINKS.map(link => (
            <Pressable
              key={link.href}
              onPress={() => router.push(link.href as Href)}
              accessibilityRole="link"
              style={{ paddingVertical: 10 }}
            >
              <Text style={{ color: colors.accent, fontSize: fontSizes.body, fontWeight: '600' }}>{tt(link.label)}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
