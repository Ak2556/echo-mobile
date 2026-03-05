import { useLocalSearchParams, Redirect } from 'expo-router';

// Public deep-link target. Forwards to the existing thread view.
export default function EchoDeepLink() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!id) return <Redirect href="/(tabs)/discover" />;
  return <Redirect href={`/thread/${id}`} />;
}
