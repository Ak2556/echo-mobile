const fs = require('fs');
const path = 'app/(tabs)/home.tsx';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(
  "import { useAppStore } from '../../store/useAppStore';",
  "import { useAppStore } from '../../store/useAppStore';\nimport { FollowingEmptyState } from '../../src/features/feed/ui/FollowingEmptyState';"
);

fs.writeFileSync(path, code);
