import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { LinearGradient } from 'expo-linear-gradient';
import { Play } from 'phosphor-react-native';

interface VideoPreviewProps {
  uri: string;
  height?: number;
  borderRadius?: number;
  onPress?: () => void;
}

export function VideoPreview({ uri, height = 260, borderRadius = 16, onPress }: VideoPreviewProps) {
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const player = useVideoPlayer(uri, p => {
    p.muted = true;
    p.loop = true;
  });

  useEffect(() => {
    setLoadState('loading');
  }, [uri]);

  useEffect(() => {
    const statusSub = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') {
        setLoadState('ready');
        player.play();
      }
      if (status === 'error') setLoadState('error');
    });
    return () => statusSub.remove();
  }, [player]);

  useEffect(() => {
    if (loadState !== 'loading') return;
    const timeout = setTimeout(() => setLoadState(s => s === 'loading' ? 'error' : s), 12000);
    return () => clearTimeout(timeout);
  }, [loadState, uri]);

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={{ height, borderRadius, overflow: 'hidden', backgroundColor: '#09090B' }}
    >
      <VideoView
        player={player}
        style={{ position: 'absolute', inset: 0 }}
        contentFit="cover"
        nativeControls={false}
      />

      {loadState === 'loading' && (
        <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' }}>
          <ActivityIndicator color="#fff" />
        </View>
      )}

      {loadState === 'error' && (
        <LinearGradient
          colors={['#3730A3', '#0A0A0A']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600' }}>
            Video preview unavailable
          </Text>
        </LinearGradient>
      )}

      <LinearGradient
        colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.72)']}
        style={{ position: 'absolute', inset: 0 }}
        pointerEvents="none"
      />

      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: 54,
          height: 54,
          marginLeft: -27,
          marginTop: -27,
          borderRadius: 27,
          backgroundColor: 'rgba(0,0,0,0.48)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Play color="#fff" size={24} weight="fill" />
      </View>
    </Pressable>
  );
}
