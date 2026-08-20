const fs = require('fs');
const file = 'app/messages/[id].tsx';
let code = fs.readFileSync(file, 'utf8');

// Gatekeeper
code = code.replace(
  "const isRecipientBusy = conversation?.displayName === 'Akash' || conversation?.displayName === 'Elena';",
  "const isRecipientBusy = false; // AI Gatekeeper disabled for E2E"
);

// Polish
code = code.replace(
  "{text.trim().length > 2 && (",
  "{/* text.trim().length > 2 && ( */ false && ("
);

// Catch up
code = code.replace(
  "{unreadPartnerMsgs.length > 4 && (",
  "{/* unreadPartnerMsgs.length > 4 && ( */ false && ("
);

// Suggestions
code = code.replace(
  "{showSuggestions && suggestions.length > 0 && (",
  "{/* showSuggestions && suggestions.length > 0 && ( */ false && ("
);

// Translate context menu
// I'll search for handleTranslate in the file and just replace the boolean condition that wraps it.
// The button starts with: {msg.kind === 'text' && ( <Pressable ... handleTranslate
code = code.replace(
  /{msg\.kind === 'text' && \(\s*<Pressable style=\{\{ flexDirection: 'row', alignItems: 'center'/g,
  "{false && ( <Pressable style={{ flexDirection: 'row', alignItems: 'center'"
);

fs.writeFileSync(file, code);
