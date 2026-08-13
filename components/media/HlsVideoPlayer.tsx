import React, { useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

interface Props {
  src: string;
  poster?: string;
  autoPlay?: boolean;
  style?: any;
}

export function HlsVideoPlayer({ src, poster, autoPlay = false, style }: Props) {
  const player = useVideoPlayer(src, player => {
    player.loop = true;
    if (autoPlay) {
      player.play();
    }
  });

  return (
    <View style={[styles.container, style]}>
      <VideoView 
        style={styles.video} 
        player={player} 
        allowsFullscreen 
        allowsPictureInPicture 
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: 'black',
    borderRadius: 8,
    overflow: 'hidden',
  },
  video: {
    width: '100%',
    height: '100%',
  },
});
