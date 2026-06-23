export type ThinkingArchetype = 'challenger' | 'builder' | 'connector' | 'synthesizer';

export interface ArchetypeInfo {
  id: ThinkingArchetype;
  label: string;
  tagline: string;
  description: string;
  color: string;
  dimColor: string;
}

export const ARCHETYPES: Record<ThinkingArchetype, ArchetypeInfo> = {
  challenger: {
    id: 'challenger',
    label: 'The Challenger',
    tagline: 'Questions what everyone else accepts.',
    description: 'You instinctively look for exceptions, weak assumptions, and unconsidered angles. You improve ideas by stress-testing them.',
    color: '#F97316',
    dimColor: '#F9731615',
  },
  builder: {
    id: 'builder',
    label: 'The Builder',
    tagline: 'Extends ideas into what they could become.',
    description: 'You hear an idea and immediately see how to develop it further. You think in possibilities, not just problems.',
    color: '#10B981',
    dimColor: '#10B98115',
  },
  connector: {
    id: 'connector',
    label: 'The Connector',
    tagline: 'Links ideas across different domains.',
    description: 'You draw unexpected threads between fields, disciplines, and experiences. Your best insights come from noticing what others miss in plain sight.',
    color: '#3B82F6',
    dimColor: '#3B82F615',
  },
  synthesizer: {
    id: 'synthesizer',
    label: 'The Synthesizer',
    tagline: 'Finds the common thread in opposing views.',
    description: 'You resist picking sides too quickly. You look for what each perspective gets right and find the more complete picture underneath.',
    color: '#8B5CF6',
    dimColor: '#8B5CF615',
  },
};

export interface ArchetypeQuestion {
  id: string;
  question: string;
  options: { label: string; archetype: ThinkingArchetype }[];
}

export const ARCHETYPE_QUESTIONS: ArchetypeQuestion[] = [
  {
    id: 'q1',
    question: "When you hear a bold new idea, what's your first instinct?",
    options: [
      { label: "Find the assumption it's built on and poke at it", archetype: 'challenger' },
      { label: 'Imagine where it could go if you pushed it further', archetype: 'builder' },
      { label: 'Notice how it connects to something from another field', archetype: 'connector' },
      { label: 'Look for what the opposing view gets right too', archetype: 'synthesizer' },
    ],
  },
  {
    id: 'q2',
    question: 'What kind of conversation energises you most?',
    options: [
      { label: 'One where someone pushes back on something I thought was settled', archetype: 'challenger' },
      { label: "One where we keep building on each other's ideas", archetype: 'builder' },
      { label: 'One that jumps between unexpected topics and still hangs together', archetype: 'connector' },
      { label: 'One where two disagreeing people both feel heard by the end', archetype: 'synthesizer' },
    ],
  },
  {
    id: 'q3',
    question: 'When you read something you disagree with, you tend to:',
    options: [
      { label: 'Write a clear counterargument in my head', archetype: 'challenger' },
      { label: "Think about how I'd refine or extend the underlying idea", archetype: 'builder' },
      { label: 'Recall three other things it reminds me of', archetype: 'connector' },
      { label: 'Try to understand why a smart person would believe this', archetype: 'synthesizer' },
    ],
  },
];

export function scoreArchetype(answers: Record<string, ThinkingArchetype>): ThinkingArchetype {
  const tally: Record<ThinkingArchetype, number> = {
    challenger: 0, builder: 0, connector: 0, synthesizer: 0,
  };
  for (const a of Object.values(answers)) {
    tally[a] = (tally[a] ?? 0) + 1;
  }
  const sorted = (Object.entries(tally) as [ThinkingArchetype, number][])
    .sort((a, b) => b[1] - a[1]);
  return sorted[0][0];
}
