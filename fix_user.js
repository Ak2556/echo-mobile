const fs = require('fs');
const p = 'src/features/feed/ui/UserRow.tsx';
let c = fs.readFileSync(p, 'utf8');
c = c.replace(
  "backgroundColor: 'transparent',\n\n    >",
  "backgroundColor: 'transparent',\n      }}\n    >"
);
fs.writeFileSync(p, c);
