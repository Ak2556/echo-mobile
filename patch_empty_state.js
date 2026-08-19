const fs = require('fs');
const p = 'src/features/feed/ui/FollowingEmptyState.tsx';
let c = fs.readFileSync(p, 'utf8');

c = c.replace("../../src/shared/lib/theme", "../../../shared/lib/theme");
c = c.replace("../../src/features/feed/ui/UserRow", "./UserRow");
c = c.replace("../../components/ui/Avatar", "../../../../components/ui/Avatar");

fs.writeFileSync(p, c);

const home = 'app/(tabs)/home.tsx';
let hc = fs.readFileSync(home, 'utf8');
hc = hc.replace("onFollow={(userId) =>", "onFollow={(userId: string) =>");
fs.writeFileSync(home, hc);
