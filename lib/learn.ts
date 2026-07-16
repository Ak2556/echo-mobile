import AsyncStorage from '@react-native-async-storage/async-storage';
import { type CurrencyCode } from './currency';
import { createNote } from './notes';
import { loadPlanner, plannerToday, savePlanner, type PlannerItem } from './planner';
import { loadTasks, saveTasks, todayTaskDate, type TaskItem } from './tasks';
import { pullMiniAppIfNewer, pushMiniApp } from './miniAppSync';

export const LEARN_KEY = 'mini:learn';
export const LEARN_SETTINGS_KEY = 'mini:learn:settings';

export type LearningMode = 'student' | 'teacher' | 'coach';
export type LearningLevel = 'beginner' | 'some' | 'intermediate' | 'advanced';
export type LearningTaskType = 'lesson' | 'practice' | 'quiz' | 'review' | 'project';

export interface LearningSettings {
  defaultMode: LearningMode;
  defaultLevel: LearningLevel;
  defaultCategory: string;
  defaultDailyMinutes: number;
  defaultCodeLanguage: string;
  showTeacherTools: boolean;
  showCodeLabs: boolean;
  autoLinkNotes: boolean;
}

export const DEFAULT_LEARNING_SETTINGS: LearningSettings = {
  defaultMode: 'student',
  defaultLevel: 'beginner',
  defaultCategory: 'Academics',
  defaultDailyMinutes: 20,
  defaultCodeLanguage: 'TypeScript',
  showTeacherTools: true,
  showCodeLabs: true,
  autoLinkNotes: true,
};

export interface LearningTask {
  id: string;
  title: string;
  type: LearningTaskType;
  done: boolean;
}

export interface LearningModule {
  id: string;
  title: string;
  description: string;
  status: 'active' | 'locked' | 'completed';
  tasks: LearningTask[];
}

export interface LearningFlashcard {
  id: string;
  front: string;
  back: string;
  mastered: boolean;
}

export interface LearningQuizQuestion {
  id: string;
  question: string;
  answer: string;
  options: string[];
  selected?: string;
  correct?: boolean;
  explanation: string;
}

export interface LearningAssignment {
  id: string;
  title: string;
  instructions: string;
  due?: string;
  done: boolean;
  createdAt: string;
}

export interface LearningResource {
  id: string;
  title: string;
  kind: 'note' | 'link' | 'book' | 'video' | 'file';
  detail?: string;
  createdAt: string;
}

export interface LearningReflection {
  id: string;
  text: string;
  createdAt: string;
}

export interface LearningMilestone {
  id: string;
  title: string;
  proof: string;
  done: boolean;
  createdAt: string;
}

export interface LearningSession {
  id: string;
  title: string;
  minutes: number;
  focus: string;
  notes?: string;
  completedAt: string;
}

export interface LearningSyllabusWeek {
  id: string;
  title: string;
  objective: string;
  deliverable: string;
  done: boolean;
}

export interface LearningLearner {
  id: string;
  name: string;
  target: string;
  level: LearningLevel;
  progress: number;
  notes?: string;
  joinedAt: string;
}

export interface LearningRubricCriterion {
  id: string;
  title: string;
  description: string;
  score: number;
  maxScore: number;
}

export interface LearningEvidence {
  id: string;
  title: string;
  detail: string;
  kind: 'note' | 'link' | 'file' | 'photo' | 'submission';
  createdAt: string;
}

export interface LearningCodeExercise {
  id: string;
  title: string;
  language: string;
  prompt: string;
  starterCode: string;
  notes?: string;
  done: boolean;
  createdAt: string;
}

export type EchoLearningPartnerMode = 'tutor' | 'teacher' | 'coach' | 'examiner' | 'mastery' | 'assistant';

export interface EchoLearningPartnerAction {
  id: EchoLearningPartnerMode;
  mode: EchoLearningPartnerMode;
  title: string;
  role: string;
  output: string;
  cadence: string;
  prompt: string;
}

export type OneOnOneBookingStatus = 'requested' | 'accepted' | 'scheduled' | 'completed' | 'cancelled';
export type OneOnOnePaymentStatus = 'unpaid' | 'pending' | 'paid' | 'refunded';

export interface LearningOneOnOneProfile {
  enabled: boolean;
  headline: string;
  bio: string;
  expertise: string[];
  teachingStyle: string;
  baseCurrency: CurrencyCode;
  baseRate: number;
  meetingLink?: string;
  policies: string;
}

export interface LearningOneOnOnePackage {
  id: string;
  title: string;
  description: string;
  minutes: number;
  sessionCount: number;
  price: number;
  currency: CurrencyCode;
  active: boolean;
  createdAt: string;
}

export interface LearningOneOnOneSlot {
  id: string;
  label: string;
  durationMinutes: number;
  available: boolean;
  createdAt: string;
}

