import { useLocalSearchParams, Redirect } from 'expo-router';
import { safeRouteId } from '../../lib/urlSafety';

// Public deep-link target for /c/<commentId>. See app/u/[username].tsx — this
// prefix was claimed and parsed but had no route to land on.
export default function CommentDeepLink() {
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const id = safeRouteId(raw);
  if (!id) return <Redirect href="/(tabs)/home" />;
  return <Redirect href={`/comments/${id}`} />;
}
