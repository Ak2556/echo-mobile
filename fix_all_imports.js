const fs = require('fs');
const path = require('path');

const dir = 'src/features/chat/ui';
const files = fs.readdirSync(dir).map(f => path.join(dir, f));

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  
  // It has a bunch of ../../../ which might be wrong. Let's fix them manually.
  content = content.replace(/from '(\.\.\/)+src\/shared\/(.*?)'/g, "from '../../../shared/$2'");
  content = content.replace(/from '(\.\.\/)+hooks\/(.*?)'/g, "from '../../../../hooks/$2'");
  content = content.replace(/from '(\.\.\/)+lib\/(.*?)'/g, "from '../../../../lib/$2'");
  content = content.replace(/from '(\.\.\/)+store\/(.*?)'/g, "from '../../../../store/$2'");
  content = content.replace(/from '(\.\.\/)+components\/(.*?)'/g, "from '../../../../components/$2'");
  content = content.replace(/from '(\.\.\/)+ui\/(.*?)'/g, "from '../../../../components/ui/$2'"); // wait, UI might be shared
  // If there are UI components in src/shared/ui:
  content = content.replace(/from '(\.\.\/)+src\/shared\/ui\/(.*?)'/g, "from '../../../shared/ui/$2'");
  
  fs.writeFileSync(file, content);
}
