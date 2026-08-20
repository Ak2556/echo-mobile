const fs = require('fs');
const file = 'app/messages/[id].tsx';
let code = fs.readFileSync(file, 'utf8');

// 1. Hide the Polish button
code = code.replace(
  /{text\.trim\(\)\.length > 2 && \(\s*<Pressable\s*hitSlop=\{10\} onPress=\{.*\} style=\{.*\}>\s*<MagicWand color=\{colors\.accent\} size=\{20\} \/>\s*<\/Pressable>\s*\)}/s,
  "{/* AI Polish disabled for E2E privacy */}"
);

// 2. Hide Catch Up banner
code = code.replace(
  /\{unreadPartnerMsgs\.length > 4 && \(\s*<View style=\{.*?>\s*<Text.*?>\s*<Sparkle.*?<\/Text>\s*<Pressable.*?<\/Pressable>\s*<\/View>\s*\)\}/s,
  "{/* Catch up disabled for E2E privacy */}"
);

// 3. Hide Smart Replies (the suggestion chips)
code = code.replace(
  /\{showSuggestions && suggestions\.length > 0 && \(\s*<View style=\{.*?>\s*<ScrollView.*?<\/ScrollView>\s*<\/View>\s*\)\}/s,
  "{/* Smart replies disabled for E2E privacy */}"
);

// 4. In Context Menu, hide Translate and Summarize if they exist there
code = code.replace(
  /\{msg\.kind === 'text' && \(\s*<Pressable.*?onPress=\{.*?handleTranslate.*?\}.*?<\/Pressable>\s*\)\}/s,
  "{/* Translate disabled for E2E */}"
);

// Actually let's just make the AI functions return early or not render the UI at all.

fs.writeFileSync(file, code);
