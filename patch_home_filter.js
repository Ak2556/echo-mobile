const fs = require('fs');
const path = 'app/(tabs)/home.tsx';
let code = fs.readFileSync(path, 'utf8');

const target = `    if (feedScope === 'following') {
      const followingSet = new Set(followingIds);
      result = feed.filter(f => followingSet.has(f.userId));
    } else if (feedScope === 'semantic') {`;

const replacement = `    if (feedScope === 'following') {
      // Backend already filters by following_only.
      result = feed;
    } else if (feedScope === 'semantic') {`;

if (code.includes(target)) {
  code = code.replace(target, replacement);
  fs.writeFileSync(path, code);
  console.log("Patched successfully!");
} else {
  console.log("Could not find target to replace");
}
