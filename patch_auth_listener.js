const fs = require('fs');
const path = 'lib/auth/listener.ts';
let code = fs.readFileSync(path, 'utf8');

const target = `    app.setHasSeenOnboarding(true);
  }`;

const replacement = `    app.setHasSeenOnboarding(true);

    if (profile.is_private !== undefined) app.setPrivateAccount(profile.is_private);
    if (profile.dm_privacy) app.setDmPrivacy(profile.dm_privacy);
    if (profile.sensitive_content_filter !== undefined) app.setSensitiveContentFilter(profile.sensitive_content_filter);
    if (profile.personalized_notifications !== undefined) app.setPersonalizedNotifications(profile.personalized_notifications);
  }`;

if (code.includes(target)) {
  code = code.replace(target, replacement);
  fs.writeFileSync(path, code);
  console.log("Patched successfully!");
} else {
  console.log("Could not find target to replace");
}
