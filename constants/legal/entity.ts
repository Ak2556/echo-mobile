/**
 * Single source of truth for the operating-entity facts that every legal
 * document depends on.
 *
 * ⚠ EVERY VALUE MARKED `[[ ... ]]` IS UNRESOLVED AND MUST BE SET BY COUNSEL
 * BEFORE PUBLICATION. They are deliberately written as bracketed placeholders
 * so they are greppable and so an unfilled value is obvious in the rendered
 * document rather than silently wrong.
 *
 *   grep -rn "\[\[" constants/legal/
 *
 * Terms of Service, Privacy Policy and the EU-representative disclosure all
 * read from here, so the entity is named identically in all three.
 */

/** Registered legal name of the company that operates Echo. */
export const ENTITY_NAME = 'Akash Thakur';

/** Company / CIN / registration number in the jurisdiction of incorporation. */
export const ENTITY_REGISTRATION = 'Not applicable — sole proprietor';

/** Registered office address, as filed. */
export const ENTITY_ADDRESS = 'Shankar Nagar, Hoshiarpur, Punjab 146001, India';

/** Jurisdiction whose law governs the Terms, e.g. "the Republic of India". */
export const GOVERNING_LAW = 'the Republic of India';

/** Courts with exclusive jurisdiction, e.g. "the courts at Bengaluru, India". */
export const COURTS_VENUE = 'the District Court, Hoshiarpur, Punjab';

/**
 * Grievance Officer — mandatory for intermediaries in India under the
 * IT (Intermediary Guidelines and Digital Media Ethics Code) Rules 2021,
 * Rule 3(2). Name, designation and contact must be published on the service.
 */
export const GRIEVANCE_OFFICER_NAME = 'Akash Thakur';
export const GRIEVANCE_OFFICER_EMAIL = 'grievance@downloadecho.com';

/**
 * Data Protection Officer / contact for DPDP Act 2023 requests. May be the
 * same person as the Grievance Officer for a company of Echo's size.
 */
export const DPO_EMAIL = 'privacy@downloadecho.com';

/** General support and the DSA point of contact. */
export const SUPPORT_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? 'support@downloadecho.com';
export const DSA_EMAIL = process.env.EXPO_PUBLIC_DSA_EMAIL ?? 'dsa@downloadecho.com';

/**
 * True once every placeholder above has been replaced. Guards the pre-launch
 * check in scripts/audit-backend.mjs so an unfilled document cannot ship.
 */
export function hasUnresolvedEntityFacts(): boolean {
  return [
    ENTITY_NAME,
    ENTITY_REGISTRATION,
    ENTITY_ADDRESS,
    GOVERNING_LAW,
    COURTS_VENUE,
    GRIEVANCE_OFFICER_NAME,
  ].some(value => value.includes('[['));
}
