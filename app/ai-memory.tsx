import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { ArrowLeft, Database, Trash } from 'phosphor-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { AnimatedPressable } from '../components/ui/AnimatedPressable';
import { GlassPanel } from '../components/ui/GlassPanel';
import { showToast } from '../components/ui/Toast';
import { clearMemory, forgetPreference, loadMemory, MemoryItem } from '../lib/aiMemory';
import { useTheme } from '../lib/theme';

export default function AIMemoryScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { colors, radius, fontSizes, animation } = theme;
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setItems(await loadMemory());
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const removeItem = (item: MemoryItem) => {
    Alert.alert('Forget memory?', `${item.key}: ${item.value}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Forget',
        style: 'destructive',
        onPress: async () => {
          await forgetPreference({ id: item.id });
          await refresh();
          showToast('Memory removed');
        },
      },
    ]);
  };

  const removeAll = () => {
    if (!items.length) return;
    Alert.alert('Clear AI memory?', 'This removes all remembered preferences stored on this device.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          const count = await clearMemory();
          await refresh();
          showToast(`${count} memories cleared`);
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={{ flex: 1 }}>
        <View style={styles.header}>
          <AnimatedPressable
            onPress={() => router.back()}
            style={[styles.iconButton, { backgroundColor: colors.surfaceHover, borderRadius: radius.md }]}
          >
            <ArrowLeft color={colors.text} size={22} />
          </AnimatedPressable>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: fontSizes.title, fontWeight: '700' }}>AI Memory</Text>
            <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, marginTop: 2 }}>
              Preferences Echo can reuse in future local actions.
            </Text>
          </View>
          <AnimatedPressable
            onPress={removeAll}
            disabled={!items.length}
            style={[
              styles.iconButton,
              {
                backgroundColor: items.length ? colors.dangerMuted : colors.surfaceHover,
                borderRadius: radius.md,
                opacity: items.length ? 1 : 0.45,
              },
            ]}
          >
            <Trash color={items.length ? colors.danger : colors.textMuted} size={20} />
          </AnimatedPressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Animated.View entering={animation(FadeInDown.delay(60).springify())}>
            <GlassPanel borderRadius={radius.card} contentStyle={{ padding: 16 }}>
              <View style={styles.summaryRow}>
                <View style={[styles.summaryIcon, { backgroundColor: colors.surfaceHover, borderRadius: radius.md }]}>
                  <Database color={colors.accent} size={22} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: fontSizes.body, fontWeight: '700' }}>
                    {items.length} remembered {items.length === 1 ? 'preference' : 'preferences'}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, marginTop: 2 }}>
                    Stored only on this device.
                  </Text>
                </View>
              </View>
            </GlassPanel>
          </Animated.View>

          <Animated.View entering={animation(FadeInDown.delay(120).springify())}>
            {loading ? (
              <Text style={[styles.emptyText, { color: colors.textMuted, fontSize: fontSizes.body }]}>Loading memory...</Text>
            ) : items.length === 0 ? (
              <GlassPanel borderRadius={radius.card} contentStyle={{ padding: 20, alignItems: 'center' }}>
                <Text style={{ color: colors.text, fontSize: fontSizes.body, fontWeight: '700' }}>No memory saved</Text>
                <Text style={[styles.emptyText, { color: colors.textMuted, fontSize: fontSizes.caption }]}>
                  Echo will only remember a preference after you confirm the memory tool card.
                </Text>
              </GlassPanel>
            ) : (
              <View style={{ gap: 10 }}>
                {items.map(item => (
                  <GlassPanel key={item.id} borderRadius={radius.card} contentStyle={{ padding: 14 }}>
                    <View style={styles.memoryRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontSize: fontSizes.body, fontWeight: '700' }}>{item.key}</Text>
                        <Text style={{ color: colors.textSecondary, fontSize: fontSizes.body, marginTop: 4 }}>{item.value}</Text>
                        <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, marginTop: 8 }}>
                          Saved {new Date(item.createdAt).toLocaleDateString()}
                        </Text>
                      </View>
                      <AnimatedPressable
                        onPress={() => removeItem(item)}
                        style={[styles.deleteButton, { backgroundColor: colors.dangerMuted, borderRadius: radius.md }]}
                      >
                        <Trash color={colors.danger} size={18} />
                      </AnimatedPressable>
                    </View>
                  </GlassPanel>
                ))}
              </View>
            )}
          </Animated.View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  iconButton: {
    alignItems: 'center',
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  content: {
    gap: 16,
    padding: 20,
    paddingBottom: 40,
  },
  summaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  summaryIcon: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  memoryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  deleteButton: {
    alignItems: 'center',
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  emptyText: {
    lineHeight: 20,
    textAlign: 'center',
  },
});
