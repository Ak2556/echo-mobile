const fs = require('fs');
const file = 'src/features/chat/ui/VirtualizedChatFeed.tsx';
let code = fs.readFileSync(file, 'utf8');

code = code.replace("messages: Message[];", "messages: any[];");
code = code.replace("item: Message", "item: any");
code = code.replace("item.sender_id", "item.senderId");
code = code.replace("{item.text}", "{item.content}");

fs.writeFileSync(file, code);
