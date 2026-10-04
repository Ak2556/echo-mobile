import { useLocalSearchParams, Redirect } from 'expo-router';
import { safeRouteId } from '../../lib/routing/urlSafety';

// Public deep-link target. Forwards to the existing thread view.
export default function EchoDeepLink() {
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const id = safeRouteId(raw);
  if (!id) return <Redirect href="/(tabs)/home" />;
  return <Redirect href={`/thread/${id}`} />;
}
