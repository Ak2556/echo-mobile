import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { LinearGradient } from 'expo-linear-gradient';
import { Eye, Play } from 'phosphor-react-native';

interface VideoPreviewProps {
  uri: string;
  height?: number;
  borderRadius?: number;
  onPress?: () => void;
  viewCount?: number;
}

function formatViewCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

export function VideoPreview({ uri, height = 260, borderRadius = 16, onPress, viewCount }: VideoPreviewProps) {
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const player = useVideoPlayer(uri, p => { p.muted = true; p.loop = true; });

  useEffect(() => { setLoadState('loading'); }, [uri]);

  useEffect(() => {
    const sub = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') { setLoadState('ready'); player.play(); }
      if (status === 'error') setLoadState('error');
    });
    return () => sub.remove();
  }, [player]);

  useEffect(() => {
    if (loadState !== 'loading') return;
    const t = setTimeout(() => setLoadState(s => s === 'loading' ? 'error' : s), 12000);
    return () => clearTimeout(t);
  }, [loadState, uri]);

  return (
    <Pressable onPress={onPress} disabled={!onPress} style={{ height, borderRadius, overflow: 'hidden', backgroundColor: '#09090B' }}>
      <VideoView player={player} style={{ position: 'absolute', inset: 0 }} contentFit="cover" nativeControls={false} />

      {loadState === 'loading' && (
        <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' }}>
          <ActivityIndicator color="#fff" />
        </View>
      )}

      {loadState === 'error' && (
        <LinearGradient colors={['#3730A3', '#0A0A0A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600' }}>Video preview unavailable</Text>
        </LinearGradient>
      )}

      <LinearGradient colors={['rgba(0,0,0,0.0)', 'rgba(0,0,0,0.72)']} style={{ position: 'absolute', inset: 0 }} pointerEvents="none" />

      <View pointerEvents="none" style={{ position: 'absolute', top: '50%', left: '50%', width: 54, height: 54, marginLeft: -27, marginTop: -27, borderRadius: 27, backgroundColor: 'rgba(0,0,0,0.48)', alignItems: 'center', justifyContent: 'center' }}>
        <Play color="#fff" size={24} weight="fill" />
      </View>

      {viewCount !== undefined && (
        <View pointerEvents="none" style={{ position: 'absolute', bottom: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.65)' }}>
          <Eye size={13} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>{formatViewCount(viewCount)}</Text>
        </View>
      )}
    </Pressable>
  );
}
