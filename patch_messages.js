const fs = require('fs');
const file = 'app/messages/[id].tsx';
let code = fs.readFileSync(file, 'utf8');

// 1. Add imports
const imports = `import withObservables from '@nozbe/with-observables';
import { database } from '../../src/shared/database';
import MessageModel from '../../src/shared/database/models/Message';
import { Q } from '@nozbe/watermelondb';
import { VirtualizedChatFeed } from '../../src/features/chat/ui/VirtualizedChatFeed';\n`;

code = code.replace("import { FlashList } from '@shopify/flash-list';", imports + "import { FlashList } from '@shopify/flash-list';");

// 2. Rename export function DMView to function DMViewInner
code = code.replace(/export function DMView\(/g, "function DMViewInner(");

// 3. Add wmMessages prop to DMViewInner
code = code.replace(
  /function DMViewInner\([\s\S]*?\)\: JSX\.Element \{/,
  (match) => match.replace("}: DMViewProps", ", wmMessages = [] }: DMViewProps & { wmMessages?: MessageModel[] }")
);

// 4. Comment out useRemoteMessages and replace messages mapping
code = code.replace(
  "const { data: remoteMessagePages, fetchNextPage, hasNextPage } = useRemoteMessages(remote ? id : undefined);",
  "// const { data: remoteMessagePages, fetchNextPage, hasNextPage } = useRemoteMessages(remote ? id : undefined);\n  const hasNextPage = false;\n  const fetchNextPage = () => {};"
);
code = code.replace(
  "const remoteMessages = [...(remoteMessagePages?.pages ?? [])].reverse().flat();",
  "// const remoteMessages = [...(remoteMessagePages?.pages ?? [])].reverse().flat();"
);

// We need to carefully replace the messages array
const messagesMatch = code.match(/const messages: NormalizedMessage\[\] = remote[\s\S]*?\] as DirectMessage\[\]\)?;/m);
if (messagesMatch) {
  const newMessagesBlock = `
  const messages: NormalizedMessage[] = wmMessages.map(m => ({
    id: m.id,
    senderId: m.senderId,
    content: m.content,
    createdAt: new Date(m.createdAt).toISOString(),
    isRead: true, 
    deletedAt: null,
    editedAt: null,
    kind: 'text',
    sharedEchoId: null,
    sharedEchoTitle: null,
    sharedEchoPreview: null,
    sharedEchoAuthor: null,
    mediaUrl: null,
    linkUrl: null,
    linkTitle: null,
    linkSubtitle: null,
    contactUserId: null,
    contactUsername: null,
    contactDisplayName: null,
    contactAvatarColor: null,
    contactAvatarUrl: null,
    replyToId: null,
    replyToContent: null,
    replyToSenderId: null,
    replyToKind: null,
    replyToDeleted: false,
    reactions: [],
  }));
`;
  code = code.replace(messagesMatch[0], newMessagesBlock);
}

// 5. Replace memoizedFlashList rendering
code = code.replace(
  "{memoizedFlashList}",
  "<VirtualizedChatFeed messages={messages} currentUserId={myId} colors={colors} />"
);

// 6. Export enhance HOC
const hocStr = `
const enhance = withObservables(['id'], ({ id }: DMViewProps) => ({
  wmMessages: database.collections.get<MessageModel>('messages').query(
    Q.where('thread_id', id || ''),
    Q.sortBy('created_at', Q.asc)
  ).observe()
}));

export const DMView = enhance(DMViewInner);
`;

code = code + "\n" + hocStr;

fs.writeFileSync(file, code);
