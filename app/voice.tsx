import { useEffect } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useVoiceControl } from '../store/voiceControl';

/**
 * The route that means "start listening".
 *
 * Every OS entry point that should drop the user straight into talking to Echo
 * — a launcher shortcut, the assistant gesture, a shared intent — needs one
 * address to aim at. Deep links already route through expo-router, so a route
 * is the cheapest thing for them to target: no native bridge, no new module.
 *
 * It renders nothing. <VoiceControl/> owns the recorder and the panel and is
 * already mounted in the root layout, so this only has to press its button and
 * get out of the way.
 *
 * The wait matters. On a cold start this route can mount before VoiceControl's
 * effect has registered `startVoice`, and calling a null there would open the
 * app to a blank screen and no microphone — the exact failure a shortcut is
 * supposed to avoid. So it subscribes and fires the moment the function
 * appears, then hands the user to the feed.
 */
export default function VoiceEntryScreen() {
  const router = useRouter();

  useEffect(() => {
    let done = false;

    const fire = (start: (() => void) | null) => {
      if (done || !start) return;
      done = true;
      // Leave first, so the panel opens over the feed rather than over a blank
      // route the back gesture would land on.
      router.replace('/(tabs)/home');
      start();
    };

    fire(useVoiceControl.getState().startVoice);
    const unsubscribe = useVoiceControl.subscribe(s => fire(s.startVoice));

    // If VoiceControl never registers — it is gated on auth — do not strand the
    // user on an empty screen.
    const bail = setTimeout(() => {
      if (!done) {
        done = true;
        router.replace('/(tabs)/home');
      }
    }, 4000);

    return () => {
      unsubscribe();
      clearTimeout(bail);
    };
  }, [router]);

  return <View />;
}
