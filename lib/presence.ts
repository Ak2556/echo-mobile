import { useEffect } from 'react';
import { create } from 'zustand';
import { supabase } from './supabase';
import { useAppStore } from '../store/useAppStore';

// Real online presence over Supabase Realtime. One shared topic; every
// signed-in client tracks itself keyed by user id, and everyone derives the
// online set from presence sync events. Entries drop automatically on
// disconnect, so "online" here means "app open right now".
//
// The channel is a MODULE-LEVEL SINGLETON with ref-counting: supabase-js
// returns the same channel instance for a topic, so a second mount calling
// .on('presence') after the first subscribe() throws ("cannot add callbacks
// after subscribe"). Inbox and thread screens are stacked simultaneously —
// they must share one subscription, not race to create two.
//
// The `onlineStatus` privacy setting gates BOTH directions: when off, this
// client neither broadcasts its presence nor renders anyone else's
// (see isUserOnline in lib/theme.ts).

interface PresenceState {
  onlineIds: Set<string>;
  setOnlineIds: (ids: Set<string>) => void;
}

export const usePresenceStore = create<PresenceState>(set => ({
  onlineIds: new Set(),
  setOnlineIds: onlineIds => set({ onlineIds }),
}));

let activeChannel: ReturnType<typeof supabase.channel> | null = null;
let activeUid: string | null = null;
let subscribed = false;
let refs = 0;

function teardown() {
  if (activeChannel) void supabase.removeChannel(activeChannel);
  activeChannel = null;
  activeUid = null;
  subscribed = false;
  usePresenceStore.getState().setOnlineIds(new Set());
}

function ensureChannel(uid: string, share: boolean) {
  if (activeChannel && activeUid === uid) {
    // Already live — just reconcile whether we announce ourselves.
    if (subscribed) {
      if (share) void activeChannel.track({ at: Date.now() }).catch(() => {});
      else void activeChannel.untrack().catch(() => {});
    }
    return;
  }

  if (activeChannel) teardown();

  activeUid = uid;
  const channel = supabase.channel('online-users', {
    config: { presence: { key: uid } },
  });
  channel
    .on('presence', { event: 'sync' }, () => {
      usePresenceStore.getState().setOnlineIds(new Set(Object.keys(channel.presenceState())));
    })
    .subscribe(status => {
      if (status === 'SUBSCRIBED') {
        subscribed = true;
        if (share) void channel.track({ at: Date.now() }).catch(() => {});
      }
    });
  activeChannel = channel;
}

/**
 * Subscribe to the shared presence topic and (if allowed) announce this user.
 * Safe to mount from multiple screens at once — all mounts share the single
 * underlying channel; the last unmount tears it down.
 */
export function usePresenceTracking(myUserId: string | undefined) {
  const shareOnlineStatus = useAppStore(s => s.onlineStatus);

  useEffect(() => {
    if (!myUserId || !process.env.EXPO_PUBLIC_SUPABASE_URL) return;

    refs++;
    ensureChannel(myUserId, shareOnlineStatus);

    return () => {
      refs--;
      // Defer so push-navigation (unmount+mount in one frame) doesn't churn
      // the socket; only tear down when nobody is left after the frame.
      setTimeout(() => {
        if (refs <= 0 && activeChannel) teardown();
      }, 50);
    };
  }, [myUserId, shareOnlineStatus]);
}
