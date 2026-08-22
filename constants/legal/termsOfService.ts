/**
 * Canonical Terms of Service content (rendered by app/terms.tsx and mirrored to
 * docs/terms-of-service.md). Markdown string so it renders identically in-app
 * (react-native-markdown-display) and on web.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * STATUS: DRAFT v3.0 — PREPARED FOR EXTERNAL COUNSEL REVIEW. NOT YET IN FORCE.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * This is a substantially deeper rewrite of v2.0. It adds the sections a
 * consumer social product with AI, advertising, a marketplace and paid tiers
 * needs, and which v2.0 did not have at all:
 *
 *   · indemnity                       · copyright notice-and-counter-notice
 *   · dispute resolution + venue      · subscriptions, auto-renewal, refunds
 *   · advertising terms               · Apple / Google store-required terms
 *   · India grievance mechanism       · authoritative-language clause
 *   · force majeure, assignment, severability, entire agreement
 *
 * OPEN ITEMS FOR COUNSEL — each is a decision, not a drafting gap:
 *
 *   1. ENTITY + GOVERNING LAW. All placeholders live in constants/legal/entity.ts.
 *      `grep -rn "\[\[" constants/legal/` lists every unresolved value.
 *
 *   2. MINIMUM AGE. §2 sets 16 globally, with a higher bar where local law
 *      requires it. India's DPDP Act 2023 treats under-18s as children needing
 *      verifiable parental consent and restricts tracking and targeted ads for
 *      them. Echo has NO date-of-birth field in the schema today, so §2 is not
 *      yet enforceable in product. Counsel to decide: 18+ in India, or 16+ with
 *      a verifiable parental-consent flow. Either answer creates engineering work.
 *
 *   3. ARBITRATION. §21 currently uses courts, not arbitration. If an
 *      arbitration clause and class-action waiver are wanted, they must be
 *      drafted to survive Indian and EU consumer-protection limits.
 *
 *   4. LIABILITY CAP. §19 keeps the greater of US$100 / 12 months of fees.
 *      Confirm this is defensible in the launch jurisdiction.
 *
 *   5. TRANSLATIONS. §25 makes English authoritative and every translation a
 *      convenience copy. Required because the DPDP Eighth Schedule versions
 *      will be machine-assisted. See docs/legal-translations.md.
 */

import {
  ENTITY_NAME,
  ENTITY_ADDRESS,
  GOVERNING_LAW,
  COURTS_VENUE,
  GRIEVANCE_OFFICER_NAME,
  GRIEVANCE_OFFICER_EMAIL,
  SUPPORT_EMAIL,
  DSA_EMAIL,
} from './entity';

export const TERMS_UPDATED = 'August 22, 2026';
export const TERMS_VERSION = '3.0-draft';

/** Language the Terms are authoritative in. See §25. */
export const TERMS_AUTHORITATIVE_LANGUAGE = 'en';

