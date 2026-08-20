const fs = require('fs');
const file = 'app/_layout.tsx';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  "import { useAppStore } from '../store/useAppStore';",
  "import { useAppStore } from '../store/useAppStore';\nimport DatabaseProvider from '@nozbe/watermelondb/DatabaseProvider';\nimport { database } from '../src/shared/database';"
);

code = code.replace(
  "<QueryClientProvider client={queryClient}>",
  "<DatabaseProvider database={database}>\n          <QueryClientProvider client={queryClient}>"
);

code = code.replace(
  "</QueryClientProvider>",
  "</QueryClientProvider>\n          </DatabaseProvider>"
);

fs.writeFileSync(file, code);
