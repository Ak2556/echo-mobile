const fs = require('fs');
const file = 'lib/supabaseEchoApi.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  "uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,",
  "uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,\n    sessionType: FileSystem.FileSystemSessionType.BACKGROUND,"
);

fs.writeFileSync(file, code);
