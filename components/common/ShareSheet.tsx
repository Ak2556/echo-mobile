import React, { useRef } from 'react';
import { Share, Alert, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Link, ShareNetwork, PaperPlaneTilt, Image as ImageIcon } from 'phosphor-react-native';
import { ActionSheet, ActionItem } from './ActionSheet';
import { echoUrl } from '../../lib/echoUrl';
import { tap } from '../../lib/haptics';
import { useTheme } from '../../lib/theme';
import { FeedItem } from '../../types';
import { ShareableEchoCard } from '../social/ShareableEchoCard';
import { shareEchoAsImage } from '../../lib/shareEchoImage';
import { track } from '../../lib/analytics';

interface ShareSheetProps {
  visible: boolean;
  onClose: () => void;
  echo: FeedItem;
}

async function copyText(text: string) {
  try {
    if (typeof navigator !== 'undefined' && (navigator as any)?.clipboard?.writeText) {
      await (navigator as any).clipboard.writeText(text);
      return true;
    }
  } catch {}
  return false;
}

export function ShareSheet({ visible, onClose, echo }: ShareSheetProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const url = echoUrl(echo.id);
  // Hidden card lives off-screen; ref is what react-native-view-shot captures.
  const cardRef = useRef<View>(null);

  const actions: ActionItem[] = [
    {
      key: 'image',
      label: 'Share as image',
      icon: <ImageIcon color={colors.accent} size={20} weight="duotone" />,
      onPress: () => shareEchoAsImage(cardRef, echo.id),
    },
    {
      key: 'copy',
      label: 'Copy link',
      icon: <Link color={colors.text} size={20} />,
      onPress: async () => {
        const ok = await copyText(url);
        tap('success');
        track('echo_shared', { method: 'copy_link' });
        if (!ok) Alert.alert('Link', url);
      },
    },
    {
      key: 'system',
      label: 'Share via…',
      icon: <ShareNetwork color={colors.text} size={20} />,
      onPress: async () => {
        try {
          await Share.share({ message: url, url });
          track('echo_shared', { method: 'system' });
        } catch {}
      },
    },
    {
      key: 'dm',
      label: 'Send to a chat',
      icon: <PaperPlaneTilt color={colors.text} size={20} />,
      onPress: () => router.push({ pathname: '/messages', params: { share: echo.id } as any }),
    },
  ];

  return (
    <>
      {/* Off-screen capture target. collapsable=false in the card itself keeps
          it in the native view hierarchy. Positioned far off-screen so it's
          never visible but always layoutable. */}
      {visible && (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', top: -10000, left: -10000, opacity: 0 }}
        >
          <ShareableEchoCard ref={cardRef} item={echo} />
        </View>
      )}
      <ActionSheet
        visible={visible}
        onClose={onClose}
        title="Share this Echo"
        subtitle={echo.editorialTitle || echo.prompt?.slice(0, 60)}
        actions={actions}
      />
    </>
  );
}
