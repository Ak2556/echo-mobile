// What each push says. Pure, so vitest can test it; deliver.ts imports from esm.sh and cannot load under node.
//
// Voice: a dry friend who notices things. Funny at the app's expense or the
// moment's, never at the recipient's, and never untrue. A single like is not
// "going viral", a lone comment is not "everyone", so the jokes lean on tone
// rather than on claims. Content-carrying types (dm, comment, mention, quote)
// keep the real text as the body; the title carries the personality. Titles
// stay short enough for a lock screen.
//
// Moderation, appeal, report and rules notifications are deliberately NOT
// funny: they tell someone something that can affect their account.

/** Picks one variant. Injected so tests are deterministic. */
export type Pick = <T>(arr: T[]) => T;

const randomPick: Pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const REACTION_EMOJI: Record<string, string> = {
  mind_blown: '🤯',
  taking_notes: '📝',
  agree: '💯',
  disagree: '🤔',
};

/** A sealed DM reaches the server with no preview; the push must still say something. */
export function dmPushBody(preview?: string | null): string {
  const text = preview?.trim();
  return text ? text.slice(0, 140) : 'Sent you a message';
}

export function pushTitle(t: string, actorName: string, preview?: string | null, pick: Pick = randomPick): string {
  const a = actorName;
  switch (t) {
    case 'like': return pick([
      `${a} liked your echo. Taste confirmed.`,
      `${a} double-tapped your thoughts`,
      `A like from ${a}. Frame it.`,
      `${a} hit the heart. Your ego says thanks.`,
      `${a} approves. It's on the record now.`,
      `Breaking: ${a} liked your echo`,
    ]);
    case 'comment': return pick([
      `${a} left a comment. Brace yourself.`,
      `${a} has thoughts, and typed them`,
      `${a} replied. Please remain calm.`,
      `New comment from ${a}. Straight face, please.`,
      `${a} couldn’t scroll past without commenting`,
      `Plot twist: ${a} replied`,
    ]);
    case 'follow_request': return pick([
      `${a} wants to follow you. Your call.`,
      `${a} is knocking. You hold the key.`,
      `${a} asked to follow you. No pressure.`,
      `Request from ${a}. Approve, decline, or let them wait.`,
    ]);
    case 'follow_accepted': return pick([
      `${a} said yes. You're in.`,
      `${a} approved your request. Welcome.`,
      `Request approved. ${a} let you follow.`,
    ]);
    case 'follow': return pick([
      `${a} followed you. Don't let it go to your head.`,
      `New follower: ${a}. Bold choice.`,
      `${a} subscribed to your whole personality`,
      `${a} is now following you. No refunds.`,
      `${a} wants more of you. Congrats, I guess.`,
    ]);
    case 'repost': return pick([
      `${a} re-echoed you. Imitation, flattery, etc.`,
      `${a} liked your echo enough to share it`,
      `${a} put your words on their page`,
      `Your echo got a second audience, thanks to ${a}`,
    ]);
    case 'mention': return pick([
      `${a} name-dropped you`,
      `Your ears burning? ${a} mentioned you.`,
      `${a} dragged you into this. Tap to see where.`,
      `${a} tagged you. No escape now.`,
    ]);
    case 'friend_post': return pick([
      `${a} just posted. Drop everything (or don't)`,
      `${a} posted. Judge responsibly.`,
      `Fresh from ${a}. Still warm.`,
      `${a} has something to say. Again.`,
      `${a} is online and posting. Go look.`,
    ]);
    case 'friend_answer': return pick([
      `${a} answered today's question`,
      `${a} just answered`,
      `${a} took today's question seriously`,
    ]);
    case 'dm': return pick([
      `${a} slid into your DMs`,
      `${a} wrote you something. No pressure.`,
      `Message from ${a}. Reply speed is your call.`,
      `${a} sent a message. Yes, to you.`,
    ]);
    case 'reaction': {
      const emoji = preview ? REACTION_EMOJI[preview] : '';
      if (!emoji) return `${a} reacted to your echo`;
      return pick([
        `${a} reacted ${emoji}`,
        `${emoji} from ${a}. Words failed them.`,
        `${a} answered your echo in pure ${emoji}`,
      ]);
    }
    case 'bookmark': return pick([
      `${a} saved your echo. It's a keeper.`,
      `${a} bookmarked you. Museum-grade content.`,
      `${a} filed your echo under "worth keeping"`,
      `${a} wants to reread your echo. Flattering, slightly alarming.`,
    ]);
    case 'quote': return pick([
      `${a} quoted you. Hope it's flattering.`,
      `${a} took your echo and ran with it`,
      `${a} had a lot to say about your post`,
      `${a} built a whole echo on yours`,
    ]);
    case 'daily_react': {
      const emoji = preview ? preview.trim().split(/\s+/)[0] : '';
      if (!emoji) return `${a} reacted to your answer`;
      return pick([
        `${emoji} ${a} felt something about your answer`,
        `${a} is judging your answer with ${emoji}`,
      ]);
    }
    case 'personal_nudge': return pick([
      `We miss you. Mostly.`,
      `Your daily dose of Echo`,
      `Don't make us beg. Open the app.`,
      `psst... 🤫`,
      `Echo here. Still alive. Thought you should know.`,
      `This is a nudge. A gentle one. For now.`,
    ]);
    case 'report_urgent': return 'Urgent report: act within 2 hours';
    case 'rules_reminder': return "A reminder of Echo's rules";
    default: return 'Echo';
  }
}

export function pushBody(t: string, _actorName: string, preview?: string | null, pick: Pick = randomPick): string {
  switch (t) {
    // A sealed DM arrives with no preview (fn_dm_push_notify); never a blank push.
    case 'dm':
      return dmPushBody(preview);
    // Content-carrying: show the real text.
    case 'comment':
    case 'mention':
    case 'quote':
    case 'friend_post':
      return (preview ?? '').slice(0, 140);
    case 'daily_react': {
      // Drop the leading emoji token; show the answer snippet as the body.
      const parts = (preview ?? '').trim().split(/\s+/);
      return parts.slice(1).join(' ').slice(0, 140);
    }
    case 'personal_nudge':
    case 'report_urgent':
      return (preview ?? '').slice(0, 140);
    case 'rules_reminder':
      return "What's not allowed, and what happens when the rules are broken. Tap to read.";
    // Title-only social pings get a line of flavor in the body. An empty
    // variant is deliberate: not every ping needs a punchline.
    case 'like': return pick(['You cooked.', 'Certified good post.', 'One person has spoken. It counts.', 'Screenshot this for a bad day.', '']);
    case 'follow_request': return pick(['Tap to answer.', 'Approve or decline in Follow requests.', '']);
    case 'follow_accepted': return pick(['Their echoes are yours now.', 'Go see what you were missing.', '']);
    case 'follow': return pick(['Tap to see who.', 'Excellent taste, honestly.', 'Go say hi.', 'Your reach is reaching.', '']);
    case 'repost': return pick(['Your words, wider reach.', 'Going places.', 'Spreading like good gossip.', '']);
    case 'reaction': return pick(['Someone felt that.', 'That hit different.', 'No words, just vibes.', '']);
    case 'bookmark': return pick(['Saved for a rainy day.', 'Filed under keepers.', 'Someone’s a fan.', '']);
    default:
      return '';
  }
}
