import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { CloudSlash, WarningOctagon, Globe, ArrowsClockwise } from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';

export type ErrorKind = 'offline' | 'timeout' | 'server' | 'unknown';

interface ErrorStateProps {
  kind?: ErrorKind;
  title?: string;
  message?: string;
  onRetry?: () => void;
}

const COPY: Record<ErrorKind, { title: string; message: string }> = {
  offline: { title: "You're offline", message: 'Reconnect to a network and try again.' },
  timeout: { title: 'Took too long', message: 'The request timed out. Try again in a moment.' },
  server: { title: 'Something went wrong', message: 'Our servers are having trouble. Try again shortly.' },
  unknown: { title: 'Something went wrong', message: 'An unexpected error occurred. Pull to refresh or try again.' },
};

const ICON: Record<ErrorKind, React.ReactNode> = {
  offline: <CloudSlash color="#94A3B8" size={28} />,
  timeout: <Globe color="#F59E0B" size={28} />,
  server: <WarningOctagon color="#EF4444" size={28} />,
  unknown: <WarningOctagon color="#94A3B8" size={28} />,
};

export function classifyError(err: unknown): ErrorKind {
  if (!err) return 'unknown';
  const e = err as any;
  const msg = (e.message ?? '').toString().toLowerCase();
  if (msg.includes('network') || msg.includes('offline') || e.code === 'ENOTCONN') return 'offline';
  if (msg.includes('timeout')) return 'timeout';
  if (typeof e.status === 'number' && e.status >= 500) return 'server';
  return 'unknown';
}

export function ErrorState({ kind = 'unknown', title, message, onRetry }: ErrorStateProps) {
  const { colors } = useTheme();
  const copy = COPY[kind];

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 }}>
      <View style={{
        width: 60, height: 60, borderRadius: 30,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
        borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder,
      }}>
        {ICON[kind]}
      </View>
      <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>{title || copy.title}</Text>
      <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center', maxWidth: 280, lineHeight: 19 }}>
        {message || copy.message}
      </Text>
      {onRetry && (
        <Pressable
          onPress={onRetry}
          style={{
            marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 6,
            paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999,
            backgroundColor: colors.accent,
          }}
        >
          <ArrowsClockwise color="#fff" size={14} />
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>Try again</Text>
        </Pressable>
      )}
    </View>
  );
}
