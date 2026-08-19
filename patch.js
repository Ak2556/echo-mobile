const fs = require('fs');
const path = 'app/_layout.tsx';
let code = fs.readFileSync(path, 'utf8');

const injection = `
// Intercept all fatal JS crashes to ensure the app stays alive for the user
if (typeof ErrorUtils !== 'undefined') {
  const defaultHandler = ErrorUtils.getGlobalHandler && ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    if (isFatal) {
      // In production, swallow the crash and show a silent recovery toast
      if (!__DEV__) {
        console.warn('Recovered from fatal crash:', error);
        import('../components/ui/Toast').then(({ showToast }) => {
          showToast('Echo recovered from a hiccup', '🛡️');
        });
      } else if (defaultHandler) {
        // Let it redbox in development
        defaultHandler(error, isFatal);
      }
    }
  });
}
`;

code = code.replace('initMonitoring();', injection + '\ninitMonitoring();');
fs.writeFileSync(path, code);
