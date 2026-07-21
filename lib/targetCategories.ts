export type TargetMiniAppId =
  | 'calculator'
  | 'converter'
  | 'bill-splitter'
  | 'pomodoro'
  | 'learn'
  | 'password-gen'
  | 'world-clock'
  | 'markdown'
  | 'tasks'
  | 'planner'
  | 'shopping-list'
  | 'bmi'
  | 'fitness'
  | 'camera'
  | 'image-editor'
  | 'voice-memo'
  | 'notes'
  | 'habits'
  | 'expenses';

export interface TargetCategory {
  id: string;
  label: string;
  outcome: string;
  prompt: string;
  apps: TargetMiniAppId[];
  metrics: string[];
  starter: string;
}

export const DEFAULT_TARGET_CATEGORY_ID = 'focus';

export const TARGET_CATEGORIES: TargetCategory[] = [
  {
    id: 'focus',
    label: 'Deep focus',
    outcome: 'Protect time and finish important work',
    prompt: 'Help me design a realistic focus system for my week. I want fewer distractions, clearer priorities, and proof of progress.',
    apps: ['pomodoro', 'tasks', 'habits', 'notes'],
    metrics: ['Focus blocks', 'Daily streak', 'Captured ideas'],
    starter: 'Start one focus block, then save the result as a note.',
  },
  {
    id: 'fitness',
    label: 'Fitness',
    outcome: 'Train consistently and track visible progress',
    prompt: 'Build a simple fitness routine I can actually repeat, including daily habits, body metrics, and weekly reflection.',
    apps: ['fitness', 'habits', 'planner', 'notes'],
    metrics: ['Workout streak', 'Body metric', 'Progress photos'],
    starter: 'Set one movement habit and log the first measurement.',
  },
  {
    id: 'weight-loss',
    label: 'Weight loss',
    outcome: 'Reduce weight with steady habits',
    prompt: 'Help me create a weight-loss plan that focuses on repeatable habits, measurements, and weekly check-ins instead of extremes.',
    apps: ['fitness', 'habits', 'shopping-list', 'notes'],
    metrics: ['Habit streak', 'BMI trend', 'Food spend'],
    starter: 'Choose one eating habit and capture a baseline metric.',
  },
  {
    id: 'career',
    label: 'Career',
    outcome: 'Move toward better opportunities',
    prompt: 'Help me define a career target, break it into weekly actions, and turn progress into concise updates.',
    apps: ['tasks', 'pomodoro', 'notes', 'habits'],
    metrics: ['Applications', 'Skill blocks', 'Weekly wins'],
    starter: 'Write the role or opportunity you want next.',
  },
  {
    id: 'exams',
    label: 'Exams',
    outcome: 'Study with recall, rhythm, and less panic',
    prompt: 'Create a study plan for my exam target with daily sessions, revision loops, and lightweight progress tracking.',
    apps: ['learn', 'pomodoro', 'tasks', 'notes'],
    metrics: ['Study blocks', 'Revision streak', 'Weak topics'],
    starter: 'List the next exam and the three weakest topics.',
  },
  {
    id: 'startup',
    label: 'Startup',
    outcome: 'Validate ideas and ship faster',
    prompt: 'Help me turn my startup idea into weekly validation tasks, build notes, and public progress updates.',
    apps: ['tasks', 'notes', 'voice-memo', 'expenses'],
    metrics: ['Customer notes', 'Build blocks', 'Spend'],
    starter: 'Capture the problem, customer, and next test.',
  },
  {
    id: 'money',
    label: 'Money',
    outcome: 'Understand and improve personal finances',
    prompt: 'Help me make a personal money system with budgets, spending checks, and simple decisions I can review weekly.',
    apps: ['expenses', 'shopping-list', 'calculator', 'habits'],
    metrics: ['Weekly spend', 'Savings habit', 'Budget notes'],
    starter: 'Log one expense and name the budget rule.',
  },
  {
    id: 'budgeting',
    label: 'Budgeting',
    outcome: 'Plan spending before it happens',
    prompt: 'Build me a practical budget plan for the next month, including categories, limits, and weekly review questions.',
    apps: ['expenses', 'shopping-list', 'calculator', 'notes'],
    metrics: ['Category limits', 'Bills split', 'Balance'],
    starter: 'Enter the next bill or recurring expense.',
  },
  {
    id: 'coding',
    label: 'Coding',
    outcome: 'Ship software and learn faster',
    prompt: 'Help me create a coding improvement system with build sessions, bug notes, and reusable explanations.',
    apps: ['learn', 'tasks', 'pomodoro', 'notes'],
    metrics: ['Build blocks', 'Bugs learned', 'Snippets saved'],
    starter: 'Write the feature or concept you want to master.',
  },
  {
    id: 'content',
    label: 'Content',
    outcome: 'Create posts, videos, and ideas consistently',
    prompt: 'Help me design a content system that captures raw ideas, turns them into drafts, and tracks publishing consistency.',
    apps: ['camera', 'image-editor', 'voice-memo', 'notes'],
    metrics: ['Ideas captured', 'Drafts', 'Published posts'],
    starter: 'Record one rough idea before polishing it.',
  },
  {
    id: 'mental-health',
    label: 'Mental health',
    outcome: 'Build calmer daily check-ins',
    prompt: 'Help me create a gentle mental health check-in system with mood notes, grounding habits, and honest reflection prompts.',
    apps: ['notes', 'voice-memo', 'habits', 'pomodoro'],
    metrics: ['Check-ins', 'Grounding streak', 'Stress notes'],
    starter: 'Write how today feels in one sentence.',
  },
  {
    id: 'sleep',
    label: 'Sleep',
    outcome: 'Create a better evening rhythm',
    prompt: 'Help me improve my sleep routine with a repeatable wind-down habit, simple tracking, and realistic boundaries.',
    apps: ['habits', 'planner', 'notes', 'pomodoro'],
    metrics: ['Wind-down streak', 'Bedtime notes', 'Late sessions'],
    starter: 'Pick one wind-down habit for tonight.',
  },
  {
    id: 'language',
    label: 'Language',
    outcome: 'Practice a language every day',
    prompt: 'Help me build a language learning routine using short practice sessions, vocabulary notes, and speaking reflections.',
    apps: ['learn', 'voice-memo', 'notes', 'habits'],
    metrics: ['Speaking reps', 'New words', 'Practice streak'],
    starter: 'Record a 30-second voice memo in the language.',
  },
  {
    id: 'travel',
    label: 'Travel',
    outcome: 'Plan trips with less friction',
    prompt: 'Help me plan a trip around time zones, budget, packing notes, and decisions I should make before I leave.',
    apps: ['planner', 'expenses', 'world-clock', 'notes'],
    metrics: ['Trip budget', 'Time zones', 'Packing notes'],
    starter: 'Save destination, dates, and the first cost estimate.',
  },
  {
    id: 'relationships',
    label: 'Relationships',
    outcome: 'Be more intentional with people',
    prompt: 'Help me become more thoughtful in relationships with reminders, conversation notes, and better follow-through.',
    apps: ['notes', 'habits', 'voice-memo', 'camera'],
    metrics: ['Check-ins', 'Conversation notes', 'Follow-ups'],
    starter: 'Write the person and the next thoughtful action.',
  },
  {
    id: 'parenting',
    label: 'Parenting',
    outcome: 'Organize family routines and memories',
    prompt: 'Help me make a parenting support system for routines, expenses, memories, and small weekly improvements.',
    apps: ['habits', 'expenses', 'camera', 'notes'],
    metrics: ['Family routines', 'Costs', 'Memories saved'],
    starter: 'Add one family routine or memory to preserve.',
  },
  {
    id: 'creativity',
    label: 'Creativity',
    outcome: 'Make more original work',
    prompt: 'Help me build a creative practice that captures inspiration, schedules making time, and turns drafts into shareable work.',
    apps: ['notes', 'image-editor', 'voice-memo', 'camera'],
    metrics: ['Drafts', 'Inspiration', 'Creative sessions'],
    starter: 'Capture the seed of one idea before judging it.',
  },
  {
    id: 'cooking',
    label: 'Cooking',
    outcome: 'Cook better and plan meals',
    prompt: 'Help me build a cooking system with meal ideas, measurements, food budget, and repeatable recipes.',
    apps: ['shopping-list', 'expenses', 'notes', 'camera'],
    metrics: ['Recipes', 'Food spend', 'Measurements'],
    starter: 'Save one recipe idea and the missing ingredients.',
  },
  {
    id: 'spirituality',
    label: 'Spirituality',
    outcome: 'Keep a steady reflection practice',
    prompt: 'Help me create a spiritual reflection routine with prompts, habits, and notes I can revisit over time.',
    apps: ['notes', 'habits', 'voice-memo', 'pomodoro'],
    metrics: ['Reflection streak', 'Quiet sessions', 'Insights'],
    starter: 'Write the question you want to sit with this week.',
  },
  {
    id: 'home',
    label: 'Home',
    outcome: 'Manage home tasks and spending',
    prompt: 'Help me organize home maintenance, chores, shared costs, and decisions into a simple weekly system.',
    apps: ['habits', 'expenses', 'shopping-list', 'tasks'],
    metrics: ['Chores', 'Home spend', 'Shared bills'],
    starter: 'Add the next home task that keeps getting delayed.',
  },
  {
    id: 'gaming',
    label: 'Gaming',
    outcome: 'Improve play, content, or community',
    prompt: 'Help me build a gaming improvement system with practice sessions, clip notes, strategy logs, and content ideas.',
    apps: ['tasks', 'notes', 'pomodoro', 'planner'],
    metrics: ['Practice blocks', 'Strategy notes', 'Clips reviewed'],
    starter: 'Save the game, rank or goal, and next skill to train.',
  },
  {
    id: 'sales',
    label: 'Sales',
    outcome: 'Improve outreach and follow-ups',
    prompt: 'Help me create a sales routine for prospect notes, outreach blocks, objections, and follow-up discipline.',
    apps: ['notes', 'pomodoro', 'habits', 'voice-memo'],
    metrics: ['Outreach blocks', 'Follow-ups', 'Objections'],
    starter: 'Write the prospect type and next follow-up.',
  },
  {
    id: 'research',
    label: 'Research',
    outcome: 'Collect evidence and synthesize better',
    prompt: 'Help me organize a research workflow for notes, source summaries, questions, and weekly synthesis.',
    apps: ['learn', 'planner', 'notes', 'pomodoro'],
    metrics: ['Sources', 'Questions', 'Synthesis notes'],
    starter: 'Write the research question and first source.',
  },
  {
    id: 'reading',
    label: 'Reading',
    outcome: 'Read more and remember more',
    prompt: 'Help me make a reading system with notes, reflection prompts, and a practical cadence I can maintain.',
    apps: ['notes', 'habits', 'pomodoro', 'tasks'],
    metrics: ['Reading streak', 'Highlights', 'Book notes'],
    starter: 'Save the book and one idea worth remembering.',
  },
  {
    id: 'freelance',
    label: 'Freelance',
    outcome: 'Manage clients, time, and income',
    prompt: 'Help me create a freelance operating system for client notes, focused delivery, invoices, and income tracking.',
    apps: ['expenses', 'notes', 'pomodoro', 'calculator'],
    metrics: ['Client tasks', 'Delivery blocks', 'Income'],
    starter: 'Write the client, deliverable, and next deadline.',
  },
];

export function getTargetCategory(id?: string): TargetCategory {
  return TARGET_CATEGORIES.find(category => category.id === id) ?? TARGET_CATEGORIES[0];
}

export function getTargetPrompt(category: TargetCategory, outcome?: string): string {
  const cleanOutcome = outcome?.trim();
  if (!cleanOutcome) return category.prompt;
  return `${category.prompt} My personal target is: ${cleanOutcome}.`;
}
