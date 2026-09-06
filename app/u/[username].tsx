import { useLocalSearchParams, Redirect } from 'expo-router';
import { safeRouteId } from '../../lib/urlSafety';

// Public deep-link target for /u/<username>. app.config.js claims this prefix
// for App Links and Universal Links, and parseEchoUniversalLink resolves it,
// but until now no route existed — a verified link that landed nowhere.
export default function UserDeepLink() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const id = safeRouteId(username);
  if (!id) return <Redirect href="/(tabs)/home" />;
  return <Redirect href={`/user/${id}`} />;
}