export const TERMS_OF_SERVICE_MD = `# Terms of Service

**Last updated:** ${TERMS_UPDATED} · **Version ${TERMS_VERSION}**

These Terms of Service ("**Terms**") are a binding agreement between you and ${ENTITY_NAME} ("**Echo**", "**we**", "**us**"), the operator of the Echo application and website (together, the "**Service**").

**By creating an account, or by using the Service, you agree to these Terms.** If you do not agree, do not use the Service.

Please read §18 (Disclaimers), §19 (Limitation of liability), §20 (Indemnity) and §21 (Dispute resolution) carefully — they limit our liability and affect how disputes between us are resolved.

---

## 1. Definitions

- **Content** — anything you create, upload, post, send or store on the Service: text, images, video, audio, voice recordings, comments, reactions, messages, listings and profile information.
- **Account** — the credentials and profile through which you access the Service.
- **AI Features** — the assistant, voice commands, translation, moderation classification and recommendation features described in §8.
- **Marketplace** — the peer listing surface described in §10.
- **Paid Services** — subscriptions, premium tiers and advertising purchases described in §11 and §12.

---

## 2. Eligibility and age

You must be at least **16 years old** to use the Service.

Where the law that applies to you sets a higher age for consent to the processing of personal data, that higher age applies instead. In **India**, the Digital Personal Data Protection Act, 2023 treats anyone under **18** as a child: if you are under 18 and in India, a parent or legal guardian must provide verifiable consent before you use the Service, and we will not use your data for tracking, behavioural monitoring or targeted advertising.

You confirm that you are not barred from using the Service under any applicable law, and that you are not subject to sanctions that would prohibit us from providing it to you.

If we learn that an Account belongs to someone below the applicable minimum age without the required consent, we will suspend it and delete the associated personal data.

---

## 3. Your Account

You are responsible for keeping your sign-in method — your email address or phone number — secure, and for everything that happens through your Account.

- One person, one Account. Do not share, sell or transfer an Account.
- Tell us promptly at **${SUPPORT_EMAIL}** if you believe your Account has been accessed without your permission.
- Choose a username that is not misleading and does not impersonate another person or organisation.
- If you apply for a verified badge, you agree we may process the photograph you submit for the sole purpose of confirming that you are a real, living person and that you match your profile photo. That check is described in the Privacy Policy. The photograph is deleted once a decision is made.

You may delete your Account at any time from **Settings → Danger Zone → Delete Account**. Deletion is described in §17.

---

## 4. Your Content and the licence you give us

**You keep every right you already have in your Content.** We claim no ownership of it.

To operate the Service, you grant Echo a worldwide, non-exclusive, royalty-free, sub-licensable and transferable licence to host, store, cache, reproduce, adapt (only for formatting, resizing, transcoding and translation), publish, publicly display, publicly perform and distribute your Content.

This licence exists **only so that we can run the Service**, and its scope follows what you chose:

- Content you publish publicly may be shown to anyone.
- Content you send privately is shown only to the recipients you chose.
- Content in a mini-app is shown only to you unless you share it.

The licence ends when you delete the Content or your Account, except that (a) we may keep copies in backups for a limited period until they expire, (b) we may keep what we are legally required to keep, and (c) we cannot recall copies others already lawfully shared or saved.

**You promise** that you own or are licensed to share everything you post, and that it does not infringe anyone's rights or break any law.

**Feedback.** If you send us suggestions about the Service, you grant us an unrestricted, perpetual, royalty-free right to use them without obligation to you.

---

## 5. Content you may not post

Do not use the Service to:

- Harass, threaten, bully, stalk, dox or impersonate anyone.
- Post sexual content involving minors. We remove it, terminate the Account and report to the relevant authorities, including the National Center for Missing & Exploited Children.
- Post non-consensual intimate imagery.
- Incite violence, terrorism, or self-harm, or glorify those who commit them.
- Promote hatred against people based on religion, caste, ethnicity, national origin, sex, gender identity, sexual orientation, disability or serious disease.
- Infringe copyright, trademark or other intellectual-property rights.
- Run spam, phishing, pyramid schemes, engagement farming or other scams.
- Sell or advertise illegal, counterfeit, stolen or restricted goods and services.
- Scrape, crawl, harvest or bulk-collect data from the Service without our written permission.
- Reverse-engineer, decompile, interfere with or attempt to gain unauthorised access to the Service or its infrastructure.
- Circumvent rate limits, moderation systems, age restrictions or bans.
- Upload malware, or anything designed to disrupt the Service or other users' devices.
- Use the Service in a way that breaks any law that applies to you.

---

## 6. Moderation

We use a combination of automated classification and human review.

- We may remove, hide, restrict, age-gate or demote Content, and suspend or terminate Accounts.
- Automated systems may act before a human reviews the decision.
- Where the law requires it, we will give you a statement of reasons explaining what was actioned and why.

We are not obliged to monitor Content, and choosing to moderate some Content does not oblige us to moderate all of it.

---

## 7. Reports and appeals

If you see something that breaks these Terms, use the report action on the post, profile or message.

- You can see the status of reports you filed under **Settings → My Reports**.
- If a moderation decision affects your Content or Account, you may appeal it for human review under **Settings → Appeals**. Appeals remain open for **six months** from the decision.
- If your appeal succeeds, we restore the Content or the Account and record the reversal.

**In India**, if you are not satisfied, you may escalate to our Grievance Officer under §24. **In the European Union**, you retain the rights given to you by the Digital Services Act, including out-of-court dispute settlement; contact **${DSA_EMAIL}**.

---

## 8. AI features

Echo includes an AI assistant, voice commands, automatic translation, content-moderation classification and recommendations.

**How your data is used.** When you use AI Features, the relevant input — your text, and for voice commands your audio recording — is sent to a third-party model provider (currently Google Gemini, routed via OpenRouter) to produce a response. Details are in the Privacy Policy. **We do not sell your Content, and we do not use it to train third-party foundation models.**

**Accuracy.** AI output can be wrong, incomplete, out of date or biased, and can state falsehoods confidently. Do not rely on it as a substitute for a qualified professional. **The assistant is not a doctor, lawyer, accountant, financial adviser or therapist.** If you are in crisis, contact your local emergency service.

**Actions taken for you.** The assistant can act inside the Service on your instruction — drafting or publishing a post, opening a tool, changing a setting. **You remain responsible for anything published through your Account, including by the assistant on your instruction.** Where an action is significant, we ask you to confirm first.

**Limits.** AI Features are rate-limited, and the limit depends on your tier. We may change models, limits and behaviour, or withdraw an AI Feature, at any time.

**Do not put secrets in AI prompts.** Do not include passwords, payment card details, government identifiers or other sensitive information in prompts.

---

## 9. Mini-apps

The mini-apps — habits, tasks, notes, expenses, fitness and the rest — are convenience tools provided "as is". They are not a system of record. **Keep your own copy of anything you cannot afford to lose.**

Health, fitness and body measurements you enter are for your personal tracking only. They are not medical advice and must not be used to diagnose or treat any condition.

---

## 10. Marketplace

Echo lets users post listings. **Echo is not a party to any transaction between users.**

- We do not process marketplace payments, hold funds, provide escrow, verify sellers, inspect goods, or guarantee any listing, buyer or seller.
- Any contract for a listed item is directly between the buyer and the seller.
- **You are solely responsible** for the legality of what you list, for describing it accurately, for delivering it, and for all applicable taxes and duties.
- Do not list anything illegal, counterfeit, stolen, recalled, hazardous or otherwise restricted.

We may remove a listing at any time. Disputes between buyers and sellers must be resolved between them; we may, but need not, assist.

---

## 11. Subscriptions and payments

Some features require a paid subscription.

- **Billing.** Subscriptions bought inside the mobile app are processed by **Apple** or **Google** under their terms, not by us. We do not receive or store your payment card details.
- **Auto-renewal.** Subscriptions renew automatically for the same period unless you cancel at least 24 hours before the current period ends.
- **Managing and cancelling.** Manage or cancel in your Apple or Google account settings. Deleting the Echo app does not cancel a subscription.
- **Refunds.** Refunds for store-billed purchases are handled by Apple or Google under their policies. Where a non-waivable statutory right to cancel or refund applies to you, that right is unaffected by anything in these Terms.
- **Price changes.** We will give you notice before a price change takes effect. If you do not accept it, you may cancel before the next renewal.
- **Taxes.** Prices may exclude taxes. Where we are required to collect tax, it is added at checkout.

We may change what each tier includes. If a change materially reduces what you paid for, you may cancel and, where required by law, receive a pro-rata refund.

---

## 12. Advertising

Echo may show advertising in the feed. Advertising sold by Echo is first-party: **we do not run third-party advertising networks inside the app.**

If you buy advertising from us, you additionally agree that:

- You are responsible for your ad content and its destination, and for its compliance with all applicable advertising, consumer-protection and sector-specific law, including the Advertising Standards Council of India codes where they apply.
- We may review, reject, remove or pause any advertisement at any time, with or without reason.
- Metrics we report are our measurement and are provided without warranty.
- Payment terms are those shown at the time of purchase. Amounts paid are non-refundable except where the law requires otherwise or where we cancelled the campaign.

---

## 13. Echo's intellectual property

The Service — its software, design, interface, text, graphics, logos and the "Echo" name — is owned by ${ENTITY_NAME} or its licensors and is protected by intellectual-property law.

We grant you a personal, limited, revocable, non-exclusive, non-transferable licence to use the Service for your own non-commercial use, as permitted by these Terms. **We reserve every right not expressly granted.** You may not copy, modify, distribute, sell, lease or create derivative works from the Service, except where that restriction is prohibited by law.

---

## 14. Copyright complaints

If you believe Content on the Service infringes your copyright, send a notice to **${SUPPORT_EMAIL}** containing:

1. Your physical or electronic signature.
2. Identification of the work you say is infringed.
3. Identification of the Content you want removed, and enough detail for us to find it.
4. Your contact details.
5. A statement that you believe in good faith that the use is not authorised.
6. A statement, under penalty of perjury, that your notice is accurate and that you are the rights holder or authorised to act for them.

We remove Content that is the subject of a valid notice and notify the person who posted it, who may submit a counter-notice. **We terminate the Accounts of repeat infringers.**

---

## 15. Third-party services

The Service links to and depends on third parties — app stores, payment processors, model providers, cloud infrastructure, analytics and crash reporting. Their terms and privacy practices govern their services, not ours, and **we are not responsible for them**. A link is not an endorsement.

---

## 16. Privacy

Our handling of personal data is described in the **Privacy Policy**, which forms part of these Terms. Where the Privacy Policy and these Terms conflict on a data-protection question, the Privacy Policy prevails.

---

## 17. Suspension, termination and deletion

**You** may stop using the Service at any time and delete your Account from **Settings → Danger Zone → Delete Account**. Deletion removes your profile and the Content associated with it, subject to the retention periods in the Privacy Policy.

**We** may suspend or terminate your Account, with notice where practicable, if you materially breach these Terms, if your Account creates legal risk for us or other users, or if we are required to by law. Where a breach is serious — for example child sexual abuse material, or credible threats of violence — we may act immediately and without notice.

On termination: the licence in §4 ends except as set out there, and §§4 (final paragraph), 13, 18, 19, 20, 21, 22 and 25 survive.

We may discontinue the Service, or any part of it, on reasonable notice. If we do, we will give you a reasonable opportunity to export your Content.

---

## 18. Disclaimers

**The Service is provided "as is" and "as available".** To the maximum extent permitted by law, we disclaim all warranties, express, implied and statutory, including merchantability, fitness for a particular purpose, non-infringement, accuracy, and any warranty arising from course of dealing or trade usage.

We do not warrant that the Service will be uninterrupted, secure, error-free, or that any defect will be corrected; that Content or AI output will be accurate; or that the Service will meet your requirements.

**Nothing in these Terms excludes liability that cannot lawfully be excluded** — including liability for death or personal injury caused by negligence, for fraud, or for any non-waivable consumer right.

---

## 19. Limitation of liability

To the maximum extent permitted by law:

- We are not liable for indirect, incidental, special, consequential, exemplary or punitive damages, or for loss of profits, revenue, business, goodwill, data or anticipated savings, however caused.
- **Our total aggregate liability** arising out of or relating to the Service and these Terms is limited to the greater of **US $100** or the amount you paid us in the **twelve months** before the event giving rise to the claim.

These limits apply even if a remedy fails of its essential purpose, and they apply to the extent permitted where you live — some jurisdictions do not allow them.

---

## 20. Indemnity

To the extent permitted by law, you will indemnify and hold harmless ${ENTITY_NAME}, its officers, employees and agents from any claim, demand, loss, liability or expense — including reasonable legal fees — arising out of (a) your Content, (b) your use of the Service, (c) your breach of these Terms or of any law, or (d) your infringement of anyone's rights.

We will notify you of any such claim and may, at our own cost, assume its exclusive defence and control, in which case you will cooperate with us.

---

## 21. Governing law and disputes

These Terms and any dispute arising from them are governed by the laws of ${GOVERNING_LAW}, without regard to its conflict-of-laws rules.

**Talk to us first.** Before starting formal proceedings, please contact us at **${SUPPORT_EMAIL}** so we can try to resolve the matter. Most issues can be settled quickly this way.

Subject to §24 and to any non-waivable right you have to bring proceedings in your home courts, the courts of ${COURTS_VENUE} have exclusive jurisdiction.

**If you are a consumer in the European Union**, you keep the protection of the mandatory law of your country of residence and may bring proceedings there. You may also use the European Commission's Online Dispute Resolution platform.

---

## 22. General

- **Changes to these Terms.** We may update these Terms. For material changes we will notify you in the app and update the version and date above, and where the law requires it we will seek your consent. Continuing to use the Service after a change takes effect means you accept it. If you do not accept it, stop using the Service and delete your Account.
- **Assignment.** You may not assign these Terms. We may assign them to an affiliate or in connection with a merger, acquisition or sale of assets, on notice to you.
- **Severability.** If a provision is held unenforceable, it is modified to the minimum extent necessary, or severed, and the rest stays in force.
- **No waiver.** Not enforcing a provision is not a waiver of it.
- **Entire agreement.** These Terms and the Privacy Policy are the entire agreement between us about the Service.
- **No third-party beneficiaries**, except as stated in §23.
- **Force majeure.** We are not liable for failure to perform caused by events beyond our reasonable control, including outages of third-party infrastructure, natural events, war, civil unrest, or government action.
- **Notices.** We may notify you in the app, by email, or by push notification. Notices to us go to **${SUPPORT_EMAIL}**.

---

## 23. App store terms

These Terms are between you and Echo, **not with Apple or Google**.

**Apple.** Apple has no obligation to provide maintenance or support for the app. If the app fails to conform to any applicable warranty, you may notify Apple and Apple will refund the purchase price; to the maximum extent permitted by law, Apple has no other warranty obligation. Apple is not responsible for addressing any claim relating to the app, including product liability, regulatory non-compliance or consumer-protection claims, or for investigating or defending third-party intellectual-property claims. You confirm you are not located in a country subject to a US Government embargo or designated as terrorist-supporting, and are not on any US Government prohibited-parties list. **Apple and its subsidiaries are third-party beneficiaries of these Terms and may enforce them against you.**

**Google.** Your use of the app obtained through Google Play is also subject to the Google Play Terms of Service.

---

## 24. Grievance redressal (India)

Under the Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021, and the Digital Personal Data Protection Act, 2023, you may contact our Grievance Officer:

> **Grievance Officer:** ${GRIEVANCE_OFFICER_NAME}
> **Email:** ${GRIEVANCE_OFFICER_EMAIL}
> **Address:** ${ENTITY_ADDRESS}

We acknowledge complaints within **24 hours** and resolve them within **15 days** of receipt. Complaints about the removal of Content, or about non-consensual intimate imagery, are handled on the shorter timelines the Rules require.

---

## 25. Language

These Terms are published in English and in other languages, including languages listed in the **Eighth Schedule to the Constitution of India**, so that you can read them in a language you understand.

**The English version is the authoritative text.** Translations are provided for your convenience and may be produced with machine assistance. **If there is any conflict or difference in meaning between the English version and a translation, the English version prevails**, except where the law that applies to you requires the local-language version to govern — in which case that version governs to the extent of the conflict.

If you believe a translation is inaccurate, please tell us at **${SUPPORT_EMAIL}** and we will correct it.

---

## 26. Contact

**General and legal:** ${SUPPORT_EMAIL}
**Grievances (India):** ${GRIEVANCE_OFFICER_EMAIL}
**EU Digital Services Act:** ${DSA_EMAIL}

${ENTITY_NAME}
${ENTITY_ADDRESS}
`;
