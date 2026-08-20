const fs = require('fs');
const path = require('path');

const dir = 'src/features/chat/ui';
const files = fs.readdirSync(dir).map(f => path.join(dir, f));

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  
  // They moved from `components/chat/` (depth 2) to `src/features/chat/ui/` (depth 4)
  // Which means they are 2 levels deeper.
  // So we prepend `../../` to every import that starts with `../`
  content = content.replace(/from '(\.\.\/.*?)'/g, "from '../../$1'");
  
  fs.writeFileSync(file, content);
}

const idx = 'app/messages/index.tsx';
fs.writeFileSync(idx, fs.readFileSync(idx, 'utf8').replace("../../components/chat/ChatDetailsSidebar", "../../src/features/chat/ui/ChatDetailsSidebar"));

const tab = 'app/(tabs)/chat.tsx';
fs.writeFileSync(tab, fs.readFileSync(tab, 'utf8').replace("../../components/chat/ModelPickerSheet", "../../src/features/chat/ui/ModelPickerSheet"));

