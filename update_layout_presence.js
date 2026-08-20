const fs = require('fs');
const file = 'app/_layout.tsx';
let code = fs.readFileSync(file, 'utf8');

// Add imports
code = code.replace(
  "import { AuthListenerProvider, useAuth, signOut } from '../lib/auth';",
  "import { AuthListenerProvider, useAuth, signOut } from '../lib/auth';\nimport { useAppStore } from '../store/useAppStore';\nimport { usePresenceTracking } from '../lib/presence';"
);

// Add to RootLayout
code = code.replace(
  "function RootLayout() {\n  const commandPaletteOpen = useCommandPalette(s => s.isOpen);",
  "function RootLayout() {\n  const userId = useAppStore(s => s.userId);\n  usePresenceTracking(userId ?? undefined);\n  const commandPaletteOpen = useCommandPalette(s => s.isOpen);"
);

fs.writeFileSync(file, code);
