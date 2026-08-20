const fs = require('fs');
const file = 'src/shared/lib/theme.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  "const MOCK_ONLINE_USER_IDS = new Set(['u1', 'u4', 'u5', 'u7']);",
  ""
);

code = code.replace(
  "return onlineStatus && (presenceIds.has(userId) || MOCK_ONLINE_USER_IDS.has(userId));",
  "return onlineStatus && presenceIds.has(userId);"
);

fs.writeFileSync(file, code);
