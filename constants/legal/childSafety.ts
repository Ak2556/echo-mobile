/**
 * Child Safety Standards (rendered by app/legal/child-safety.tsx, public at
 * downloadecho.com/legal/child-safety).
 *
 * Google Play requires social apps to publish standards against child sexual
 * abuse and exploitation (CSAE), offer an in-app way to report it, and name a
 * contact. The in-app report reason is 'Child sexual abuse or exploitation'
 * (lib/reportReasons.ts); it hides the reported post at once and alerts every
 * moderator (20260922130000_launch_legal_gaps.sql).
 */

import { ENTITY_NAME, GRIEVANCE_OFFICER_NAME, GRIEVANCE_OFFICER_EMAIL } from './entity';
import { MINIMUM_AGE } from './ageGate';

export const CHILD_SAFETY_UPDATED = 'September 22, 2026';

export const CHILD_SAFETY_MD = `# Child Safety Standards

**Last updated:** ${CHILD_SAFETY_UPDATED}

Echo has zero tolerance for child sexual abuse and exploitation (CSAE). This page sets out what is prohibited, how to report it, and what we do when we receive a report.

---

## 1. Who can use Echo

You must be at least **${MINIMUM_AGE}** to hold an Echo account. We ask for a date of birth at sign-up and enforce the minimum on our servers. Accounts we find belong to someone under ${MINIMUM_AGE} are closed.

---

## 2. What is prohibited

On any part of Echo, including posts, comments, direct messages, group chats, profiles, marketplace listings and uploaded media:

- **Child sexual abuse material (CSAM)** of any kind, real, drawn, or generated or altered by AI.
- **Sexualising minors**, including sexual comments about a child and content that presents children in a sexual way.
- **Grooming**: building contact with a minor for sexual purposes, or asking a minor for images, meetings or personal details.
- **Sextortion** and any threat to share intimate images of a minor.
- **Trafficking** or any offer, request or advertisement involving the sexual exploitation of a child.
- **Links, contacts or instructions** that lead to any of the above.

---

## 3. How to report

**In the app:** open the post, comment, message, group or profile, choose **Report**, and select **Child sexual abuse or exploitation**. A reported post is **hidden immediately** while we review it, and our moderators are alerted at once.

**By email:** write to our designated child-safety contact:

> **${GRIEVANCE_OFFICER_NAME}**
> **${GRIEVANCE_OFFICER_EMAIL}**

**If a child is in immediate danger**, contact the police first (dial **112** in India). You can also report to India's National Cyber Crime Reporting Portal at **cybercrime.gov.in**.

---

## 4. What we do

- **Remove** the content and **permanently ban** the accounts involved.
- **Preserve** the relevant records for as long as the law requires, so they are available to investigators.
- **Report** to the authorities as the law requires, including under the Protection of Children from Sexual Offences Act, 2012 and the Information Technology Act, 2000, and through the National Cyber Crime Reporting Portal.
- **Cooperate** with lawful requests from law enforcement.

We act on these reports ahead of every other kind of report.

---

## 5. Prevention

Every post is checked by an automated classifier before it becomes visible. Child sexual abuse is one of the categories it screens for, and flagged posts are never shown.

---

## 6. Contact

Child-safety contact: **${GRIEVANCE_OFFICER_NAME}**, ${GRIEVANCE_OFFICER_EMAIL}

${ENTITY_NAME}
`;
