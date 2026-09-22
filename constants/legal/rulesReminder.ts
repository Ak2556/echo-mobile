/**
 * The quarterly rules reminder (app/legal/rules.tsx).
 *
 * IT Rules 2021, Rule 3(1)(c), as amended in 2026: at least once every three
 * months, tell users the rules, the privacy policy and the consequences of
 * breaking them, in English or a language of their choice. Plain English
 * here; the screen passes every string through ttx, so it renders in the
 * user's app language. The Terms and Privacy Policy stay authoritative.
 */

import { GRIEVANCE_OFFICER_NAME, GRIEVANCE_OFFICER_EMAIL } from './entity';

export interface RulesSection {
  heading: string;
  points: string[];
}

export const RULES_REMINDER_TITLE = "A reminder of Echo's rules";

export const RULES_REMINDER_INTRO =
  "Every three months we remind everyone of Echo's rules, how we handle your data, and what happens when the rules are broken. This is the short version.";

export const RULES_REMINDER_SECTIONS: RulesSection[] = [
  {
    heading: 'Do not post or share',
    points: [
      'Harassment, threats, bullying, stalking, or pretending to be someone else.',
      'Anything that sexualises, grooms or exploits a child.',
      'Nude or sexual images of any real person without their consent, including images made or altered with AI.',
      'Hatred against people because of religion, caste, ethnicity, sex, gender, sexual orientation or disability.',
      'Content that encourages violence, terrorism or self-harm.',
      'Information you know is false and meant to mislead.',
      "Other people's copyrighted work without permission.",
      'Scams, spam, or illegal, counterfeit or stolen goods.',
    ],
  },
  {
    heading: 'AI-generated media',
    points: [
      'If you post audio, images or video made or altered with AI so that they look real, say so when you post.',
      'Do not remove or hide a label that marks something as AI-generated.',
      'Never use AI to show a real person saying or doing something they did not, or to fake a document or event.',
    ],
  },
  {
    heading: 'What happens if the rules are broken',
    points: [
      'The content is removed or hidden.',
      'The account can be suspended or permanently closed.',
      'Where the law requires it, we report to the authorities and may share the identity of the person responsible with a victim.',
      'Breaking these rules can also be a crime under the Information Technology Act, the Bharatiya Nyaya Sanhita, the POCSO Act and other laws.',
      'You can appeal a moderation decision about your content from the notification you receive.',
    ],
  },
  {
    heading: 'Your data',
    points: [
      'Echo is for people aged 18 and over.',
      'AI features and health-data backup only work with your permission. Change either in Settings → Privacy.',
      'You can delete your account, and everything in it, from Settings → Danger Zone.',
    ],
  },
  {
    heading: 'Complaints',
    points: [
      `Grievance Officer: ${GRIEVANCE_OFFICER_NAME}, ${GRIEVANCE_OFFICER_EMAIL}.`,
      'We acknowledge complaints within 24 hours and resolve them within 7 days.',
      'Report nude, sexual or morphed images of you, or someone impersonating you, from the Report button: the post is hidden at once and handled within 2 hours.',
    ],
  },
];
