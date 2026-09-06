/**
 * EU availability and representative disclosure (rendered by app/legal/eu-rep.tsx).
 *
 * The previous version of this page said that, until a representative was
 * formally designated, the dsa@ mailbox "serves as Echo's Union point of
 * contact for authorities and users." That is not something a mailbox can do.
 * DSA Art. 13 requires a legal representative *designated in writing* and
 * established *in a Member State*; an address in India is neither, and Art. 13
 * carries no micro-enterprise exemption — Art. 19 excludes Section 3 only.
 *
 * Echo launches without offering the service in the European Union, which is
 * what makes the absence of a representative correct rather than a gap. See
 * docs/compliance/launch-and-first-year.md §1.
 *
 * TO CHANGE THIS: appointing an EU representative is not the first step —
 * listing in the EU is. Before enabling any EU territory in Play Console or
 * App Store Connect, appoint BOTH a DSA Art. 13 legal representative and a
 * GDPR Art. 27 representative (they are separate obligations and usually
 * separate contracts), then replace the "Availability" section below with
 * their name, postal address and contact details.
 */

export const EU_REP_UPDATED = 'September 6, 2026';

export const EU_REPRESENTATIVE_MD = `# EU availability and representative

**Last updated:** ${EU_REP_UPDATED}

## Availability

Echo is **not currently offered in the European Union**. It is not listed in EU
territories on the App Store or Google Play, and it is not directed at users in
the Union.

Because Echo does not offer its services in the Union, it is not required to
designate a legal representative there under Article 13 of the Digital Services
Act, or a representative under Article 27 of the GDPR. If Echo becomes
available in the EU, representatives will be appointed and named on this page
before that happens.

## Contact

For questions about content, moderation or data protection — from anywhere —
write to **dsa@downloadecho.com**. We aim to respond without undue delay.

## Reporting illegal content

Any person or entity may notify us of content they consider illegal, using the
in-app report action or by emailing **dsa@downloadecho.com**.

We review every notice, tell you the outcome, and give the author a statement of
reasons for any decision against their content. Authors can appeal a moderation
decision for human review under **Settings → Appeals**, and appeals stay open
for six months.

We provide the notice-and-action, statement-of-reasons and appeal processes
described above to every user, in every country, whether or not the law of that
country requires them.
`;
