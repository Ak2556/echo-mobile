const fs = require('fs');
const file = 'app/messages/[id].tsx';
let code = fs.readFileSync(file, 'utf8');

// Hide the Echo reply and Translate block in context menu
code = code.replace(
  "{isText && (",
  "{/* isText && ( */ false && ("
);

// We still need to hide the Magic Wand for text selection (if it hasn't been hidden yet)
code = code.replace(
  /{text\.trim\(\)\.length > 2 && \(\s*<Pressable hitSlop=\{10\} onPress=\{.*\} style=\{.*\}>\s*<MagicWand/s,
  "{/* AI Magic Wand disabled */ false && ( <MagicWand"
);
// Actually, earlier the magic wand was: {text.trim().length > 2 && ( <Pressable hitSlop={10} onPress={() => Keyboard.dismiss()} ...

fs.writeFileSync(file, code);
