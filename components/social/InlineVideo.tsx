import React, { useState, useRef } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { useTheme } from '../../lib/theme';

interface InlineVideoProps {
  uri: string;
  caption?: string;
  /** Height of the video player in pixels — default 220 */
  height?: number;
}

function buildHtml(uri: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: #000; width: 100%; height: 100%; overflow: hidden; }
  video {
    width: 100%;
    height: 100%;
    object-fit: contain;
    background: #000;
    display: block;
  }
</style>
</head>
<body>
  <video
    src="${uri}"
    controls
    playsinline
    preload="metadata"
    controlslist="nodownload"
    style="width:100%;height:100%;"
  >
    Your browser does not support video.
  </video>
</body>
</html>
`;
}

export function InlineVideo({ uri, caption, height = 220 }: InlineVideoProps) {
  const { colors, radius, fontSizes } = useTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const webRef = useRef<WebView>(null);

  return (
    <View style={{ marginBottom: 12 }}>
      {!!caption && (
        <Text
          style={{ color: colors.text, fontSize: fontSizes.body, marginBottom: 10, lineHeight: fontSizes.body * 1.5 }}
          numberOfLines={2}
        >
          {caption}
        </Text>
      )}

      <View
        style={{
          height,
          borderRadius: radius.card,
          overflow: 'hidden',
          backgroundColor: '#000',
        }}
      >
        {!error ? (
          <>
            <WebView
              ref={webRef}
              source={{ html: buildHtml(uri) }}
              style={{ flex: 1, backgroundColor: '#000' }}
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              allowsFullscreenVideo
              javaScriptEnabled
              scrollEnabled={false}
              bounces={false}
              onLoadStart={() => setLoading(true)}
              onLoadEnd={() => setLoading(false)}
              onError={() => { setError(true); setLoading(false); }}
            />
            {loading && (
              <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' }}>
                <ActivityIndicator color="#fff" size="large" />
              </View>
            )}
          </>
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Text style={{ color: colors.textMuted, fontSize: fontSizes.body }}>Unable to load video</Text>
            <Pressable
              onPress={() => { setError(false); setLoading(true); }}
              style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.accent }}
            >
              <Text style={{ color: '#fff', fontSize: fontSizes.small, fontWeight: '600' }}>Retry</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}
