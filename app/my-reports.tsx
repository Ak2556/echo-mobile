import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ArrowLeft, Warning, CheckCircle, Clock, MagnifyingGlass, X } from 'phosphor-react-native';
import { AnimatedPressable } from '../components/ui/AnimatedPressable';
import { GlassPanel } from '../components/ui/GlassPanel';
import { useTheme } from '../lib/theme';
import { fetchMyReports, type MyReport } from '../lib/supabaseEchoApi';

const STATUS_CONFIG = {
  open:       { label: 'Pending review',  color: '#F59E0B', Icon: Clock },
  reviewing:  { label: 'Under review',    color: '#3B82F6', Icon: MagnifyingGlass },
  resolved:   { label: 'Action taken',    color: '#10B981', Icon: CheckCircle },
  dismissed:  { label: 'No action taken', color: '#6B7280', Icon: X },
} as const;

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 30) return `${d} days ago`;
  const m = Math.floor(d / 30);
  return m === 1 ? '1 month ago' : `${m} months ago`;
}

export default function MyReportsScreen() {
  const router = useRouter();
  const { colors, font, fontSizes, radius } = useTheme();
  const [reports, setReports] = useState<MyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMyReports()
      .then(setReports)
      .catch(e => setError(e instanceof Error ? e.message : 'Could not load reports'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <AnimatedPressable onPress={() => router.back()} style={{ padding: 4, marginRight: 12 }} scaleValue={0.88} haptic="light">
          <ArrowLeft color={colors.text} size={24} />
        </AnimatedPressable>
        <Text style={[font.bodyBold, { color: colors.text, fontSize: fontSizes.title }]}>My Reports</Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : error ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={[font.body, { color: colors.textMuted, textAlign: 'center' }]}>{error}</Text>
        </View>
      ) : reports.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Warning color={colors.textMuted} size={40} />
          <Text style={[font.bodyBold, { color: colors.text, fontSize: fontSizes.title, marginTop: 16, marginBottom: 8 }]}>No reports yet</Text>
          <Text style={[font.body, { color: colors.textMuted, textAlign: 'center', fontSize: fontSizes.small }]}>
            Reports you submit will appear here along with their review status.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          <Text style={[font.body, { color: colors.textMuted, fontSize: fontSizes.caption, marginBottom: 4 }]}>
            Under the EU Digital Services Act, you have the right to know the outcome of every report you submit.
          </Text>
          {reports.map((report, i) => {
            const cfg = STATUS_CONFIG[report.status] ?? STATUS_CONFIG.open;
            const StatusIcon = cfg.Icon;
            return (
              <Animated.View key={report.id} entering={FadeInDown.delay(i * 40).duration(220)}>
                <GlassPanel borderRadius={radius.card} contentStyle={{ padding: 14 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <StatusIcon size={15} color={cfg.color} weight="bold" />
                      <Text style={[font.bodySemibold, { color: cfg.color, fontSize: fontSizes.caption }]}>{cfg.label}</Text>
                    </View>
                    <Text style={[font.body, { color: colors.textMuted, fontSize: fontSizes.caption }]}>{timeAgo(report.createdAt)}</Text>
                  </View>

                  <Text style={[font.bodySemibold, { color: colors.text, fontSize: fontSizes.small, marginBottom: 4 }]}>
                    {report.reason}
                  </Text>
                  <Text style={[font.body, { color: colors.textMuted, fontSize: fontSizes.caption }]}>
                    {report.targetType.charAt(0).toUpperCase() + report.targetType.slice(1)} report
                  </Text>

                  {report.actionTaken && (
                    <View style={{ marginTop: 10, padding: 10, backgroundColor: colors.surfaceHover, borderRadius: 8 }}>
                      <Text style={[font.bodySemibold, { color: colors.textSecondary, fontSize: fontSizes.caption, marginBottom: 2 }]}>Outcome</Text>
                      <Text style={[font.body, { color: colors.textSecondary, fontSize: fontSizes.caption, lineHeight: 18 }]}>{report.actionTaken}</Text>
                    </View>
                  )}

                  {report.reviewedAt && (
                    <Text style={[font.body, { color: colors.textMuted, fontSize: 11, marginTop: 8 }]}>
                      Reviewed {timeAgo(report.reviewedAt)}
                    </Text>
                  )}
                </GlassPanel>
              </Animated.View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
