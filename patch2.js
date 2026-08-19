const fs = require('fs');
const path = 'app/(tabs)/home.tsx';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(
  '<SectionHeader label={focusedHome ? t(\'home.fromCommunity\') : t(\'home.topConversations\')} sub={focusedHome ? undefined : t(\'home.liveNow\')} icon={<TrendUp color={colors.accent} size={16} weight="bold" />} />',
  '{(feedScope !== \'following\' || popularItems.length > 0) && <SectionHeader label={focusedHome ? t(\'home.fromCommunity\') : t(\'home.topConversations\')} sub={focusedHome ? undefined : t(\'home.liveNow\')} icon={<TrendUp color={colors.accent} size={16} weight="bold" />} />}'
);

fs.writeFileSync(path, code);
