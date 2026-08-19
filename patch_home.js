const fs = require('fs');
const path = 'app/(tabs)/home.tsx';
let code = fs.readFileSync(path, 'utf8');

// Add import
code = code.replace(
  "import { useAppStore } from '../store/useAppStore';",
  "import { useAppStore } from '../store/useAppStore';\nimport { FollowingEmptyState } from '../src/features/feed/ui/FollowingEmptyState';"
);

// Replace empty state
const oldEmptyState = `              feedScope === 'following' ? (
                <View style={{ paddingTop: 24, paddingHorizontal: layout.gutter }}>
                  <Text style={[font.bodyBold, { color: colors.text, fontSize: fontSizes.title, lineHeight: lineHeights.title, marginBottom: 4 }]}>
                    {t('home.followingQuiet')}
                  </Text>
                  <Text style={[font.bodyMedium, { color: colors.textMuted, fontSize: fontSizes.small, lineHeight: lineHeights.small, marginBottom: 20 }]}>
                    {t('home.followingQuietBody')}
                  </Text>
                  {remote && suggestedUsers.length > 0 ? (
                    <View style={{ marginHorizontal: -layout.gutter }}>
                      <Text style={[font.bodyBold, { color: colors.textMuted, fontSize: fontSizes.small, lineHeight: lineHeights.small, marginBottom: 12, paddingHorizontal: layout.gutter }]}>
                        {t('home.suggestedPeople')}
                      </Text>
                      {suggestedUsers.map(user => (
                        <UserRow
                          key={user.id}
                          user={user}
                          onPress={() => router.push(\`/user/\${user.id}\`)}
                          showFollowButton
                          onFollowPress={() => followMut.mutate({ userId: user.id, follow: true })}
                        />
                      ))}
                    </View>
                  ) : (
                    <Pressable
                      onPress={() => router.push('/(tabs)/explore')}
                      style={{ backgroundColor: colors.accent, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9, alignSelf: 'flex-start' }}
                    >
                      <Text style={[font.bodyBold, { color: '#fff', fontSize: fontSizes.small, lineHeight: lineHeights.small }]}>{t('home.findPeople')}</Text>
                    </Pressable>
                  )}
                </View>
              ) :`;

const newEmptyState = `              feedScope === 'following' ? (
                <FollowingEmptyState 
                  suggestedUsers={remote ? suggestedUsers : []} 
                  onFollow={(userId) => followMut.mutate({ userId, follow: true })} 
                />
              ) :`;

code = code.replace(oldEmptyState, newEmptyState);

fs.writeFileSync(path, code);