export interface LearningOneOnOneBooking {
  id: string;
  learnerName: string;
  learnerGoal: string;
  packageId?: string;
  packageTitle: string;
  minutes: number;
  sessionCount: number;
  price: number;
  currency: CurrencyCode;
  status: OneOnOneBookingStatus;
  paymentStatus: OneOnOnePaymentStatus;
  scheduledFor?: string;
  meetingLink?: string;
  prepNote?: string;
  homework?: string;
  followUp?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LearningGoal {
  id: string;
  title: string;
  category: string;
  mode: LearningMode;
  level: LearningLevel;
  targetOutcome: string;
  dailyMinutes: number;
  deadline?: string;
  createdAt: string;
  updatedAt: string;
  modules: LearningModule[];
  flashcards: LearningFlashcard[];
  quiz: LearningQuizQuestion[];
  assignments: LearningAssignment[];
  resources: LearningResource[];
  reflections: LearningReflection[];
  milestones: LearningMilestone[];
  sessions: LearningSession[];
  syllabus: LearningSyllabusWeek[];
  learners: LearningLearner[];
  rubric: LearningRubricCriterion[];
  evidence: LearningEvidence[];
  codeLabs: LearningCodeExercise[];
  oneOnOneProfile: LearningOneOnOneProfile;
  oneOnOnePackages: LearningOneOnOnePackage[];
  oneOnOneSlots: LearningOneOnOneSlot[];
  oneOnOneBookings: LearningOneOnOneBooking[];
  weakTopics: string[];
  studyMinutes: number;
  streak: number;
  lastStudiedAt?: string;
}

export const LEARNING_CATEGORIES = [
  'Academics',
  'Exam prep',
  'Coding',
  'Language',
  'Business',
  'Design',
  'Writing',
  'Public speaking',
  'Science',
  'Mathematics',
  'Finance',
  'Interview prep',
] as const;

export const LEVEL_LABELS: Record<LearningLevel, string> = {
  beginner: 'Beginner',
  some: 'Some knowledge',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

export const MODE_LABELS: Record<LearningMode, string> = {
  student: 'Student',
  teacher: 'Teacher',
  coach: 'Coach',
};

function templateModules(goal: Pick<LearningGoal, 'title' | 'mode' | 'level' | 'targetOutcome'>): LearningModule[] {
  const subject = goal.title.trim() || 'this topic';
  const teacherMode = goal.mode === 'teacher';
  const coachMode = goal.mode === 'coach';
  const base = teacherMode
    ? [
        ['Design the learning outcome', `Define what learners should be able to do with ${subject}.`],
        ['Create the first lesson', 'Prepare a short teachable unit with examples and a check for understanding.'],
        ['Assign practice', 'Turn the lesson into tasks, discussion prompts, and measurable proof.'],
        ['Review progress', 'Collect answers, identify weak areas, and give targeted feedback.'],
      ]
    : coachMode
      ? [
          ['Baseline and target', `Capture the current level and the exact output wanted in ${subject}.`],
          ['Daily reps', 'Build a small repeatable practice routine with clear proof.'],
          ['Feedback loop', 'Review attempts, correct mistakes, and raise difficulty gradually.'],
          ['Performance check', 'Complete a realistic challenge and decide the next level.'],
        ]
      : [
          ['Foundations', `Understand the core ideas and vocabulary of ${subject}.`],
          ['Guided practice', 'Solve examples with hints, notes, and immediate review.'],
          ['Recall and quiz', 'Test memory, find weak topics, and revise deliberately.'],
          ['Project or mock test', 'Apply the learning in a realistic output or exam-style round.'],
        ];

  return base.map(([title, description], index) => ({
    id: `${Date.now()}-${index}`,
    title,
    description,
    status: index === 0 ? 'active' : 'locked',
    tasks: [
      { id: `${Date.now()}-${index}-lesson`, title: index === 0 ? `Study ${subject} for ${goal.targetOutcome || 'the target'}` : `Complete ${title.toLowerCase()}`, type: 'lesson', done: false },
      { id: `${Date.now()}-${index}-practice`, title: teacherMode ? 'Create one assignment or prompt' : 'Do one active practice rep', type: 'practice', done: false },
      { id: `${Date.now()}-${index}-review`, title: 'Write the key mistake or insight', type: 'review', done: false },
    ],
  }));
}

function templateFlashcards(goal: Pick<LearningGoal, 'title' | 'mode' | 'targetOutcome'>): LearningFlashcard[] {
  const subject = goal.title.trim() || 'this topic';
  const target = goal.targetOutcome || `make progress in ${subject}`;
  return [
    { id: `${Date.now()}-fc-1`, front: `What is the main outcome for ${subject}?`, back: target, mastered: false },
    { id: `${Date.now()}-fc-2`, front: `What should I practice first in ${subject}?`, back: goal.mode === 'teacher' ? 'A clear lesson objective and one check question.' : 'One small active recall or practice rep.', mastered: false },
    { id: `${Date.now()}-fc-3`, front: 'How do I prove progress?', back: 'Complete a task, write one insight, and test recall without looking.', mastered: false },
  ];
}

function templateQuiz(goal: Pick<LearningGoal, 'title' | 'mode' | 'level' | 'targetOutcome'>): LearningQuizQuestion[] {
  const subject = goal.title.trim() || 'this topic';
  const target = goal.targetOutcome || `improve at ${subject}`;
  const role = MODE_LABELS[goal.mode].toLowerCase();
  return [
    {
      id: `${Date.now()}-quiz-1`,
      question: `What is the best first step for a ${role} working on ${subject}?`,
      answer: 'Define the target output and complete one small practice step.',
      options: [
        'Read everything before doing anything',
        'Define the target output and complete one small practice step',
        'Skip basics and only do advanced work',
        'Wait until there is a perfect plan',
      ],
      explanation: 'Learning improves fastest when a clear target is paired with active practice.',
    },
    {
      id: `${Date.now()}-quiz-2`,
      question: `Which habit best supports ${target}?`,
      answer: 'Short daily recall, practice, and review.',
      options: [
        'Only passive reading',
        'Short daily recall, practice, and review',
        'One long session per month',
        'Avoid feedback until the end',
      ],
      explanation: 'Recall and feedback loops make weak areas visible while momentum is still fresh.',
    },
  ];
}

function templateAssignment(goal: Pick<LearningGoal, 'title' | 'mode' | 'targetOutcome'>): LearningAssignment[] {
  const now = new Date().toISOString();
  return [
    {
      id: `${Date.now()}-assign-1`,
      title: goal.mode === 'teacher' ? `First ${goal.title} assignment` : `${goal.title} proof task`,
      instructions: goal.mode === 'teacher'
        ? 'Create one lesson objective, one practice task, and one check-for-understanding question.'
        : `Produce one small output that proves movement toward: ${goal.targetOutcome || goal.title}.`,
      done: false,
      createdAt: now,
    },
  ];
}

function templateMilestones(goal: Pick<LearningGoal, 'title' | 'mode' | 'targetOutcome'>): LearningMilestone[] {
  const now = new Date().toISOString();
  const subject = goal.title.trim() || 'this topic';
  const target = goal.targetOutcome || subject;
  const titles = goal.mode === 'teacher'
    ? ['Lesson ready', 'Practice assigned', 'Feedback loop running', 'Outcome proven']
    : goal.mode === 'coach'
      ? ['Baseline captured', 'Daily reps started', 'Feedback applied', 'Performance challenge done']
      : ['Foundation understood', 'Practice streak started', 'Quiz gaps revised', 'Final output completed'];
  return titles.map((title, index) => ({
    id: `${Date.now()}-mile-${index}`,
    title,
    proof: index === titles.length - 1 ? `Show a finished output for ${target}.` : `Attach or write proof for ${subject}.`,
    done: false,
    createdAt: now,
  }));
}

function templateSyllabus(goal: Pick<LearningGoal, 'title' | 'mode' | 'targetOutcome'>): LearningSyllabusWeek[] {
  const subject = goal.title.trim() || 'this topic';
  const target = goal.targetOutcome || `show progress in ${subject}`;
  const labels = goal.mode === 'teacher'
    ? ['Outcome and baseline', 'Teach the core model', 'Guided practice and discussion', 'Submission and feedback']
    : goal.mode === 'coach'
      ? ['Baseline attempt', 'Technique reps', 'Feedback and correction', 'Performance check']
      : ['Foundation', 'Guided practice', 'Recall and revision', 'Final output'];
  return labels.map((title, index) => ({
    id: `${Date.now()}-week-${index}`,
    title: `Week ${index + 1}: ${title}`,
    objective: index === 0 ? `Set baseline and target for ${subject}.` : `Advance ${subject} through active work.`,
    deliverable: index === labels.length - 1 ? `Proof that you can ${target}.` : 'One saved note, task, attempt, or teaching artifact.',
    done: false,
  }));
}

function templateRubric(goal: Pick<LearningGoal, 'title' | 'mode'>): LearningRubricCriterion[] {
  const subject = goal.title.trim() || 'this topic';
  const base = goal.mode === 'teacher'
    ? [
        ['Clarity', `Learner can explain the main idea of ${subject}.`],
        ['Practice quality', 'Submission shows deliberate attempt, not passive copying.'],
        ['Feedback response', 'Learner improves after correction.'],
      ]
    : [
        ['Understanding', `I can explain ${subject} without reading notes.`],
        ['Application', 'I can use it in a realistic task or problem.'],
        ['Consistency', 'I practiced and reviewed it repeatedly.'],
      ];
  return base.map(([title, description], index) => ({
    id: `${Date.now()}-rubric-${index}`,
    title,
    description,
    score: 0,
    maxScore: 5,
  }));
}

function templateCodeLabs(goal: Pick<LearningGoal, 'title' | 'category' | 'targetOutcome'>): LearningCodeExercise[] {
  const subject = goal.title.trim() || 'this topic';
  const codingContext = /code|program|software|app|web|python|javascript|typescript|react/i.test(`${goal.category} ${subject} ${goal.targetOutcome}`);
  if (!codingContext) return [];
  return [{
    id: `${Date.now()}-code-1`,
    title: `${subject} code-along`,
    language: 'TypeScript',
    prompt: `Build one tiny working example that proves progress toward ${goal.targetOutcome || subject}.`,
    starterCode: '// Write the smallest useful version first.\nfunction practice() {\n  return true;\n}\n',
    notes: 'Explain what changed, what broke, and what you learned.',
    done: false,
    createdAt: new Date().toISOString(),
  }];
}

function templateOneOnOneProfile(goal: Pick<LearningGoal, 'title' | 'category' | 'level' | 'targetOutcome'>): LearningOneOnOneProfile {
  return {
    enabled: true,
    headline: `1:1 ${goal.title} coaching`,
    bio: `Personal teaching, practice review, and mastery support for ${goal.targetOutcome || goal.title}.`,
    expertise: [goal.title, goal.category, LEVEL_LABELS[goal.level]],
    teachingStyle: 'Diagnose gaps, explain simply, practice together, then assign proof work.',
    baseCurrency: 'USD',
    baseRate: 35,
    policies: 'Payment is confirmed before the session. Reschedule at least 12 hours before the slot.',
  };
}

function templateOneOnOnePackages(goal: Pick<LearningGoal, 'title' | 'level'>): LearningOneOnOnePackage[] {
  const now = new Date().toISOString();
  return [
    {
      id: `${Date.now()}-1on1-starter`,
      title: 'Starter diagnostic',
      description: `One focused ${goal.title} session to assess level, gaps, and next practice plan.`,
      minutes: 30,
      sessionCount: 1,
      price: goal.level === 'advanced' ? 45 : 25,
      currency: 'USD',
      active: true,
      createdAt: now,
    },
    {
      id: `${Date.now()}-1on1-mastery`,
      title: 'Mastery sprint',
      description: 'Four guided sessions with prep, homework, review, and proof milestones.',
      minutes: 45,
      sessionCount: 4,
      price: goal.level === 'advanced' ? 180 : 120,
      currency: 'USD',
      active: true,
      createdAt: now,
    },
  ];
}

function templateOneOnOneSlots(): LearningOneOnOneSlot[] {
  const now = new Date().toISOString();
  return [
    { id: `${Date.now()}-slot-weekday`, label: 'Weekdays after 6 PM', durationMinutes: 45, available: true, createdAt: now },
    { id: `${Date.now()}-slot-weekend`, label: 'Weekend morning', durationMinutes: 60, available: true, createdAt: now },
  ];
}

function normalize(raw: unknown): LearningGoal[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Partial<LearningGoal> => !!item && typeof item === 'object')
    .map(item => ({
      id: typeof item.id === 'string' ? item.id : `${Date.now()}`,
      title: typeof item.title === 'string' ? item.title : 'Learning goal',
      category: typeof item.category === 'string' ? item.category : 'Academics',
      mode: item.mode === 'teacher' || item.mode === 'coach' ? item.mode : 'student',
      level: item.level === 'some' || item.level === 'intermediate' || item.level === 'advanced' ? item.level : 'beginner',
      targetOutcome: typeof item.targetOutcome === 'string' ? item.targetOutcome : '',
      dailyMinutes: typeof item.dailyMinutes === 'number' ? item.dailyMinutes : 25,
      deadline: typeof item.deadline === 'string' ? item.deadline : undefined,
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date().toISOString(),
      modules: Array.isArray(item.modules) ? item.modules as LearningModule[] : templateModules({
        title: item.title || 'Learning goal',
        mode: item.mode === 'teacher' || item.mode === 'coach' ? item.mode : 'student',
        level: item.level === 'some' || item.level === 'intermediate' || item.level === 'advanced' ? item.level : 'beginner',
        targetOutcome: item.targetOutcome || '',
      }),
      flashcards: Array.isArray(item.flashcards) ? item.flashcards as LearningFlashcard[] : templateFlashcards({
        title: item.title || 'Learning goal',
        mode: item.mode === 'teacher' || item.mode === 'coach' ? item.mode : 'student',
        targetOutcome: item.targetOutcome || '',
      }),
      quiz: Array.isArray(item.quiz) ? item.quiz as LearningQuizQuestion[] : templateQuiz({
        title: item.title || 'Learning goal',
        mode: item.mode === 'teacher' || item.mode === 'coach' ? item.mode : 'student',
        level: item.level === 'some' || item.level === 'intermediate' || item.level === 'advanced' ? item.level : 'beginner',
        targetOutcome: item.targetOutcome || '',
      }),
      assignments: Array.isArray(item.assignments) ? item.assignments as LearningAssignment[] : templateAssignment({
        title: item.title || 'Learning goal',
        mode: item.mode === 'teacher' || item.mode === 'coach' ? item.mode : 'student',
        targetOutcome: item.targetOutcome || '',
      }),
      resources: Array.isArray(item.resources) ? item.resources as LearningResource[] : [],
      reflections: Array.isArray(item.reflections) ? item.reflections as LearningReflection[] : [],
      milestones: Array.isArray(item.milestones) ? item.milestones as LearningMilestone[] : templateMilestones({
        title: item.title || 'Learning goal',
        mode: item.mode === 'teacher' || item.mode === 'coach' ? item.mode : 'student',
        targetOutcome: item.targetOutcome || '',
      }),
      sessions: Array.isArray(item.sessions) ? item.sessions as LearningSession[] : [],
      syllabus: Array.isArray(item.syllabus) ? item.syllabus as LearningSyllabusWeek[] : templateSyllabus({
        title: item.title || 'Learning goal',
        mode: item.mode === 'teacher' || item.mode === 'coach' ? item.mode : 'student',
        targetOutcome: item.targetOutcome || '',
      }),
      learners: Array.isArray(item.learners) ? item.learners as LearningLearner[] : [],
      rubric: Array.isArray(item.rubric) ? item.rubric as LearningRubricCriterion[] : templateRubric({
        title: item.title || 'Learning goal',
        mode: item.mode === 'teacher' || item.mode === 'coach' ? item.mode : 'student',
      }),
      evidence: Array.isArray(item.evidence) ? item.evidence as LearningEvidence[] : [],
      codeLabs: Array.isArray(item.codeLabs) ? item.codeLabs as LearningCodeExercise[] : templateCodeLabs({
        title: item.title || 'Learning goal',
        category: item.category || 'Academics',
        targetOutcome: item.targetOutcome || '',
      }),
      oneOnOneProfile: item.oneOnOneProfile && typeof item.oneOnOneProfile === 'object'
        ? item.oneOnOneProfile as LearningOneOnOneProfile
        : templateOneOnOneProfile({
          title: item.title || 'Learning goal',
          category: item.category || 'Academics',
          level: item.level === 'some' || item.level === 'intermediate' || item.level === 'advanced' ? item.level : 'beginner',
          targetOutcome: item.targetOutcome || '',
        }),
      oneOnOnePackages: Array.isArray(item.oneOnOnePackages) ? item.oneOnOnePackages as LearningOneOnOnePackage[] : templateOneOnOnePackages({
        title: item.title || 'Learning goal',
        level: item.level === 'some' || item.level === 'intermediate' || item.level === 'advanced' ? item.level : 'beginner',
      }),
      oneOnOneSlots: Array.isArray(item.oneOnOneSlots) ? item.oneOnOneSlots as LearningOneOnOneSlot[] : templateOneOnOneSlots(),
      oneOnOneBookings: Array.isArray(item.oneOnOneBookings) ? item.oneOnOneBookings as LearningOneOnOneBooking[] : [],
      weakTopics: Array.isArray(item.weakTopics) ? item.weakTopics.filter((topic): topic is string => typeof topic === 'string') : [],
      studyMinutes: typeof item.studyMinutes === 'number' ? item.studyMinutes : 0,
      streak: typeof item.streak === 'number' ? item.streak : 0,
      lastStudiedAt: typeof item.lastStudiedAt === 'string' ? item.lastStudiedAt : undefined,
    }));
}

export async function loadLearningGoals(): Promise<LearningGoal[]> {
  const remote = await pullMiniAppIfNewer('learn');
  if (Array.isArray(remote)) {
    const next = normalize(remote);
    await AsyncStorage.setItem(LEARN_KEY, JSON.stringify(next));
    return next;
  }
  try {
    return normalize(JSON.parse((await AsyncStorage.getItem(LEARN_KEY)) ?? '[]'));
  } catch {
    return [];
  }
}

function normalizeSettings(raw: unknown): LearningSettings {
  if (!raw || typeof raw !== 'object') return DEFAULT_LEARNING_SETTINGS;
  const item = raw as Partial<LearningSettings>;
  return {
    defaultMode: item.defaultMode === 'teacher' || item.defaultMode === 'coach' ? item.defaultMode : item.defaultMode === 'student' ? item.defaultMode : DEFAULT_LEARNING_SETTINGS.defaultMode,
    defaultLevel: item.defaultLevel === 'some' || item.defaultLevel === 'intermediate' || item.defaultLevel === 'advanced' || item.defaultLevel === 'beginner' ? item.defaultLevel : DEFAULT_LEARNING_SETTINGS.defaultLevel,
    defaultCategory: typeof item.defaultCategory === 'string' ? item.defaultCategory : DEFAULT_LEARNING_SETTINGS.defaultCategory,
    defaultDailyMinutes: typeof item.defaultDailyMinutes === 'number' ? item.defaultDailyMinutes : DEFAULT_LEARNING_SETTINGS.defaultDailyMinutes,
    defaultCodeLanguage: typeof item.defaultCodeLanguage === 'string' ? item.defaultCodeLanguage : DEFAULT_LEARNING_SETTINGS.defaultCodeLanguage,
    showTeacherTools: typeof item.showTeacherTools === 'boolean' ? item.showTeacherTools : DEFAULT_LEARNING_SETTINGS.showTeacherTools,
    showCodeLabs: typeof item.showCodeLabs === 'boolean' ? item.showCodeLabs : DEFAULT_LEARNING_SETTINGS.showCodeLabs,
    autoLinkNotes: typeof item.autoLinkNotes === 'boolean' ? item.autoLinkNotes : DEFAULT_LEARNING_SETTINGS.autoLinkNotes,
  };
}

export async function loadLearningSettings(): Promise<LearningSettings> {
  try {
    return normalizeSettings(JSON.parse((await AsyncStorage.getItem(LEARN_SETTINGS_KEY)) ?? 'null'));
  } catch {
    return DEFAULT_LEARNING_SETTINGS;
  }
}

export async function saveLearningSettings(settings: LearningSettings): Promise<void> {
  await AsyncStorage.setItem(LEARN_SETTINGS_KEY, JSON.stringify(normalizeSettings(settings)));
}

export async function saveLearningGoals(goals: LearningGoal[]): Promise<void> {
  const sorted = goals.slice().sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  await AsyncStorage.setItem(LEARN_KEY, JSON.stringify(sorted));
  pushMiniApp('learn', sorted);
}

export function updateLearningGoalSettings(goal: LearningGoal, input: Partial<Pick<LearningGoal, 'title' | 'category' | 'mode' | 'level' | 'targetOutcome' | 'dailyMinutes' | 'deadline'>>): LearningGoal {
  return {
    ...goal,
    title: typeof input.title === 'string' && input.title.trim() ? input.title.trim() : goal.title,
    category: typeof input.category === 'string' && input.category.trim() ? input.category.trim() : goal.category,
    mode: input.mode ?? goal.mode,
    level: input.level ?? goal.level,
    targetOutcome: typeof input.targetOutcome === 'string' ? input.targetOutcome.trim() : goal.targetOutcome,
    dailyMinutes: typeof input.dailyMinutes === 'number' && input.dailyMinutes > 0 ? Math.round(input.dailyMinutes) : goal.dailyMinutes,
    deadline: typeof input.deadline === 'string' && input.deadline.trim() ? input.deadline.trim() : undefined,
    updatedAt: new Date().toISOString(),
  };
}

export function createLearningGoal(input: {
  title: string;
  category: string;
  mode: LearningMode;
  level: LearningLevel;
  targetOutcome: string;
  dailyMinutes: number;
  deadline?: string;
}): LearningGoal {
  const now = new Date().toISOString();
  const goal: LearningGoal = {
    id: `${Date.now()}`,
    title: input.title.trim() || 'New learning goal',
    category: input.category,
    mode: input.mode,
    level: input.level,
    targetOutcome: input.targetOutcome.trim(),
    dailyMinutes: input.dailyMinutes,
    deadline: input.deadline,
    createdAt: now,
    updatedAt: now,
    modules: [],
    flashcards: [],
    quiz: [],
    assignments: [],
    resources: [],
    reflections: [],
    milestones: [],
    sessions: [],
    syllabus: [],
    learners: [],
    rubric: [],
    evidence: [],
    codeLabs: [],
    oneOnOneProfile: templateOneOnOneProfile({
      title: input.title,
      category: input.category,
      level: input.level,
      targetOutcome: input.targetOutcome,
    }),
    oneOnOnePackages: [],
    oneOnOneSlots: [],
    oneOnOneBookings: [],
    weakTopics: [],
    studyMinutes: 0,
    streak: 0,
  };
  return {
    ...goal,
    modules: templateModules(goal),
    flashcards: templateFlashcards(goal),
    quiz: templateQuiz(goal),
    assignments: templateAssignment(goal),
    milestones: templateMilestones(goal),
    syllabus: templateSyllabus(goal),
    rubric: templateRubric(goal),
    codeLabs: templateCodeLabs(goal),
    oneOnOnePackages: templateOneOnOnePackages(goal),
    oneOnOneSlots: templateOneOnOneSlots(),
  };
}

export function learningStats(goal: LearningGoal) {
  const tasks = goal.modules.flatMap(module => module.tasks);
  const done = tasks.filter(task => task.done).length;
  const total = tasks.length;
  const activeModule = goal.modules.find(module => module.status === 'active') ?? goal.modules[0];
  const quizAnswered = goal.quiz.filter(question => question.selected).length;
  const quizCorrect = goal.quiz.filter(question => question.correct).length;
  const milestoneDone = goal.milestones.filter(milestone => milestone.done).length;
  const rubricMax = goal.rubric.reduce((sum, item) => sum + item.maxScore, 0);
  const rubricScore = goal.rubric.reduce((sum, item) => sum + item.score, 0);
  const paidBookings = goal.oneOnOneBookings.filter(booking => booking.paymentStatus === 'paid');
  const oneOnOneRevenue = paidBookings.reduce((sum, booking) => sum + booking.price, 0);
  return {
    total,
    done,
    open: total - done,
    percent: total ? Math.round((done / total) * 100) : 0,
    activeModule,
    masteredCards: goal.flashcards.filter(card => card.mastered).length,
    quizAnswered,
    quizCorrect,
    quizScore: quizAnswered ? Math.round((quizCorrect / quizAnswered) * 100) : 0,
    assignmentOpen: goal.assignments.filter(assignment => !assignment.done).length,
    milestoneDone,
    sessions: goal.sessions.length,
    lastSession: goal.sessions[0],
    syllabusDone: goal.syllabus.filter(week => week.done).length,
    learners: goal.learners.length,
    evidence: goal.evidence.length,
    codeDone: goal.codeLabs.filter(item => item.done).length,
    rubricScore,
    rubricMax,
    rubricPercent: rubricMax ? Math.round((rubricScore / rubricMax) * 100) : 0,
    oneOnOneBookings: goal.oneOnOneBookings.length,
    oneOnOnePending: goal.oneOnOneBookings.filter(item => item.status === 'requested' || item.paymentStatus === 'pending').length,
    oneOnOnePaid: paidBookings.length,
    oneOnOneRevenue,
    oneOnOneCompleted: goal.oneOnOneBookings.filter(item => item.status === 'completed').length,
  };
}

export function echoLearningPartnerActions(goal: LearningGoal): EchoLearningPartnerAction[] {
  const stats = learningStats(goal);
  const activeModule = stats.activeModule?.title ?? goal.title;
  const weakTopics = goal.weakTopics.length ? goal.weakTopics.slice(0, 3).join(', ') : 'current active module';
  const target = goal.targetOutcome || `master ${goal.title}`;
  return [
    {
      id: 'tutor',
      mode: 'tutor',
      title: 'Teach this to me',
      role: 'Echo as a patient tutor',
      output: 'Explanation, examples, check questions',
      cadence: 'Use before every new module',
      prompt: `Teach ${activeModule} for ${goal.title} at ${LEVEL_LABELS[goal.level]} level. Explain it simply, give 2 examples, then ask me 3 check questions before moving on.`,
    },
    {
      id: 'teacher',
      mode: 'teacher',
      title: 'Turn it into a lesson',
      role: 'Echo as a teacher aide',
      output: 'Lesson plan, activity, assignment, rubric',
      cadence: 'Use when preparing a class or study session',
      prompt: `Create a teachable lesson for ${goal.title}. Target outcome: ${target}. Include a 20-minute lesson flow, one activity, one assignment, and a simple scoring rubric.`,
    },
    {
      id: 'coach',
      mode: 'coach',
      title: 'Coach today’s reps',
      role: 'Echo as an accountability coach',
      output: 'Daily drill, feedback question, next rep',
      cadence: `${goal.dailyMinutes} minutes daily`,
      prompt: `Coach me through a ${goal.dailyMinutes}-minute practice session for ${goal.title}. Focus on ${weakTopics}. Give one drill, one feedback question, and one next action.`,
    },
    {
      id: 'examiner',
      mode: 'examiner',
      title: 'Test my understanding',
      role: 'Echo as an examiner',
      output: 'Oral exam, quiz, mistake review',
      cadence: 'Use after practice or before proof work',
      prompt: `Examine me on ${goal.title}. Ask questions one by one, wait for my answer, grade strictly, then explain mistakes and update my weak topics.`,
    },
    {
      id: 'mastery',
      mode: 'mastery',
      title: 'Build a mastery loop',
      role: 'Echo as a mastery architect',
      output: 'Gap diagnosis, deliberate practice, proof project',
      cadence: 'Use weekly',
      prompt: `Build a mastery loop for ${goal.title}. Current progress is ${stats.percent}%, quiz score is ${stats.quizScore}%, rubric score is ${stats.rubricPercent}%. Diagnose gaps, design deliberate practice, and define proof that I have mastered it.`,
    },
    {
      id: 'assistant',
      mode: 'assistant',
      title: 'Organize my learning',
      role: 'Echo as a personal assistant',
      output: 'Tasks, notes, schedule, reminders',
      cadence: 'Use when planning the week',
      prompt: `Act as my personal learning assistant for ${goal.title}. Convert my roadmap, assignments, resources, and weak topics into tasks, notes, a schedule, and a realistic next 7 days.`,
    },
  ];
}

export function buildEchoPartnerPrompt(goal: LearningGoal, action: EchoLearningPartnerAction): string {
  const stats = learningStats(goal);
  const activeModule = stats.activeModule;
  const openTasks = activeModule?.tasks.filter(task => !task.done).map(task => task.title) ?? [];
  const resources = goal.resources.slice(0, 5).map(item => item.title);
  const assignments = goal.assignments.filter(item => !item.done).slice(0, 4).map(item => item.title);
  const learners = goal.learners.slice(0, 5).map(item => `${item.name}: ${item.progress}% toward ${item.target}`);
  const codeLabs = goal.codeLabs.filter(item => !item.done).slice(0, 3).map(item => `${item.title} (${item.language})`);
  return [
    `You are Echo, my ${action.role.toLowerCase()}.`,
    '',
    'Learning path context:',
    `- Topic: ${goal.title}`,
    `- Mode: ${MODE_LABELS[goal.mode]}`,
    `- Level: ${LEVEL_LABELS[goal.level]}`,
    `- Category: ${goal.category}`,
    `- Target outcome: ${goal.targetOutcome || 'Help me define one'}`,
    `- Daily time: ${goal.dailyMinutes} minutes`,
    `- Progress: ${stats.percent}%`,
    `- Quiz score: ${stats.quizScore}%`,
    `- Rubric score: ${stats.rubricScore}/${stats.rubricMax}`,
    `- Study time logged: ${goal.studyMinutes} minutes`,
    `- Active module: ${activeModule?.title ?? 'None'}`,
    `- Active module detail: ${activeModule?.description ?? 'None'}`,
    `- Open tasks: ${openTasks.length ? openTasks.join('; ') : 'None'}`,
    `- Weak topics: ${goal.weakTopics.length ? goal.weakTopics.join('; ') : 'None captured yet'}`,
    `- Open assignments: ${assignments.length ? assignments.join('; ') : 'None'}`,
    `- Saved resources: ${resources.length ? resources.join('; ') : 'None'}`,
    `- Code-alongs: ${codeLabs.length ? codeLabs.join('; ') : 'None'}`,
    `- Learners: ${learners.length ? learners.join('; ') : 'Solo learning'}`,
    '',
    `Requested Echo action: ${action.title}`,
    `Expected output: ${action.output}`,
    `Cadence: ${action.cadence}`,
    '',
    action.prompt,
    '',
    'Make the response practical. Include exact next actions, checks for understanding, and one way to prove progress inside Echo.',
  ].join('\n');
}

export function toggleLearningTask(goal: LearningGoal, moduleId: string, taskId: string): LearningGoal {
  const modules = goal.modules.map(module => {
    if (module.id !== moduleId) return module;
    const tasks = module.tasks.map(task => task.id === taskId ? { ...task, done: !task.done } : task);
    const complete = tasks.every(task => task.done);
    return { ...module, tasks, status: complete ? 'completed' as const : 'active' as const };
  });
  const firstOpenIndex = modules.findIndex(module => module.status !== 'completed');
  const nextModules = modules.map((module, index) => ({
    ...module,
    status: module.status === 'completed' ? 'completed' as const : index === Math.max(firstOpenIndex, 0) ? 'active' as const : 'locked' as const,
  }));
  const studiedToday = goal.lastStudiedAt?.slice(0, 10) === todayTaskDate();
  return {
    ...goal,
    modules: nextModules,
    studyMinutes: goal.studyMinutes + (studiedToday ? 0 : goal.dailyMinutes),
    streak: studiedToday ? goal.streak : goal.streak + 1,
    lastStudiedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function toggleFlashcard(goal: LearningGoal, cardId: string): LearningGoal {
  return {
    ...goal,
    flashcards: goal.flashcards.map(card => card.id === cardId ? { ...card, mastered: !card.mastered } : card),
    updatedAt: new Date().toISOString(),
  };
}

export function answerQuiz(goal: LearningGoal, questionId: string, selected: string): LearningGoal {
  return {
    ...goal,
    quiz: goal.quiz.map(question => question.id === questionId ? {
      ...question,
      selected,
      correct: selected === question.answer,
    } : question),
    weakTopics: goal.quiz.find(question => question.id === questionId)?.answer === selected
      ? goal.weakTopics
      : Array.from(new Set([...goal.weakTopics, goal.title])),
    updatedAt: new Date().toISOString(),
  };
}

export function addLearningFlashcard(goal: LearningGoal, front: string, back: string): LearningGoal {
  if (!front.trim() || !back.trim()) return goal;
  return {
    ...goal,
    flashcards: [{ id: `${Date.now()}`, front: front.trim(), back: back.trim(), mastered: false }, ...goal.flashcards],
    updatedAt: new Date().toISOString(),
  };
}

export function addLearningResource(goal: LearningGoal, title: string, detail?: string): LearningGoal {
  if (!title.trim()) return goal;
  const now = new Date().toISOString();
  return {
    ...goal,
    resources: [{ id: `${Date.now()}`, title: title.trim(), detail: detail?.trim() || undefined, kind: detail?.startsWith('http') ? 'link' : 'note', createdAt: now }, ...goal.resources],
    updatedAt: now,
  };
}

export function addLearningReflection(goal: LearningGoal, text: string): LearningGoal {
  if (!text.trim()) return goal;
  const now = new Date().toISOString();
  return {
    ...goal,
    reflections: [{ id: `${Date.now()}`, text: text.trim(), createdAt: now }, ...goal.reflections],
    updatedAt: now,
  };
}

export function toggleAssignment(goal: LearningGoal, assignmentId: string): LearningGoal {
  return {
    ...goal,
    assignments: goal.assignments.map(assignment => assignment.id === assignmentId ? { ...assignment, done: !assignment.done } : assignment),
    updatedAt: new Date().toISOString(),
  };
}

export function toggleMilestone(goal: LearningGoal, milestoneId: string): LearningGoal {
  return {
    ...goal,
    milestones: goal.milestones.map(milestone => milestone.id === milestoneId ? { ...milestone, done: !milestone.done } : milestone),
    updatedAt: new Date().toISOString(),
  };
}

export function addLearningSession(goal: LearningGoal, input: { title: string; minutes: number; focus: string; notes?: string }): LearningGoal {
  const now = new Date().toISOString();
  const studiedToday = goal.lastStudiedAt?.slice(0, 10) === todayTaskDate();
  const session: LearningSession = {
    id: `${Date.now()}`,
    title: input.title.trim() || `${input.minutes}m ${goal.title} session`,
    minutes: Math.max(1, Math.round(input.minutes)),
    focus: input.focus.trim() || goal.targetOutcome || goal.category,
    notes: input.notes?.trim() || undefined,
    completedAt: now,
  };
  return {
    ...goal,
    sessions: [session, ...goal.sessions],
    studyMinutes: goal.studyMinutes + session.minutes,
    streak: studiedToday ? goal.streak : goal.streak + 1,
    lastStudiedAt: now,
    updatedAt: now,
  };
}

export function toggleSyllabusWeek(goal: LearningGoal, weekId: string): LearningGoal {
  return {
    ...goal,
    syllabus: goal.syllabus.map(week => week.id === weekId ? { ...week, done: !week.done } : week),
    updatedAt: new Date().toISOString(),
  };
}

export function addLearningLearner(goal: LearningGoal, input: { name: string; target: string; level: LearningLevel; notes?: string }): LearningGoal {
  if (!input.name.trim()) return goal;
  const now = new Date().toISOString();
  return {
    ...goal,
    learners: [{
      id: `${Date.now()}`,
      name: input.name.trim(),
      target: input.target.trim() || goal.targetOutcome || goal.title,
      level: input.level,
      progress: 0,
      notes: input.notes?.trim() || undefined,
      joinedAt: now,
    }, ...goal.learners],
    updatedAt: now,
  };
}

export function updateLearnerProgress(goal: LearningGoal, learnerId: string, progress: number): LearningGoal {
  return {
    ...goal,
    learners: goal.learners.map(learner => learner.id === learnerId ? { ...learner, progress: Math.max(0, Math.min(100, Math.round(progress))) } : learner),
    updatedAt: new Date().toISOString(),
  };
}

export function scoreRubricCriterion(goal: LearningGoal, criterionId: string, score: number): LearningGoal {
  return {
    ...goal,
    rubric: goal.rubric.map(item => item.id === criterionId ? { ...item, score: Math.max(0, Math.min(item.maxScore, Math.round(score))) } : item),
    updatedAt: new Date().toISOString(),
  };
}

export function addRubricCriterion(goal: LearningGoal, title: string, description: string): LearningGoal {
  if (!title.trim()) return goal;
  return {
    ...goal,
    rubric: [{ id: `${Date.now()}`, title: title.trim(), description: description.trim() || 'Score this criterion from 0 to 5.', score: 0, maxScore: 5 }, ...goal.rubric],
    updatedAt: new Date().toISOString(),
  };
}

export function addLearningEvidence(goal: LearningGoal, title: string, detail: string): LearningGoal {
  if (!title.trim()) return goal;
  const now = new Date().toISOString();
  return {
    ...goal,
    evidence: [{
      id: `${Date.now()}`,
      title: title.trim(),
      detail: detail.trim(),
      kind: detail.trim().startsWith('http') ? 'link' : 'note',
      createdAt: now,
    }, ...goal.evidence],
    updatedAt: now,
  };
}

export function addLearningCodeLab(goal: LearningGoal, input: { title: string; language: string; prompt: string; starterCode: string; notes?: string }): LearningGoal {
  if (!input.title.trim()) return goal;
  const now = new Date().toISOString();
  return {
    ...goal,
    codeLabs: [{
      id: `${Date.now()}`,
      title: input.title.trim(),
      language: input.language.trim() || 'Text',
      prompt: input.prompt.trim() || `Practice ${goal.title} with a small working example.`,
      starterCode: input.starterCode.trim() || '// Start here\n',
      notes: input.notes?.trim() || undefined,
      done: false,
      createdAt: now,
    }, ...goal.codeLabs],
    updatedAt: now,
  };
}

export function toggleLearningCodeLab(goal: LearningGoal, codeLabId: string): LearningGoal {
  return {
    ...goal,
    codeLabs: goal.codeLabs.map(item => item.id === codeLabId ? { ...item, done: !item.done } : item),
    updatedAt: new Date().toISOString(),
  };
}

export function updateOneOnOneProfile(goal: LearningGoal, input: Partial<LearningOneOnOneProfile>): LearningGoal {
  return {
    ...goal,
    oneOnOneProfile: {
      ...goal.oneOnOneProfile,
      ...input,
      expertise: Array.isArray(input.expertise)
        ? input.expertise.map(item => item.trim()).filter(Boolean)
        : goal.oneOnOneProfile.expertise,
      baseRate: typeof input.baseRate === 'number' && input.baseRate >= 0 ? input.baseRate : goal.oneOnOneProfile.baseRate,
    },
    updatedAt: new Date().toISOString(),
  };
}

export function addOneOnOnePackage(goal: LearningGoal, input: {
  title: string;
  description: string;
  minutes: number;
  sessionCount: number;
  price: number;
  currency: CurrencyCode;
}): LearningGoal {
  if (!input.title.trim()) return goal;
  const now = new Date().toISOString();
  return {
    ...goal,
    oneOnOnePackages: [{
      id: `${Date.now()}`,
      title: input.title.trim(),
      description: input.description.trim() || `1:1 support for ${goal.title}`,
      minutes: Math.max(10, Math.round(input.minutes)),
      sessionCount: Math.max(1, Math.round(input.sessionCount)),
      price: Math.max(0, input.price),
      currency: input.currency,
      active: true,
      createdAt: now,
    }, ...goal.oneOnOnePackages],
    updatedAt: now,
  };
}

export function toggleOneOnOnePackage(goal: LearningGoal, packageId: string): LearningGoal {
  return {
    ...goal,
    oneOnOnePackages: goal.oneOnOnePackages.map(item => item.id === packageId ? { ...item, active: !item.active } : item),
    updatedAt: new Date().toISOString(),
  };
}

export function addOneOnOneSlot(goal: LearningGoal, input: { label: string; durationMinutes: number }): LearningGoal {
  if (!input.label.trim()) return goal;
  const now = new Date().toISOString();
  return {
    ...goal,
    oneOnOneSlots: [{
      id: `${Date.now()}`,
      label: input.label.trim(),
      durationMinutes: Math.max(10, Math.round(input.durationMinutes)),
      available: true,
      createdAt: now,
    }, ...goal.oneOnOneSlots],
    updatedAt: now,
  };
}

export function toggleOneOnOneSlot(goal: LearningGoal, slotId: string): LearningGoal {
  return {
    ...goal,
    oneOnOneSlots: goal.oneOnOneSlots.map(item => item.id === slotId ? { ...item, available: !item.available } : item),
    updatedAt: new Date().toISOString(),
  };
}

export function requestOneOnOneBooking(goal: LearningGoal, input: {
  learnerName: string;
  learnerGoal: string;
  packageId?: string;
  scheduledFor?: string;
  meetingLink?: string;
}): LearningGoal {
  if (!input.learnerName.trim()) return goal;
  const selectedPackage = goal.oneOnOnePackages.find(item => item.id === input.packageId)
    ?? goal.oneOnOnePackages.find(item => item.active)
    ?? templateOneOnOnePackages(goal)[0];
  const now = new Date().toISOString();
  const booking: LearningOneOnOneBooking = {
    id: `${Date.now()}`,
    learnerName: input.learnerName.trim(),
    learnerGoal: input.learnerGoal.trim() || goal.targetOutcome || goal.title,
    packageId: selectedPackage.id,
    packageTitle: selectedPackage.title,
    minutes: selectedPackage.minutes,
    sessionCount: selectedPackage.sessionCount,
    price: selectedPackage.price,
    currency: selectedPackage.currency,
    status: 'requested',
    paymentStatus: selectedPackage.price > 0 ? 'unpaid' : 'paid',
    scheduledFor: input.scheduledFor?.trim() || undefined,
    meetingLink: input.meetingLink?.trim() || goal.oneOnOneProfile.meetingLink,
    createdAt: now,
    updatedAt: now,
  };
  return {
    ...goal,
    oneOnOneBookings: [booking, ...goal.oneOnOneBookings],
    updatedAt: now,
  };
}

export function updateOneOnOneBookingStatus(goal: LearningGoal, bookingId: string, status: OneOnOneBookingStatus, paymentStatus?: OneOnOnePaymentStatus): LearningGoal {
  const now = new Date().toISOString();
  return {
    ...goal,
    oneOnOneBookings: goal.oneOnOneBookings.map(booking => booking.id === bookingId ? {
      ...booking,
      status,
      paymentStatus: paymentStatus ?? (status === 'accepted' && booking.paymentStatus === 'unpaid' ? 'pending' : status === 'completed' ? 'paid' : booking.paymentStatus),
      updatedAt: now,
    } : booking),
    updatedAt: now,
  };
}

export function updateOneOnOneBookingDetails(goal: LearningGoal, bookingId: string, input: Partial<Pick<LearningOneOnOneBooking, 'scheduledFor' | 'meetingLink' | 'prepNote' | 'homework' | 'followUp'>>): LearningGoal {
  const now = new Date().toISOString();
  return {
    ...goal,
    oneOnOneBookings: goal.oneOnOneBookings.map(booking => booking.id === bookingId ? {
      ...booking,
      scheduledFor: typeof input.scheduledFor === 'string' ? input.scheduledFor.trim() || undefined : booking.scheduledFor,
      meetingLink: typeof input.meetingLink === 'string' ? input.meetingLink.trim() || undefined : booking.meetingLink,
      prepNote: typeof input.prepNote === 'string' ? input.prepNote.trim() || undefined : booking.prepNote,
      homework: typeof input.homework === 'string' ? input.homework.trim() || undefined : booking.homework,
      followUp: typeof input.followUp === 'string' ? input.followUp.trim() || undefined : booking.followUp,
      updatedAt: now,
    } : booking),
    updatedAt: now,
  };
}

export async function createLinkedLearningNote(goal: LearningGoal, title: string, body: string): Promise<LearningGoal> {
  const noteTitle = title.trim() || `${goal.title} study note`;
  const noteBody = body.trim() || `Learning note for ${goal.title}`;
  await createNote({ title: noteTitle, body: noteBody, color: '#38BDF8' });
  return addLearningResource(goal, noteTitle, noteBody);
}

export function addLearningAssignment(goal: LearningGoal, title: string, instructions: string): LearningGoal {
  if (!title.trim()) return goal;
  const now = new Date().toISOString();
  return {
    ...goal,
    assignments: [{
      id: `${Date.now()}`,
      title: title.trim(),
      instructions: instructions.trim() || 'Complete the assigned practice and bring one question back.',
      done: false,
      createdAt: now,
    }, ...goal.assignments],
    updatedAt: now,
  };
}

export async function createLearningTask(goal: LearningGoal, taskTitle?: string): Promise<void> {
  const now = new Date().toISOString();
  const tasks = await loadTasks();
  const task: TaskItem = {
    id: `${Date.now()}`,
    title: taskTitle || `Study ${goal.title}`,
    notes: `${MODE_LABELS[goal.mode]} goal: ${goal.targetOutcome || goal.category}`,
    due: todayTaskDate(),
    done: false,
    priority: 'high',
    createdAt: now,
    updatedAt: now,
  };
  await saveTasks([task, ...tasks]);
}

export async function createLearningPlanNote(goal: LearningGoal): Promise<void> {
  const stats = learningStats(goal);
  await createNote({
    title: `${goal.title} learning plan`,
    body: [
      `Mode: ${MODE_LABELS[goal.mode]}`,
      `Level: ${LEVEL_LABELS[goal.level]}`,
      `Target: ${goal.targetOutcome || 'Not set'}`,
      `Daily time: ${goal.dailyMinutes} minutes`,
      `Progress: ${stats.percent}%`,
      `Quiz: ${stats.quizCorrect}/${stats.quizAnswered || goal.quiz.length}`,
      `Flashcards mastered: ${stats.masteredCards}/${goal.flashcards.length}`,
      `Sessions logged: ${stats.sessions}`,
      `Milestones: ${stats.milestoneDone}/${goal.milestones.length}`,
      `Syllabus: ${stats.syllabusDone}/${goal.syllabus.length}`,
      `Rubric: ${stats.rubricScore}/${stats.rubricMax}`,
      `Learners: ${stats.learners}`,
      `Evidence items: ${stats.evidence}`,
      `Code labs: ${stats.codeDone}/${goal.codeLabs.length}`,
      `1:1 bookings: ${stats.oneOnOneBookings}`,
      `1:1 paid sessions: ${stats.oneOnOnePaid}`,
      `1:1 revenue tracked: ${stats.oneOnOneRevenue} ${goal.oneOnOneProfile.baseCurrency}`,
      '',
      'Roadmap',
      ...goal.modules.map((module, index) => `${index + 1}. ${module.title} - ${module.description}`),
      '',
      'Syllabus',
      ...goal.syllabus.map((week, index) => `${index + 1}. ${week.done ? '[x]' : '[ ]'} ${week.title} - ${week.objective} Deliverable: ${week.deliverable}`),
      '',
      'Milestones',
      ...goal.milestones.map((milestone, index) => `${index + 1}. ${milestone.done ? '[x]' : '[ ]'} ${milestone.title} - ${milestone.proof}`),
      '',
      'Rubric',
      ...goal.rubric.map(item => `- ${item.title}: ${item.score}/${item.maxScore} - ${item.description}`),
      '',
      'Code labs',
      ...goal.codeLabs.map(item => `- ${item.done ? '[x]' : '[ ]'} ${item.title} (${item.language}) - ${item.prompt}`),
      '',
      'Paid 1:1 teaching',
      `Offer: ${goal.oneOnOneProfile.headline}`,
      `Style: ${goal.oneOnOneProfile.teachingStyle}`,
      ...goal.oneOnOnePackages.map(item => `- ${item.active ? '[active]' : '[paused]'} ${item.title}: ${item.sessionCount} x ${item.minutes}m for ${item.price} ${item.currency}`),
      ...goal.oneOnOneBookings.slice(0, 5).map(item => `- ${item.learnerName}: ${item.packageTitle}, ${item.status}, payment ${item.paymentStatus}`),
      '',
      'Coach prompts',
      ...learningCoachPrompts(goal).slice(0, 4).map(prompt => `- ${prompt}`),
      '',
      'Weak topics',
      ...(goal.weakTopics.length ? goal.weakTopics.map(topic => `- ${topic}`) : ['- None yet']),
    ].join('\n'),
    color: '#38BDF8',
  });
}

export async function scheduleLearningBlock(goal: LearningGoal): Promise<void> {
  const now = new Date().toISOString();
  const items = await loadPlanner();
  const item: PlannerItem = {
    id: `${Date.now()}`,
    title: `${goal.dailyMinutes}m ${goal.title} session`,
    date: plannerToday(),
    slot: 'afternoon',
    done: false,
    createdAt: now,
  };
  await savePlanner([item, ...items]);
}

export function learningCoachPrompts(goal: LearningGoal): string[] {
  const target = goal.targetOutcome || `improve at ${goal.title}`;
  if (goal.mode === 'teacher') {
    return [
      `Turn ${goal.title} into a 20-minute lesson with examples and checks for understanding.`,
      `Create 5 quiz questions for ${goal.title} at ${LEVEL_LABELS[goal.level]} level.`,
      `Design one assignment that proves students can ${target}.`,
      `Review weak student answers and suggest feedback categories.`,
    ];
  }
  if (goal.mode === 'coach') {
    return [
      `Coach me through today's ${goal.title} practice with one drill and one feedback question.`,
      `Give me a harder version of the current ${goal.title} exercise.`,
      `Help me evaluate my last attempt and choose the next rep.`,
      `Create a 7-day skill progression toward ${target}.`,
    ];
  }
  return [
    `Teach me ${goal.title} from first principles and ask one check question.`,
    `Quiz me on ${goal.title} and explain mistakes without giving away answers too early.`,
    `Make concise notes and flashcards for ${goal.title}.`,
    `Create a study plan to ${target} with daily recall and revision.`,
  ];
}
