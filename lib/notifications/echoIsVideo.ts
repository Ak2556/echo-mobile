import { fetchRemoteEchoById } from '../supabaseEchoApi';

/** Whether this echo is a video post, for routing a tap to Flow instead of the thread. */
export async function echoIsVideo(echoId: string): Promise<boolean> {
  const echo = await fetchRemoteEchoById(echoId);
  return echo?.postType === 'video';
}
