import React from 'react';
import { Share, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Link, ShareNetwork, PaperPlaneTilt } from 'phosphor-react-native';
import { ActionSheet, ActionItem } from './ActionSheet';
import { echoUrl } from '../../lib/echoUrl';
import { tap } from '../../lib/haptics';
import { useTheme } from '../../lib/theme';
import { FeedItem } from '../../types';

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

  const actions: ActionItem[] = [
    {
      key: 'copy',
      label: 'Copy link',
      icon: <Link color={colors.text} size={20} />,
      onPress: async () => {
        const ok = await copyText(url);
        tap('success');
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
    <ActionSheet
      visible={visible}
      onClose={onClose}
      title="Share this Echo"
      subtitle={echo.editorialTitle || echo.prompt?.slice(0, 60)}
      actions={actions}
    />
  );
}
