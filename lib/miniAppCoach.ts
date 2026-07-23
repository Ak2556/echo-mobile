// Client for the mini-app-coach edge function: returns a short, data-grounded
// coaching line for one of the structured mini-apps (habits/fitness/expenses/
// tasks). The function reads the user's own stats under RLS server-side.

import { supabase } from './supabase';

export type CoachApp = 'habits' | 'fitness' | 'expenses' | 'tasks';
export const COACH_APPS: CoachApp[] = ['habits', 'fitness', 'expenses', 'tasks'];

export interface CoachResult {
  app: CoachApp;
  coaching: string;
  summary: string;
}

/** Resolve an EdgeFeaturePanel appName/appId to a coach-supported key, or null. */
export function coachAppFor(idOrName: string): CoachApp | null {
  const k = idOrName.trim().toLowerCase();
  return (COACH_APPS as string[]).includes(k) ? (k as CoachApp) : null;
}

export async function askMiniAppCoach(app: CoachApp): Promise<CoachResult> {
  const { data, error } = await supabase.functions.invoke('mini-app-coach', { body: { app } });
  if (error) throw error;
  if (!data || typeof data.coaching !== 'string' || !data.coaching) {
    throw new Error((data && data.error) || 'No coaching returned');
  }
  return data as CoachResult;
}
