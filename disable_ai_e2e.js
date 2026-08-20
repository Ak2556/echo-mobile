const fs = require('fs');
const file = 'app/messages/[id].tsx';
let code = fs.readFileSync(file, 'utf8');

// 1. Hide Polish (Magic Wand)
code = code.replace(
  /{text\.trim\(\)\.length > 2 && \(\s*<Pressable hitSlop=\{10\} onPress=\{.*\} style=\{.*\}>\s*<MagicWand color=\{colors\.accent\} size=\{20\} \/>\s*<\/Pressable>\s*\)}/,
  "{/* text.trim().length > 2 && ( <Pressable... AI disabled for E2E /> ) */}"
);

// 2. Hide Catch Up
code = code.replace(
  /\{unreadPartnerMsgs\.length > 4 && \(/,
  "{/* Catch up disabled for E2E */ false && ("
);

// 3. Hide Smart Replies Suggestions
code = code.replace(
  /\{showSuggestions && suggestions\.length > 0 && \(/,
  "{/* Smart replies disabled for E2E */ false && showSuggestions && suggestions.length > 0 && ("
);

// 4. Hide Translate from Context Menu
code = code.replace(
  /\{msg\.kind === 'text' && \(\s*<Pressable style=\{.*\} onPress=\{.*handleTranslate.*\}[\s\S]*?<\/Pressable>\s*\)\}/,
  "{/* Translate disabled for E2E */}"
);

// 5. Disable AI Gatekeeper
code = code.replace(
  /const isRecipientBusy = conversation\?\.displayName === 'Akash' \|\| conversation\?\.displayName === 'Elena';/,
  "const isRecipientBusy = false; // AI Gatekeeper disabled for E2E"
);

fs.writeFileSync(file, code);
