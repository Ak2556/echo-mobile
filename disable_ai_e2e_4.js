const fs = require('fs');
const file = 'app/messages/[id].tsx';
let code = fs.readFileSync(file, 'utf8');

// Disable Rewrite chips
code = code.replace(
  "{text.trim().length > 1 && mentionResults.length === 0 && (",
  "{/* text.trim().length > 1 && mentionResults.length === 0 && ( */ false && ("
);

// Disable Quick starters
code = code.replace(
  "{!composerFocused && !editingMessage && !replyingTo && text.trim().length === 0 && (",
  "{/* !composerFocused && !editingMessage && !replyingTo && text.trim().length === 0 && ( */ false && ("
);

fs.writeFileSync(file, code);
