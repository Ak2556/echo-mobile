// Exercise library for the Fitness mini-app.
//
// Two layers:
//   EXERCISES        — featured movements with two keyframe poses for the
//                      animated side-view stick figure (100×100 viewBox,
//                      ground at y=88; knee2/ankle2 = far leg, mirrors the
//                      near leg when omitted).
//   EXERCISE_CATALOG — the full 100+ catalog for workout logging and lift
//                      tracking, grouped by muscle with equipment tags.

export interface Pose {
  head: [number, number];
  shoulder: [number, number];
  hip: [number, number];
  knee: [number, number];
  ankle: [number, number];
  elbow: [number, number];
  hand: [number, number];
  knee2?: [number, number];
  ankle2?: [number, number];
}

export interface Exercise {
  id: string;
  name: string;
  muscles: string;
  /** short form cues */
  cues: string[];
  /** ms for one half-cycle (A→B) */
  tempo: number;
  /** circle drawn at the hand: barbell plate / dumbbell */
  prop?: 'bar' | 'dumbbell';
  poses: [Pose, Pose];
}

export const EXERCISES: Exercise[] = [
  {
    id: 'squat',
    name: 'Squat',
    muscles: 'Quads · glutes · core',
    cues: ['Feet shoulder-width, toes slightly out', 'Sit back and down, chest up', 'Drive through heels to stand'],
    tempo: 900,
    poses: [
      { head: [50, 15], shoulder: [50, 26], hip: [50, 52], knee: [50, 70], ankle: [50, 88], elbow: [50, 38], hand: [50, 48] },
      { head: [47, 36], shoulder: [44, 44], hip: [36, 62], knee: [54, 68], ankle: [50, 88], elbow: [56, 46], hand: [66, 44] },
    ],
  },
  {
    id: 'pushup',
    name: 'Push-up',
    muscles: 'Chest · triceps · core',
    cues: ['Hands under shoulders, body straight', 'Lower chest to the floor', 'Press up without sagging hips'],
    tempo: 850,
    poses: [
      { head: [32, 54], shoulder: [40, 60], hip: [58, 70], knee: [68, 76], ankle: [80, 84], elbow: [40, 74], hand: [40, 88] },
      { head: [30, 72], shoulder: [40, 78], hip: [58, 78], knee: [68, 80], ankle: [80, 84], elbow: [48, 84], hand: [40, 88] },
    ],
  },
  {
    id: 'plank',
    name: 'Plank',
    muscles: 'Core · shoulders',
    cues: ['Elbows under shoulders', 'Squeeze glutes, tuck ribs', 'Hold a straight line, breathe'],
    tempo: 1400,
    poses: [
      { head: [30, 58], shoulder: [38, 64], hip: [56, 68], knee: [66, 72], ankle: [78, 80], elbow: [34, 86], hand: [46, 86] },
      { head: [30, 59], shoulder: [38, 65], hip: [56, 67], knee: [66, 72], ankle: [78, 80], elbow: [34, 86], hand: [46, 86] },
    ],
  },
  {
    id: 'lunge',
    name: 'Lunge',
    muscles: 'Quads · glutes · balance',
    cues: ['Step forward, torso tall', 'Lower until both knees hit 90°', 'Push off the front heel'],
    tempo: 950,
    poses: [
      { head: [50, 15], shoulder: [50, 26], hip: [50, 52], knee: [50, 70], ankle: [50, 88], elbow: [50, 38], hand: [50, 48] },
      { head: [46, 28], shoulder: [46, 38], hip: [46, 62], knee: [58, 70], ankle: [58, 88], knee2: [38, 78], ankle2: [30, 86], elbow: [52, 48], hand: [48, 56] },
    ],
  },
  {
    id: 'deadlift',
    name: 'Deadlift',
    muscles: 'Hamstrings · back · grip',
    cues: ['Bar over mid-foot, flat back', 'Hinge at hips, not the waist', 'Stand tall, squeeze glutes'],
    tempo: 1000,
    prop: 'bar',
    poses: [
      { head: [50, 15], shoulder: [50, 26], hip: [50, 52], knee: [50, 70], ankle: [50, 88], elbow: [51, 38], hand: [52, 50] },
      { head: [62, 42], shoulder: [56, 48], hip: [40, 54], knee: [46, 72], ankle: [50, 88], elbow: [56, 62], hand: [56, 76] },
    ],
  },
  {
    id: 'glute-bridge',
    name: 'Glute Bridge',
    muscles: 'Glutes · hamstrings',
    cues: ['Lie back, heels close to hips', 'Drive hips up through heels', 'Pause at the top, lower slow'],
    tempo: 900,
    poses: [
      { head: [18, 84], shoulder: [28, 84], hip: [48, 82], knee: [62, 66], ankle: [70, 88], elbow: [36, 86], hand: [44, 86] },
      { head: [18, 84], shoulder: [28, 82], hip: [48, 64], knee: [62, 62], ankle: [70, 88], elbow: [36, 86], hand: [44, 86] },
    ],
  },
  {
    id: 'curl',
    name: 'Bicep Curl',
    muscles: 'Biceps · forearms',
    cues: ['Elbows pinned to your sides', 'Curl without swinging', 'Lower under control'],
    tempo: 800,
    prop: 'dumbbell',
    poses: [
      { head: [50, 15], shoulder: [50, 26], hip: [50, 52], knee: [50, 70], ankle: [50, 88], elbow: [50, 44], hand: [53, 58] },
      { head: [50, 15], shoulder: [50, 26], hip: [50, 52], knee: [50, 70], ankle: [50, 88], elbow: [50, 44], hand: [58, 32] },
    ],
  },
  {
    id: 'press',
    name: 'Shoulder Press',
    muscles: 'Shoulders · triceps',
    cues: ['Start at shoulder height', 'Press straight overhead', 'Don’t flare the ribs'],
    tempo: 850,
    prop: 'dumbbell',
    poses: [
      { head: [50, 16], shoulder: [50, 27], hip: [50, 52], knee: [50, 70], ankle: [50, 88], elbow: [60, 34], hand: [58, 24] },
      { head: [50, 16], shoulder: [50, 27], hip: [50, 52], knee: [50, 70], ankle: [50, 88], elbow: [58, 18], hand: [58, 6] },
    ],
  },
];

