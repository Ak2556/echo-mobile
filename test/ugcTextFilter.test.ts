import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HI_BULK } from '../lib/i18n/i18nPhrasesHi';

/**
 * Guards for the text filter (supabase/migrations/20261117130000_ugc_text_filter.sql). What the SQL
 * decides is proved by running it against a database (see the PR); these pin the properties a later edit
 * could quietly lose, above all the ones that protect sign-up.
 */
const root = join(__dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const sql = read('supabase/migrations/20261117130000_ugc_text_filter.sql');

/** The body of one function, from its CREATE to the `$$;` that ends it. */
function functionBody(name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  expect(start, `${name} is defined`).toBeGreaterThan(-1);
  return sql.slice(start, sql.indexOf('$$;', sql.indexOf('as $$', start) + 5) + 3);
}

describe('the word list', () => {
  it('has RLS on and no client access, so it cannot be read out', () => {
    expect(sql).toMatch(/alter table public\.blocked_terms enable row level security/i);
    expect(sql).toMatch(/revoke all on public\.blocked_terms from anon, authenticated/i);
    expect(sql).not.toMatch(/grant\s+[a-z, ]+\s+on\s+public\.blocked_terms/i);
  });

  it('revokes every helper from clients, so the list cannot be probed through them', () => {
    for (const fn of ['filter_normalize(text, text)', 'filter_join_spelled(text)', 'filter_match(text, smallint)', 'text_filter_hit(text, text)']) {
      expect(sql, fn).toContain(`revoke all on function public.${fn} from public, anon, authenticated`);
    }
  });

  it('keeps child-abuse terms out: a keyword cannot tell solicitation from a news comment', () => {
    expect(sql).not.toMatch(/'abuse_material'\)\s*,\s*\(|, 'abuse_material'\)/);
  });
});

describe('sign-up safety (handle_new_user says a raise aborts the signup)', () => {
  const body = functionBody('guard_profile_text');
  const insertBranch = body.slice(body.indexOf("tg_op = 'INSERT'"), body.indexOf('return new;'));

  it('never raises on the INSERT side', () => {
    expect(insertBranch).not.toMatch(/raise exception/i);
  });

  it('swallows a fault of its own, so a broken filter cannot be the reason someone cannot sign up', () => {
    expect(insertBranch).toMatch(/exception when others then/i);
  });

  it('checks end-user edits only: the service role passes through', () => {
    expect(body).toMatch(/if auth\.uid\(\) is not null then/i);
    expect(functionBody('guard_comment_text')).toMatch(/auth\.uid\(\) is not null/);
    expect(functionBody('guard_answer_text')).toMatch(/auth\.uid\(\) is not null/);
  });

  it('only checks a value that changed, so a legacy value does not lock an account out of saving', () => {
    expect(body).toContain('new.username is distinct from old.username');
    expect(body).toContain('new.bio is distinct from old.bio');
  });
});

describe('enforcement is wired to every surface', () => {
  it('has a trigger on comments, daily answers and profiles', () => {
    expect(sql).toMatch(/create trigger echo_comments_text_filter\s+before insert or update of content on public\.echo_comments/i);
    expect(sql).toMatch(/create trigger daily_answers_text_filter\s+before insert or update of answer on public\.daily_answers/i);
    expect(sql).toMatch(/create trigger profiles_text_filter_insert\s+before insert on public\.profiles/i);
    expect(sql).toMatch(/create trigger profiles_text_filter_update\s+before update of username, display_name, bio, mood, pronouns on public\.profiles/i);
  });

  it('pins search_path and runs as definer on every guard', () => {
    for (const fn of ['guard_comment_text', 'guard_profile_text', 'guard_answer_text', 'text_filter_hit', 'filter_match']) {
      const body = functionBody(fn);
      expect(body, fn).toMatch(/security definer/);
      expect(body, fn).toMatch(/set search_path = ''/);
    }
  });

  it('raises the code the app maps, with the surface in the message', () => {
    expect(sql).toContain("errcode = 'EC001'");
    for (const s of ['comment', 'answer', 'username', 'display_name', 'bio', 'mood', 'pronouns']) {
      expect(sql, s).toContain(`'text_filter:${s}'`);
    }
  });

  it('makes a refused username read as unavailable before anyone saves a whole profile', () => {
    expect(functionBody('username_available')).toContain("not public.text_filter_hit(p_username, 'username')");
  });
});

describe('policy: profanity is allowed in text, as in posts', () => {
  it('only usernames use level 2', () => {
    expect(functionBody('text_filter_hit')).toContain("case p_surface when 'username' then 2 else 1 end");
  });
});

describe('the app maps the code and shows it', () => {
  it('uses the shared helper on every write that can be refused', () => {
    expect(read('components/feed/CommentsPanel.tsx')).toMatch(/writeErrorMessage\(e\)/);
    expect(read('components/daily/DailyQuestionComposer.tsx')).toMatch(/writeErrorMessage\(e\)/);
    expect(read('app/edit-profile.tsx')).toMatch(/writeErrorMessage\(e\)/);
  });

  it('keeps the outbox free of translations and quiet about refusals', () => {
    const src = read('lib/core/outboxProcessor.ts');
    expect(src).toContain("from '../moderation/textFilterCode'");
    expect(src).not.toContain('textFilterError');
    expect(src).toMatch(/if \(!isTextFilterError\(e\)\) captureException/);
  });

  it('has Hindi for every message it can show', () => {
    const strings = [
      "This comment contains language Echo doesn't allow. Please change it and try again.",
      "Your answer contains language Echo doesn't allow. Please change it and try again.",
      "That username isn't allowed. Please choose another.",
      "That name isn't allowed. Please choose another.",
      "Your bio contains language Echo doesn't allow. Please change it.",
      "That contains language Echo doesn't allow. Please change it.",
    ];
    for (const s of strings) expect(HI_BULK[s], s).toBeTruthy();
  });
});
