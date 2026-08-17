import { Project } from 'ts-morph';
import * as fs from 'fs';
import * as path from 'path';

const project = new Project({
  tsConfigFilePath: 'tsconfig.json',
});

const ROOT = __dirname.replace('/scripts', '');

// Pre-create destination directories
const dirs = [
  'src/shared/ui/common',
  'src/shared/lib',
  'src/shared/api',
  'src/features/auth/ui',
  'src/features/auth/lib/providers',
  'src/features/feed/ui',
  'src/features/feed/api',
  'src/features/voice/ui',
  'src/features/voice/lib'
];
dirs.forEach(d => {
  const p = path.join(ROOT, d);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

const moves = [
  // Shared Lib
  { src: 'lib/theme.ts', dest: 'src/shared/lib/theme.ts' },
  { src: 'lib/analytics.ts', dest: 'src/shared/lib/analytics.ts' },
  { src: 'lib/haptics.ts', dest: 'src/shared/lib/haptics.ts' },
  { src: 'lib/responsive.ts', dest: 'src/shared/lib/responsive.ts' },
  { src: 'lib/i18n.ts', dest: 'src/shared/lib/i18n.ts' },
  { src: 'lib/performance.ts', dest: 'src/shared/lib/performance.ts' },
  
  // Auth Feature
  { src: 'components/auth', dest: 'src/features/auth/ui' },
  
  // Feed/Social Feature
  { src: 'components/social', dest: 'src/features/feed/ui' },
  { src: 'hooks/queries/useFeed.ts', dest: 'src/features/feed/api/useFeed.ts' },
  { src: 'hooks/queries/useSupabaseSocial.ts', dest: 'src/features/feed/api/useSupabaseSocial.ts' },
  
  // Voice Feature
  { src: 'components/voice', dest: 'src/features/voice/ui' },
];

async function run() {
  console.log('Starting FSD Refactor...');
  
  for (const move of moves) {
    const srcPath = path.join(ROOT, move.src);
    const destPath = path.join(ROOT, move.dest);
    
    if (!fs.existsSync(srcPath)) {
      console.warn(`Source not found: ${srcPath}`);
      continue;
    }
    
    const isDir = fs.statSync(srcPath).isDirectory();
    
    if (isDir) {
      // Instead of dir.move() which can be buggy, we'll manually move files
      const dir = project.getDirectory(srcPath);
      if (dir) {
        // Move all files inside the directory
        for (const file of dir.getSourceFiles()) {
          const relative = path.relative(srcPath, file.getFilePath());
          const newPath = path.join(destPath, relative);
          file.move(newPath);
        }
      }
    } else {
      const sourceFile = project.getSourceFile(srcPath);
      if (sourceFile) {
        sourceFile.move(destPath);
      }
    }
  }

  console.log('Saving project changes...');
  await project.save();
  console.log('Done!');
}

run().catch(console.error);