// ── Full catalog ─────────────────────────────────────────────────────────────

export type MuscleGroup =
  | 'Chest' | 'Back' | 'Shoulders' | 'Biceps' | 'Triceps'
  | 'Legs' | 'Glutes' | 'Core' | 'Cardio' | 'Full body';

export const MUSCLE_GROUPS: MuscleGroup[] = [
  'Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps',
  'Legs', 'Glutes', 'Core', 'Cardio', 'Full body',
];

export interface CatalogExercise {
  id: string;
  name: string;
  muscle: MuscleGroup;
  equipment: string;
  /** id of a featured EXERCISES entry with an animated demo */
  demoId?: string;
}

const slug = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function group(muscle: MuscleGroup, rows: [string, string, string?][]): CatalogExercise[] {
  return rows.map(([name, equipment, demoId]) => ({ id: slug(name), name, muscle, equipment, demoId }));
}

export const EXERCISE_CATALOG: CatalogExercise[] = [
  ...group('Chest', [
    ['Bench Press', 'Barbell'],
    ['Incline Bench Press', 'Barbell'],
    ['Decline Bench Press', 'Barbell'],
    ['Dumbbell Bench Press', 'Dumbbells'],
    ['Incline Dumbbell Press', 'Dumbbells'],
    ['Dumbbell Fly', 'Dumbbells'],
    ['Cable Crossover', 'Cable'],
    ['Pec Deck Fly', 'Machine'],
    ['Machine Chest Press', 'Machine'],
    ['Chest Dip', 'Bodyweight'],
    ['Push-up', 'Bodyweight', 'pushup'],
    ['Incline Push-up', 'Bodyweight'],
  ]),
  ...group('Back', [
    ['Deadlift', 'Barbell', 'deadlift'],
    ['Pull-up', 'Bodyweight'],
    ['Chin-up', 'Bodyweight'],
    ['Lat Pulldown', 'Cable'],
    ['Barbell Row', 'Barbell'],
    ['Dumbbell Row', 'Dumbbell'],
    ['T-Bar Row', 'Barbell'],
    ['Seated Cable Row', 'Cable'],
    ['Face Pull', 'Cable'],
    ['Straight-Arm Pulldown', 'Cable'],
    ['Rack Pull', 'Barbell'],
    ['Good Morning', 'Barbell'],
    ['Inverted Row', 'Bodyweight'],
    ['Back Extension', 'Bodyweight'],
  ]),
  ...group('Shoulders', [
    ['Overhead Press', 'Barbell', 'press'],
    ['Dumbbell Shoulder Press', 'Dumbbells', 'press'],
    ['Arnold Press', 'Dumbbells'],
    ['Lateral Raise', 'Dumbbells'],
    ['Front Raise', 'Dumbbells'],
    ['Rear Delt Fly', 'Dumbbells'],
    ['Cable Lateral Raise', 'Cable'],
    ['Upright Row', 'Barbell'],
    ['Barbell Shrug', 'Barbell'],
    ['Machine Shoulder Press', 'Machine'],
  ]),
  ...group('Biceps', [
    ['Barbell Curl', 'Barbell', 'curl'],
    ['Dumbbell Curl', 'Dumbbells', 'curl'],
    ['Hammer Curl', 'Dumbbells'],
    ['Preacher Curl', 'Barbell'],
    ['Incline Dumbbell Curl', 'Dumbbells'],
    ['Cable Curl', 'Cable'],
    ['Concentration Curl', 'Dumbbell'],
    ['EZ-Bar Curl', 'EZ bar'],
  ]),
  ...group('Triceps', [
    ['Close-Grip Bench Press', 'Barbell'],
    ['Skull Crusher', 'EZ bar'],
    ['Triceps Pushdown', 'Cable'],
    ['Rope Pushdown', 'Cable'],
    ['Overhead Triceps Extension', 'Dumbbell'],
    ['Triceps Dip', 'Bodyweight'],
    ['Diamond Push-up', 'Bodyweight'],
    ['Cable Kickback', 'Cable'],
  ]),
  ...group('Legs', [
    ['Back Squat', 'Barbell', 'squat'],
    ['Front Squat', 'Barbell', 'squat'],
    ['Goblet Squat', 'Dumbbell', 'squat'],
    ['Leg Press', 'Machine'],
    ['Hack Squat', 'Machine'],
    ['Bulgarian Split Squat', 'Dumbbells'],
    ['Walking Lunge', 'Dumbbells', 'lunge'],
    ['Reverse Lunge', 'Bodyweight', 'lunge'],
    ['Step-up', 'Dumbbells'],
    ['Leg Extension', 'Machine'],
    ['Lying Leg Curl', 'Machine'],
    ['Seated Leg Curl', 'Machine'],
    ['Romanian Deadlift', 'Barbell', 'deadlift'],
    ['Sumo Deadlift', 'Barbell', 'deadlift'],
    ['Standing Calf Raise', 'Machine'],
    ['Seated Calf Raise', 'Machine'],
  ]),
  ...group('Glutes', [
    ['Hip Thrust', 'Barbell', 'glute-bridge'],
    ['Glute Bridge', 'Bodyweight', 'glute-bridge'],
    ['Glute Kickback', 'Cable'],
    ['Sumo Squat', 'Dumbbell', 'squat'],
    ['Frog Pump', 'Bodyweight'],
    ['Curtsy Lunge', 'Bodyweight', 'lunge'],
  ]),
  ...group('Core', [
    ['Plank', 'Bodyweight', 'plank'],
    ['Side Plank', 'Bodyweight', 'plank'],
    ['Crunch', 'Bodyweight'],
    ['Bicycle Crunch', 'Bodyweight'],
    ['Hanging Leg Raise', 'Bodyweight'],
    ['Lying Leg Raise', 'Bodyweight'],
    ['Russian Twist', 'Bodyweight'],
    ['Mountain Climber', 'Bodyweight', 'pushup'],
    ['Ab Wheel Rollout', 'Ab wheel'],
    ['Cable Crunch', 'Cable'],
    ['V-Up', 'Bodyweight'],
    ['Dead Bug', 'Bodyweight'],
  ]),
  ...group('Cardio', [
    ['Treadmill Run', 'Machine'],
    ['Incline Walk', 'Machine'],
    ['Cycling', 'Machine'],
    ['Rowing Machine', 'Machine'],
    ['Elliptical', 'Machine'],
    ['Stair Climber', 'Machine'],
    ['Jump Rope', 'Rope'],
    ['Burpee', 'Bodyweight'],
    ['Jumping Jack', 'Bodyweight'],
    ['Box Jump', 'Box'],
    ['Battle Ropes', 'Ropes'],
    ['Sprint Intervals', 'Track'],
  ]),
  ...group('Full body', [
    ['Kettlebell Swing', 'Kettlebell'],
    ['Clean and Press', 'Barbell'],
    ['Power Clean', 'Barbell'],
    ['Thruster', 'Barbell', 'squat'],
    ["Farmer's Carry", 'Dumbbells'],
    ['Turkish Get-up', 'Kettlebell'],
  ]),
];

/** Substring search over catalog names; empty query returns nothing. */
export function searchExercises(query: string, limit = 6): CatalogExercise[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const starts: CatalogExercise[] = [];
  const contains: CatalogExercise[] = [];
  for (const e of EXERCISE_CATALOG) {
    const name = e.name.toLowerCase();
    if (name.startsWith(q)) starts.push(e);
    else if (name.includes(q) || e.muscle.toLowerCase() === q) contains.push(e);
  }
  return [...starts, ...contains].slice(0, limit);
}
