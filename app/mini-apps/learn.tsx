import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import {
  BookOpen,
  ChalkboardTeacher,
  CheckCircle,
  CircleDashed,
  ClipboardText,
  GearSix,
  GraduationCap,
  LinkSimple,
  NotePencil,
  Play,
  Plus,
  Question,
  Sparkle,
  Target,
  Timer,
} from 'phosphor-react-native';
import { MiniAppShell } from '../../components/mini-apps/MiniAppShell';
import { EdgeFeaturePanel } from '../../components/mini-apps/EdgeFeaturePanel';
import { MiniCommandDeck } from '../../components/mini-apps/MiniKit';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { IconBadge } from '../../components/ui/IconBadge';
import { showToast } from '../../components/ui/Toast';
import { useTheme } from '../../lib/theme';
import { CURRENCIES, formatPrice, type CurrencyCode } from '../../lib/currency';
import { CURATED_LEARNING_TOPICS, createLearningGoalFromTopic, type CuratedLearningTopic } from '../../lib/learningTopicLibrary';
import {
  addOneOnOnePackage,
  addOneOnOneSlot,
  addLearningEvidence,
  addLearningAssignment,
  addLearningCodeLab,
  addLearningFlashcard,
  addLearningLearner,
  addLearningReflection,
  addLearningResource,
  addLearningSession,
  addRubricCriterion,
  answerQuiz,
  createLearningGoal,
  createLinkedLearningNote,
  createLearningPlanNote,
  createLearningTask,
  DEFAULT_LEARNING_SETTINGS,
  LEARNING_CATEGORIES,
  learningCoachPrompts,
  learningStats,
  loadLearningGoals,
  loadLearningSettings,
  MODE_LABELS,
  requestOneOnOneBooking,
  scheduleLearningBlock,
  saveLearningSettings,
  saveLearningGoals,
  scoreRubricCriterion,
  toggleOneOnOnePackage,
  toggleOneOnOneSlot,
  toggleAssignment,
  toggleFlashcard,
  toggleLearningTask,
  toggleMilestone,
  toggleLearningCodeLab,
  toggleSyllabusWeek,
  updateOneOnOneBookingDetails,
  updateOneOnOneBookingStatus,
  updateOneOnOneProfile,
  updateLearnerProgress,
  updateLearningGoalSettings,
  type LearningGoal,
  type LearningLevel,
  type LearningMode,
  type LearningSettings,
} from '../../lib/learn';

const ACCENT = '#4E7A8B'; // steel — warm editorial palette
const LEVELS: { id: LearningLevel; label: string }[] = [
  { id: 'beginner', label: 'Beginner' },
  { id: 'some', label: 'Some knowledge' },
  { id: 'intermediate', label: 'Intermediate' },
  { id: 'advanced', label: 'Advanced' },
];
const MODES: { id: LearningMode; label: string; caption: string }[] = [
  { id: 'student', label: 'Student', caption: 'Learn, revise, quiz' },
  { id: 'teacher', label: 'Teacher', caption: 'Lessons, assignments' },
  { id: 'coach', label: 'Coach', caption: 'Practice, feedback' },
];
const MINUTES = [10, 20, 30, 45, 60];
type LearnTab = 'today' | 'library' | 'oneOnOne' | 'studio' | 'people' | 'roadmap' | 'practice' | 'coach' | 'classroom' | 'progress' | 'settings';

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <AnimatedPressable onPress={onPress} scaleValue={0.94} haptic="light" accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active }}>
      <View style={{
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: active ? ACCENT : colors.surfaceHover,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: active ? ACCENT : colors.border,
      }}>
        <Text style={{ color: active ? '#fff' : colors.textSecondary, fontSize: 12, fontWeight: '800' }}>{label}</Text>
      </View>
    </AnimatedPressable>
  );
}

// Matches MiniStatCard's suite look (Fraunces accent value + eyebrow label);
// keeps minWidth so the 4-up stat rows in deeper tabs still wrap gracefully.
function Stat({ label, value }: { label: string; value: string }) {
  const { colors, font } = useTheme();
  return (
    <View style={{
      flex: 1,
      minWidth: 92,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 12,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.glassBorder,
    }}>
      <Text style={[font.display, { color: ACCENT, fontSize: 22 }]} numberOfLines={1}>{value}</Text>
      <Text style={[font.eyebrow, { color: colors.textMuted, fontSize: 10.5, marginTop: 3 }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export default function LearnScreen() {
  const router = useRouter();
  const { colors, font, radius } = useTheme();
  const [goals, setGoals] = useState<LearningGoal[]>([]);
  const [settings, setSettings] = useState<LearningSettings>(DEFAULT_LEARNING_SETTINGS);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tab, setTab] = useState<LearnTab>('today');
  const [showSetup, setShowSetup] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<string>(DEFAULT_LEARNING_SETTINGS.defaultCategory);
  const [mode, setMode] = useState<LearningMode>(DEFAULT_LEARNING_SETTINGS.defaultMode);
  const [level, setLevel] = useState<LearningLevel>(DEFAULT_LEARNING_SETTINGS.defaultLevel);
  const [targetOutcome, setTargetOutcome] = useState('');
  const [dailyMinutes, setDailyMinutes] = useState(DEFAULT_LEARNING_SETTINGS.defaultDailyMinutes);
  const [cardFront, setCardFront] = useState('');
  const [cardBack, setCardBack] = useState('');
  const [resourceTitle, setResourceTitle] = useState('');
  const [resourceDetail, setResourceDetail] = useState('');
  const [reflection, setReflection] = useState('');
  const [assignmentTitle, setAssignmentTitle] = useState('');
  const [assignmentInstructions, setAssignmentInstructions] = useState('');
  const [sessionTitle, setSessionTitle] = useState('');
  const [sessionFocus, setSessionFocus] = useState('');
  const [sessionNotes, setSessionNotes] = useState('');
  const [sessionMinutes, setSessionMinutes] = useState('25');
  const [learnerName, setLearnerName] = useState('');
  const [learnerTarget, setLearnerTarget] = useState('');
  const [learnerNotes, setLearnerNotes] = useState('');
  const [learnerLevel, setLearnerLevel] = useState<LearningLevel>('beginner');
  const [evidenceTitle, setEvidenceTitle] = useState('');
  const [evidenceDetail, setEvidenceDetail] = useState('');
  const [rubricTitle, setRubricTitle] = useState('');
  const [rubricDescription, setRubricDescription] = useState('');
  const [codeTitle, setCodeTitle] = useState('');
  const [codeLanguage, setCodeLanguage] = useState('TypeScript');
  const [codePrompt, setCodePrompt] = useState('');
  const [codeStarter, setCodeStarter] = useState('');
  const [codeNotes, setCodeNotes] = useState('');
  const [linkedNoteTitle, setLinkedNoteTitle] = useState('');
  const [linkedNoteBody, setLinkedNoteBody] = useState('');
  const [topicSearch, setTopicSearch] = useState('');
  const [pathTitle, setPathTitle] = useState('');
  const [pathTarget, setPathTarget] = useState('');
  const [pathCategory, setPathCategory] = useState(DEFAULT_LEARNING_SETTINGS.defaultCategory);
  const [pathMode, setPathMode] = useState<LearningMode>(DEFAULT_LEARNING_SETTINGS.defaultMode);
  const [pathLevel, setPathLevel] = useState<LearningLevel>(DEFAULT_LEARNING_SETTINGS.defaultLevel);
  const [pathDailyMinutes, setPathDailyMinutes] = useState(String(DEFAULT_LEARNING_SETTINGS.defaultDailyMinutes));
  const [pathDeadline, setPathDeadline] = useState('');
  const [oneHeadline, setOneHeadline] = useState('');
  const [oneBio, setOneBio] = useState('');
  const [oneExpertise, setOneExpertise] = useState('');
  const [oneTeachingStyle, setOneTeachingStyle] = useState('');
  const [oneRate, setOneRate] = useState('35');
  const [oneCurrency, setOneCurrency] = useState<CurrencyCode>('USD');
  const [oneMeetingLink, setOneMeetingLink] = useState('');
  const [onePolicies, setOnePolicies] = useState('');
  const [packageTitle, setPackageTitle] = useState('');
  const [packageDescription, setPackageDescription] = useState('');
  const [packageMinutes, setPackageMinutes] = useState('45');
  const [packageCount, setPackageCount] = useState('1');
  const [packagePrice, setPackagePrice] = useState('35');
  const [slotLabel, setSlotLabel] = useState('');
  const [slotMinutes, setSlotMinutes] = useState('45');
  const [bookingLearner, setBookingLearner] = useState('');
  const [bookingGoal, setBookingGoal] = useState('');
  const [bookingSchedule, setBookingSchedule] = useState('');
  const [bookingMeeting, setBookingMeeting] = useState('');
  const [bookingPrep, setBookingPrep] = useState('');
  const [bookingHomework, setBookingHomework] = useState('');
  const [bookingFollowUp, setBookingFollowUp] = useState('');

  useFocusEffect(React.useCallback(() => {
    let active = true;
    Promise.all([loadLearningGoals(), loadLearningSettings()])
      .then(([next, nextSettings]) => {
        if (!active) return;
        setGoals(next);
        setSettings(nextSettings);
        setCategory(nextSettings.defaultCategory);
        setMode(nextSettings.defaultMode);
        setLevel(nextSettings.defaultLevel);
        setDailyMinutes(nextSettings.defaultDailyMinutes);
        setCodeLanguage(nextSettings.defaultCodeLanguage);
        setActiveId(current => current ?? next[0]?.id ?? null);
        setShowSetup(next.length === 0);
      })
      .catch(() => { if (active) setGoals([]); });
    return () => { active = false; };
  }, []));

  const activeGoal = useMemo(() => goals.find(goal => goal.id === activeId) ?? goals[0], [activeId, goals]);
  const stats = activeGoal ? learningStats(activeGoal) : null;
  const prompts = activeGoal ? learningCoachPrompts(activeGoal) : [];
  const learnTabs = useMemo(() => {
    const next: LearnTab[] = ['today', 'library', 'oneOnOne'];
    if (settings.showTeacherTools) next.push('studio', 'people');
    next.push('roadmap', 'practice', 'coach');
    if (settings.showTeacherTools) next.push('classroom');
    next.push('progress', 'settings');
    return next;
  }, [settings.showTeacherTools]);

  React.useEffect(() => {
    if (!activeGoal) return;
    setPathTitle(activeGoal.title);
    setPathTarget(activeGoal.targetOutcome);
    setPathCategory(activeGoal.category);
    setPathMode(activeGoal.mode);
    setPathLevel(activeGoal.level);
    setPathDailyMinutes(String(activeGoal.dailyMinutes));
    setPathDeadline(activeGoal.deadline ?? '');
    setOneHeadline(activeGoal.oneOnOneProfile.headline);
    setOneBio(activeGoal.oneOnOneProfile.bio);
    setOneExpertise(activeGoal.oneOnOneProfile.expertise.join(', '));
    setOneTeachingStyle(activeGoal.oneOnOneProfile.teachingStyle);
    setOneRate(String(activeGoal.oneOnOneProfile.baseRate));
    setOneCurrency(activeGoal.oneOnOneProfile.baseCurrency);
    setOneMeetingLink(activeGoal.oneOnOneProfile.meetingLink ?? '');
    setOnePolicies(activeGoal.oneOnOneProfile.policies);
  }, [activeGoal]);

  const persist = (next: LearningGoal[]) => {
    setGoals(next);
    void saveLearningGoals(next);
  };
  const updateGoal = (goal: LearningGoal) => persist(goals.map(item => item.id === goal.id ? goal : item));

  const addGoal = () => {
    const next = createLearningGoal({ title, category, mode, level, targetOutcome, dailyMinutes });
    persist([next, ...goals]);
    setActiveId(next.id);
    setShowSetup(false);
    setTab('today');
    setTitle('');
    setTargetOutcome('');
    showToast('Learning path created', 'Learn');
  };
  const startTopic = (topic: CuratedLearningTopic) => {
    const next = createLearningGoalFromTopic(topic);
    persist([next, ...goals]);
    setActiveId(next.id);
    setShowSetup(false);
    setTab('today');
    showToast('Curated path added', topic.title);
  };

  const saveNote = async () => {
    if (!activeGoal) return;
    await createLearningPlanNote(activeGoal);
    showToast('Saved learning plan to Notes', 'Learn');
  };
  const addTask = async () => {
    if (!activeGoal || !stats?.activeModule) return;
    const open = stats.activeModule.tasks.find(task => !task.done);
    await createLearningTask(activeGoal, open?.title);
    showToast('Added to Tasks', 'Learn');
  };
  const schedule = async () => {
    if (!activeGoal) return;
    await scheduleLearningBlock(activeGoal);
    showToast('Study block added to Planner', 'Learn');
  };

  const createCard = () => {
    if (!activeGoal) return;
    updateGoal(addLearningFlashcard(activeGoal, cardFront, cardBack));
    setCardFront('');
    setCardBack('');
  };
  const createResource = () => {
    if (!activeGoal) return;
    updateGoal(addLearningResource(activeGoal, resourceTitle, resourceDetail));
    setResourceTitle('');
    setResourceDetail('');
  };
  const createReflection = () => {
    if (!activeGoal) return;
    updateGoal(addLearningReflection(activeGoal, reflection));
    setReflection('');
  };
  const createAssignment = () => {
    if (!activeGoal) return;
    updateGoal(addLearningAssignment(activeGoal, assignmentTitle, assignmentInstructions));
    setAssignmentTitle('');
    setAssignmentInstructions('');
  };
  const createSession = () => {
    if (!activeGoal) return;
    updateGoal(addLearningSession(activeGoal, {
      title: sessionTitle,
      minutes: Number.parseInt(sessionMinutes, 10) || activeGoal.dailyMinutes,
      focus: sessionFocus,
      notes: sessionNotes,
    }));
    setSessionTitle('');
    setSessionFocus('');
    setSessionNotes('');
    setSessionMinutes(String(activeGoal.dailyMinutes));
  };
  const createLearner = () => {
    if (!activeGoal) return;
    updateGoal(addLearningLearner(activeGoal, { name: learnerName, target: learnerTarget, level: learnerLevel, notes: learnerNotes }));
    setLearnerName('');
    setLearnerTarget('');
    setLearnerNotes('');
    setLearnerLevel('beginner');
  };
  const createEvidence = () => {
    if (!activeGoal) return;
    updateGoal(addLearningEvidence(activeGoal, evidenceTitle, evidenceDetail));
    setEvidenceTitle('');
    setEvidenceDetail('');
  };
  const createRubric = () => {
    if (!activeGoal) return;
    updateGoal(addRubricCriterion(activeGoal, rubricTitle, rubricDescription));
    setRubricTitle('');
    setRubricDescription('');
  };
  const createCodeLab = () => {
    if (!activeGoal) return;
    updateGoal(addLearningCodeLab(activeGoal, { title: codeTitle, language: codeLanguage, prompt: codePrompt, starterCode: codeStarter, notes: codeNotes }));
    setCodeTitle('');
    setCodePrompt('');
    setCodeStarter('');
    setCodeNotes('');
  };
  const createLinkedNote = async () => {
    if (!activeGoal) return;
    if (settings.autoLinkNotes) {
      const next = await createLinkedLearningNote(activeGoal, linkedNoteTitle, linkedNoteBody);
      updateGoal(next);
    } else {
      updateGoal(addLearningResource(activeGoal, linkedNoteTitle, linkedNoteBody));
    }
    setLinkedNoteTitle('');
    setLinkedNoteBody('');
    showToast(settings.autoLinkNotes ? 'Saved study note' : 'Saved learning resource', 'Learn');
  };
  const applyPathSettings = () => {
    if (!activeGoal) return;
    updateGoal(updateLearningGoalSettings(activeGoal, {
      title: pathTitle,
      targetOutcome: pathTarget,
      category: pathCategory,
      mode: pathMode,
      level: pathLevel,
      dailyMinutes: Number.parseInt(pathDailyMinutes, 10) || activeGoal.dailyMinutes,
      deadline: pathDeadline,
    }));
    showToast('Learning path updated', 'Learn');
  };
  const updateSettings = (next: LearningSettings) => {
    setSettings(next);
    void saveLearningSettings(next);
  };
  const saveDefaults = () => {
    const next = {
      ...settings,
      defaultMode: pathMode,
      defaultLevel: pathLevel,
      defaultCategory: pathCategory,
      defaultDailyMinutes: Number.parseInt(pathDailyMinutes, 10) || settings.defaultDailyMinutes,
      defaultCodeLanguage: codeLanguage.trim() || settings.defaultCodeLanguage,
    };
    updateSettings(next);
    showToast('Defaults saved', 'Learn');
  };
  const saveOneOnOneProfile = () => {
    if (!activeGoal) return;
    updateGoal(updateOneOnOneProfile(activeGoal, {
      enabled: true,
      headline: oneHeadline,
      bio: oneBio,
      expertise: oneExpertise.split(','),
      teachingStyle: oneTeachingStyle,
      baseRate: Number.parseFloat(oneRate) || activeGoal.oneOnOneProfile.baseRate,
      baseCurrency: oneCurrency,
      meetingLink: oneMeetingLink,
      policies: onePolicies,
    }));
    showToast('1:1 offer updated', 'Learn');
  };
  const createPaidPackage = () => {
    if (!activeGoal) return;
    updateGoal(addOneOnOnePackage(activeGoal, {
      title: packageTitle,
      description: packageDescription,
      minutes: Number.parseInt(packageMinutes, 10) || 45,
      sessionCount: Number.parseInt(packageCount, 10) || 1,
      price: Number.parseFloat(packagePrice) || 0,
      currency: oneCurrency,
    }));
    setPackageTitle('');
    setPackageDescription('');
    setPackageMinutes('45');
    setPackageCount('1');
    setPackagePrice(String(Number.parseFloat(oneRate) || 35));
    showToast('Paid package added', 'Learn');
  };
  const createTeachingSlot = () => {
    if (!activeGoal) return;
    updateGoal(addOneOnOneSlot(activeGoal, {
      label: slotLabel,
      durationMinutes: Number.parseInt(slotMinutes, 10) || activeGoal.dailyMinutes,
    }));
    setSlotLabel('');
    setSlotMinutes('45');
  };
  const createBooking = (packageId?: string) => {
    if (!activeGoal) return;
    updateGoal(requestOneOnOneBooking(activeGoal, {
      learnerName: bookingLearner,
      learnerGoal: bookingGoal,
      packageId,
      scheduledFor: bookingSchedule,
      meetingLink: bookingMeeting,
    }));
    setBookingLearner('');
    setBookingGoal('');
    showToast('1:1 booking requested', 'Learn');
  };
  const saveBookingNotes = (bookingId: string) => {
    if (!activeGoal) return;
    updateGoal(updateOneOnOneBookingDetails(activeGoal, bookingId, {
      scheduledFor: bookingSchedule,
      meetingLink: bookingMeeting,
      prepNote: bookingPrep,
      homework: bookingHomework,
      followUp: bookingFollowUp,
    }));
    showToast('Session notes saved', 'Learn');
  };

  return (
    <MiniAppShell
      title="Learn"
      subtitle={activeGoal ? 'Master' : 'Master'}
      headerRight={(
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <AnimatedPressable onPress={() => setTab('settings')} scaleValue={0.9} haptic="light" accessibilityRole="button" accessibilityLabel="Learning settings">
            <View style={{ width: 38, height: 38, borderRadius: 14, backgroundColor: colors.surfaceHover, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
              <GearSix color={colors.textSecondary} size={18} weight="bold" />
            </View>
          </AnimatedPressable>
          <AnimatedPressable onPress={() => setShowSetup(true)} scaleValue={0.9} haptic="medium" accessibilityRole="button" accessibilityLabel="Create learning goal">
            <View style={{ width: 38, height: 38, borderRadius: 14, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' }}>
              <Plus color="#fff" size={18} weight="bold" />
            </View>
          </AnimatedPressable>
        </View>
      )}
    >
      {showSetup ? (
        <SetupPanel
          title={title}
          setTitle={setTitle}
          targetOutcome={targetOutcome}
          setTargetOutcome={setTargetOutcome}
          mode={mode}
          setMode={setMode}
          category={category}
          setCategory={setCategory}
          level={level}
          setLevel={setLevel}
          dailyMinutes={dailyMinutes}
          setDailyMinutes={setDailyMinutes}
          onCreate={addGoal}
        />
      ) : null}

      {activeGoal && stats ? (
        <>
          <Hero goal={activeGoal} stats={stats} />
          <MiniCommandDeck
            accent={ACCENT}
            title="Mastery studio"
            subtitle="Paths, practice, proof."
            metrics={[
              { label: 'Progress', value: `${stats.percent}%`, detail: 'path' },
              { label: 'Quiz', value: `${stats.quizScore}%`, detail: 'score' },
              { label: 'Study', value: `${activeGoal.studyMinutes}`, detail: 'minutes' },
            ]}
            chips={['Code-along', '1:1 teaching', 'Echo partner']}
          />

          {goals.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 12 }}>
              {goals.map(goal => <Chip key={goal.id} label={goal.title} active={goal.id === activeGoal.id} onPress={() => setActiveId(goal.id)} />)}
            </ScrollView>
          ) : null}

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 16 }}>
            {learnTabs.map(item => (
              <Chip key={item} label={item === 'today' ? 'Today' : item === 'people' ? 'People' : item === 'oneOnOne' ? '1:1' : item.charAt(0).toUpperCase() + item.slice(1)} active={tab === item} onPress={() => setTab(item)} />
            ))}
          </ScrollView>

          {tab === 'today' && (
            <TodayTab
              goal={activeGoal}
              stats={stats}
              onToggleTask={(moduleId, taskId) => updateGoal(toggleLearningTask(activeGoal, moduleId, taskId))}
              onSaveNote={saveNote}
              onAddTask={addTask}
              onSchedule={schedule}
              onPomodoro={() => router.push('/mini-apps/pomodoro' as Href)}
            />
          )}

          {tab === 'library' && (
            <TopicLibraryTab
              query={topicSearch}
              setQuery={setTopicSearch}
              onStartTopic={startTopic}
            />
          )}

          {tab === 'oneOnOne' && (
            <OneOnOneTab
              goal={activeGoal}
              stats={stats}
              oneHeadline={oneHeadline}
              setOneHeadline={setOneHeadline}
              oneBio={oneBio}
              setOneBio={setOneBio}
              oneExpertise={oneExpertise}
              setOneExpertise={setOneExpertise}
              oneTeachingStyle={oneTeachingStyle}
              setOneTeachingStyle={setOneTeachingStyle}
              oneRate={oneRate}
              setOneRate={setOneRate}
              oneCurrency={oneCurrency}
              setOneCurrency={setOneCurrency}
              oneMeetingLink={oneMeetingLink}
              setOneMeetingLink={setOneMeetingLink}
              onePolicies={onePolicies}
              setOnePolicies={setOnePolicies}
              onSaveProfile={saveOneOnOneProfile}
              packageTitle={packageTitle}
              setPackageTitle={setPackageTitle}
              packageDescription={packageDescription}
              setPackageDescription={setPackageDescription}
              packageMinutes={packageMinutes}
              setPackageMinutes={setPackageMinutes}
              packageCount={packageCount}
              setPackageCount={setPackageCount}
              packagePrice={packagePrice}
              setPackagePrice={setPackagePrice}
              onCreatePackage={createPaidPackage}
              onTogglePackage={(id) => updateGoal(toggleOneOnOnePackage(activeGoal, id))}
              slotLabel={slotLabel}
              setSlotLabel={setSlotLabel}
              slotMinutes={slotMinutes}
              setSlotMinutes={setSlotMinutes}
              onCreateSlot={createTeachingSlot}
              onToggleSlot={(id) => updateGoal(toggleOneOnOneSlot(activeGoal, id))}
              bookingLearner={bookingLearner}
              setBookingLearner={setBookingLearner}
              bookingGoal={bookingGoal}
              setBookingGoal={setBookingGoal}
              bookingSchedule={bookingSchedule}
              setBookingSchedule={setBookingSchedule}
              bookingMeeting={bookingMeeting}
              setBookingMeeting={setBookingMeeting}
              bookingPrep={bookingPrep}
              setBookingPrep={setBookingPrep}
              bookingHomework={bookingHomework}
              setBookingHomework={setBookingHomework}
              bookingFollowUp={bookingFollowUp}
              setBookingFollowUp={setBookingFollowUp}
              onCreateBooking={createBooking}
              onSaveBookingNotes={saveBookingNotes}
              onUpdateBookingStatus={(id, status, paymentStatus) => updateGoal(updateOneOnOneBookingStatus(activeGoal, id, status, paymentStatus))}
            />
          )}

          {tab === 'studio' && (
            <StudioTab
              goal={activeGoal}
              stats={stats}
              onToggleWeek={(id) => updateGoal(toggleSyllabusWeek(activeGoal, id))}
              onScoreRubric={(id, score) => updateGoal(scoreRubricCriterion(activeGoal, id, score))}
              rubricTitle={rubricTitle}
              setRubricTitle={setRubricTitle}
              rubricDescription={rubricDescription}
              setRubricDescription={setRubricDescription}
              onCreateRubric={createRubric}
              evidenceTitle={evidenceTitle}
              setEvidenceTitle={setEvidenceTitle}
              evidenceDetail={evidenceDetail}
              setEvidenceDetail={setEvidenceDetail}
              onCreateEvidence={createEvidence}
            />
          )}

          {tab === 'people' && (
            <PeopleTab
              goal={activeGoal}
              learnerName={learnerName}
              setLearnerName={setLearnerName}
              learnerTarget={learnerTarget}
              setLearnerTarget={setLearnerTarget}
              learnerNotes={learnerNotes}
              setLearnerNotes={setLearnerNotes}
              learnerLevel={learnerLevel}
              setLearnerLevel={setLearnerLevel}
              onCreateLearner={createLearner}
              onUpdateProgress={(id, progress) => updateGoal(updateLearnerProgress(activeGoal, id, progress))}
            />
          )}

          {tab === 'roadmap' && <RoadmapTab goal={activeGoal} />}

          {tab === 'practice' && (
            <PracticeTab
              goal={activeGoal}
              onToggleCard={(id) => updateGoal(toggleFlashcard(activeGoal, id))}
              onAnswer={(id, selected) => updateGoal(answerQuiz(activeGoal, id, selected))}
              cardFront={cardFront}
              setCardFront={setCardFront}
              cardBack={cardBack}
              setCardBack={setCardBack}
              onCreateCard={createCard}
              codeTitle={codeTitle}
              setCodeTitle={setCodeTitle}
              codeLanguage={codeLanguage}
              setCodeLanguage={setCodeLanguage}
              codePrompt={codePrompt}
              setCodePrompt={setCodePrompt}
              codeStarter={codeStarter}
              setCodeStarter={setCodeStarter}
              codeNotes={codeNotes}
              setCodeNotes={setCodeNotes}
              onCreateCodeLab={createCodeLab}
              onToggleCodeLab={(id) => updateGoal(toggleLearningCodeLab(activeGoal, id))}
              showCodeLabs={settings.showCodeLabs}
            />
          )}

          {tab === 'coach' && (
            <CoachTab
              goal={activeGoal}
              prompts={prompts}
              reflection={reflection}
              setReflection={setReflection}
              onCreateReflection={createReflection}
              onChat={() => router.push('/(tabs)/chat' as Href)}
            />
          )}

          {tab === 'classroom' && (
            <ClassroomTab
              goal={activeGoal}
              assignmentTitle={assignmentTitle}
              setAssignmentTitle={setAssignmentTitle}
              assignmentInstructions={assignmentInstructions}
              setAssignmentInstructions={setAssignmentInstructions}
              onCreateAssignment={createAssignment}
              onToggleAssignment={(id) => updateGoal(toggleAssignment(activeGoal, id))}
              resourceTitle={resourceTitle}
              setResourceTitle={setResourceTitle}
              resourceDetail={resourceDetail}
              setResourceDetail={setResourceDetail}
              onCreateResource={createResource}
              linkedNoteTitle={linkedNoteTitle}
              setLinkedNoteTitle={setLinkedNoteTitle}
              linkedNoteBody={linkedNoteBody}
              setLinkedNoteBody={setLinkedNoteBody}
              onCreateLinkedNote={() => { void createLinkedNote(); }}
            />
          )}

          {tab === 'progress' && (
            <ProgressTab
              goal={activeGoal}
              stats={stats}
              onToggleMilestone={(id) => updateGoal(toggleMilestone(activeGoal, id))}
              sessionTitle={sessionTitle}
              setSessionTitle={setSessionTitle}
              sessionFocus={sessionFocus}
              setSessionFocus={setSessionFocus}
              sessionNotes={sessionNotes}
              setSessionNotes={setSessionNotes}
              sessionMinutes={sessionMinutes}
              setSessionMinutes={setSessionMinutes}
              onCreateSession={createSession}
            />
          )}

          {tab === 'settings' && (
            <SettingsTab
              goal={activeGoal}
              settings={settings}
              pathTitle={pathTitle}
              setPathTitle={setPathTitle}
              pathTarget={pathTarget}
              setPathTarget={setPathTarget}
              pathCategory={pathCategory}
              setPathCategory={setPathCategory}
              pathMode={pathMode}
              setPathMode={setPathMode}
              pathLevel={pathLevel}
              setPathLevel={setPathLevel}
              pathDailyMinutes={pathDailyMinutes}
              setPathDailyMinutes={setPathDailyMinutes}
              pathDeadline={pathDeadline}
              setPathDeadline={setPathDeadline}
              defaultCodeLanguage={codeLanguage}
              setDefaultCodeLanguage={setCodeLanguage}
              onApplyPath={applyPathSettings}
              onSaveDefaults={saveDefaults}
              onUpdateSettings={updateSettings}
            />
          )}

          <EdgeFeaturePanel
            appId="learn"
            appName="Learn"
            accent={ACCENT}
            headline="Teach, coach, and study with proof"
            caption="Learning paths connect lessons, practice, notes, tasks, focus blocks, assignments, resources, and progress sharing."
            metrics={[
              { label: 'Progress', value: `${stats.percent}%` },
              { label: 'Learners', value: `${stats.learners}` },
              { label: 'Proof', value: `${stats.evidence}` },
            ]}
            prompt={`Coach me through ${activeGoal.title}. Target: ${activeGoal.targetOutcome || activeGoal.category}.`}
            shareText={`Learning ${activeGoal.title}: ${stats.percent}% complete, ${stats.quizScore}% quiz score, ${activeGoal.studyMinutes} minutes studied.`}
            publishTitle={`${activeGoal.title} learning progress`}
            publishBody={`I am working on ${activeGoal.title}. Current progress: ${stats.percent}%.`}
          />
        </>
      ) : !showSetup ? (
        <GlassPanel variant="light" borderRadius={24} contentStyle={{ padding: 18, alignItems: 'center' }}>
          <GraduationCap color={ACCENT} size={42} weight="duotone" />
          <Text style={[font.display, { color: colors.text, fontSize: 24, marginTop: 12 }]}>No learning path yet</Text>
          <Text style={[font.body, { color: colors.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 19, marginTop: 6 }]}>
            Create one path for a subject, skill, exam, class, or coaching target.
          </Text>
          <Pressable onPress={() => setShowSetup(true)} style={{ marginTop: 16 }}>
            <View style={{ borderRadius: radius.full, backgroundColor: ACCENT, paddingHorizontal: 18, paddingVertical: 12 }}>
              <Text style={{ color: '#fff', fontWeight: '900' }}>Create path</Text>
            </View>
          </Pressable>
        </GlassPanel>
      ) : null}
    </MiniAppShell>
  );
}

function SetupPanel(props: {
  title: string; setTitle: (v: string) => void;
  targetOutcome: string; setTargetOutcome: (v: string) => void;
  mode: LearningMode; setMode: (v: LearningMode) => void;
  category: string; setCategory: (v: string) => void;
  level: LearningLevel; setLevel: (v: LearningLevel) => void;
  dailyMinutes: number; setDailyMinutes: (v: number) => void;
  onCreate: () => void;
}) {
  const { colors, font } = useTheme();
  return (
    <GlassPanel variant="light" borderRadius={24} contentStyle={{ padding: 16, gap: 14 }} style={{ marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <IconBadge color={ACCENT} size={44} radius={15}><GraduationCap color="#fff" size={22} weight="bold" /></IconBadge>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[font.display, { color: colors.text, fontSize: 25, lineHeight: 30 }]}>Create a learning path</Text>
          <Text style={[font.body, { color: colors.textMuted, fontSize: 12, marginTop: 2 }]}>For students, teachers, tutors, and skill coaching.</Text>
        </View>
      </View>
      <LearnInput value={props.title} onChangeText={props.setTitle} placeholder="What do you want to learn or teach?" strong />
      <LearnInput value={props.targetOutcome} onChangeText={props.setTargetOutcome} placeholder="Desired output, exam, class result, or skill target" multiline />
      <Label text="Mode" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {MODES.map(item => <Chip key={item.id} label={item.label} active={props.mode === item.id} onPress={() => props.setMode(item.id)} />)}
      </View>
      <Label text="Category" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {LEARNING_CATEGORIES.map(item => <Chip key={item} label={item} active={props.category === item} onPress={() => props.setCategory(item)} />)}
      </ScrollView>
      <Label text="Level" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {LEVELS.map(item => <Chip key={item.id} label={item.label} active={props.level === item.id} onPress={() => props.setLevel(item.id)} />)}
      </View>
      <Label text="Daily time" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {MINUTES.map(item => <Chip key={item} label={`${item}m`} active={props.dailyMinutes === item} onPress={() => props.setDailyMinutes(item)} />)}
      </View>
      <Pressable onPress={props.onCreate} disabled={!props.title.trim()}>
        <View style={{ minHeight: 50, borderRadius: 17, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, backgroundColor: props.title.trim() ? ACCENT : colors.surfaceHover }}>
          <Sparkle color="#fff" size={18} weight="bold" />
          <Text style={{ color: '#fff', fontSize: 15, fontWeight: '900' }}>Build my path</Text>
        </View>
      </Pressable>
    </GlassPanel>
  );
}

function Hero({ goal, stats }: { goal: LearningGoal; stats: ReturnType<typeof learningStats> }) {
  const { colors, font } = useTheme();
  return (
    <GlassPanel variant="light" borderRadius={26} contentStyle={{ padding: 16 }} style={{ marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <IconBadge color={ACCENT} size={54} radius={18}>
          {goal.mode === 'teacher' ? <ChalkboardTeacher color="#fff" size={26} weight="bold" /> : <GraduationCap color="#fff" size={27} weight="bold" />}
        </IconBadge>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[font.display, { color: colors.text, fontSize: 28, lineHeight: 33 }]} numberOfLines={1}>{goal.title}</Text>
          <Text style={[font.body, { color: colors.textMuted, fontSize: 13, lineHeight: 18, marginTop: 2 }]} numberOfLines={2}>
            {`${MODE_LABELS[goal.mode]} -> ${goal.category} -> ${goal.dailyMinutes} min/day`}
          </Text>
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={[font.bodyBold, { color: ACCENT, fontSize: 22 }]}>{stats.percent}%</Text>
          <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '800' }}>done</Text>
        </View>
      </View>
      <Text style={[font.body, { color: colors.textSecondary, fontSize: 14, lineHeight: 21, marginTop: 14 }]}>
        {goal.targetOutcome || 'Set a clear target outcome to make this roadmap sharper.'}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
        <Stat label="Open steps" value={`${stats.open}`} />
        <Stat label="Quiz score" value={`${stats.quizScore}%`} />
        <Stat label="Streak" value={`${goal.streak}d`} />
      </View>
    </GlassPanel>
  );
}

function TodayTab({ goal, stats, onToggleTask, onSaveNote, onAddTask, onSchedule, onPomodoro }: {
  goal: LearningGoal;
  stats: ReturnType<typeof learningStats>;
  onToggleTask: (moduleId: string, taskId: string) => void;
  onSaveNote: () => void;
  onAddTask: () => void;
  onSchedule: () => void;
  onPomodoro: () => void;
}) {
  const { colors, font } = useTheme();
  return (
    <>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
        <ActionButton icon={<NotePencil color="#fff" size={17} weight="bold" />} label="Notes" onPress={onSaveNote} filled />
        <ActionButton icon={<Target color={ACCENT} size={17} weight="bold" />} label="Task" onPress={onAddTask} />
        <ActionButton icon={<BookOpen color={ACCENT} size={17} weight="bold" />} label="Plan" onPress={onSchedule} />
        <ActionButton icon={<Timer color={ACCENT} size={17} weight="bold" />} label="Focus" onPress={onPomodoro} />
      </View>
      <SectionTitle title="Today" subtitle={stats.activeModule?.title ?? 'Next step'} />
      <GlassPanel variant="light" borderRadius={22} contentStyle={{ padding: 14, gap: 10 }} style={{ marginBottom: 16 }}>
        {(stats.activeModule?.tasks ?? []).map(task => (
          <Pressable key={task.id} onPress={() => onToggleTask(stats.activeModule!.id, task.id)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 7 }}>
              {task.done ? <CheckCircle color={ACCENT} size={23} weight="fill" /> : <CircleDashed color={colors.textMuted} size={23} />}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[font.bodySemibold, { color: task.done ? colors.textMuted : colors.text, fontSize: 14, textDecorationLine: task.done ? 'line-through' : 'none' }]} numberOfLines={1}>{task.title}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2, textTransform: 'uppercase', fontWeight: '800' }}>{task.type}</Text>
              </View>
            </View>
          </Pressable>
        ))}
      </GlassPanel>
      <LearningSystemCard goal={goal} />
    </>
  );
}

function TopicLibraryTab({ query, setQuery, onStartTopic }: {
  query: string;
  setQuery: (v: string) => void;
  onStartTopic: (topic: CuratedLearningTopic) => void;
}) {
  const { colors, font } = useTheme();
  const q = query.trim().toLowerCase();
  const topics = CURATED_LEARNING_TOPICS.filter(topic => !q || [
    topic.title,
    topic.category,
    topic.summary,
    topic.whyNow,
    topic.project,
    ...topic.tags,
    ...topic.materials.map(item => `${item.title} ${item.provider}`),
  ].some(value => value.toLowerCase().includes(q)));
  return (
    <>
      <GlassPanel variant="light" borderRadius={24} contentStyle={{ padding: 16, gap: 10 }} style={{ marginBottom: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <IconBadge color={ACCENT} size={44} radius={15}><Sparkle color="#fff" size={21} weight="bold" /></IconBadge>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[font.display, { color: colors.text, fontSize: 25, lineHeight: 30 }]}>2026 learning library</Text>
            <Text style={[font.body, { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 2 }]}>
              30 high-demand topics curated with free online material, Echo proof projects, notes, practice, and code-alongs where useful.
            </Text>
          </View>
        </View>
        <LearnInput value={query} onChangeText={setQuery} placeholder="Search AI, cybersecurity, finance, language..." />
      </GlassPanel>

      <View style={{ gap: 10, marginBottom: 16 }}>
        {topics.map(topic => (
          <GlassPanel key={topic.id} variant="light" borderRadius={20} contentStyle={{ padding: 14, gap: 11 }}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: `${ACCENT}22` }}>
                <GraduationCap color={ACCENT} size={20} weight="bold" />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[font.bodyBold, { color: colors.text, fontSize: 15, lineHeight: 20 }]}>{topic.title}</Text>
                <Text style={[font.body, { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 3 }]}>{topic.summary}</Text>
              </View>
            </View>
            <Text style={[font.bodySemibold, { color: colors.textSecondary, fontSize: 12, lineHeight: 18 }]}>
              {topic.whyNow}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
              {[topic.category, `${topic.dailyMinutes}m/day`, `${topic.materials.length} free links`, ...topic.tags.slice(0, 2)].map(label => (
                <View key={label} style={{ borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.surfaceHover, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '800' }}>{label}</Text>
                </View>
              ))}
            </View>
            <View style={{ borderRadius: 15, backgroundColor: colors.surfaceHover, padding: 11 }}>
              <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' }}>Echo proof project</Text>
              <Text style={[font.body, { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 3 }]}>{topic.project}</Text>
            </View>
            <Pressable onPress={() => onStartTopic(topic)}>
              <View style={{ minHeight: 42, borderRadius: 14, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '900' }}>Start curated path</Text>
              </View>
            </Pressable>
          </GlassPanel>
        ))}
      </View>
    </>
  );
}

function OneOnOneTab(props: {
  goal: LearningGoal;
  stats: ReturnType<typeof learningStats>;
  oneHeadline: string; setOneHeadline: (v: string) => void;
  oneBio: string; setOneBio: (v: string) => void;
  oneExpertise: string; setOneExpertise: (v: string) => void;
  oneTeachingStyle: string; setOneTeachingStyle: (v: string) => void;
  oneRate: string; setOneRate: (v: string) => void;
  oneCurrency: CurrencyCode; setOneCurrency: (v: CurrencyCode) => void;
  oneMeetingLink: string; setOneMeetingLink: (v: string) => void;
  onePolicies: string; setOnePolicies: (v: string) => void;
  onSaveProfile: () => void;
  packageTitle: string; setPackageTitle: (v: string) => void;
  packageDescription: string; setPackageDescription: (v: string) => void;
  packageMinutes: string; setPackageMinutes: (v: string) => void;
  packageCount: string; setPackageCount: (v: string) => void;
  packagePrice: string; setPackagePrice: (v: string) => void;
  onCreatePackage: () => void;
  onTogglePackage: (id: string) => void;
  slotLabel: string; setSlotLabel: (v: string) => void;
  slotMinutes: string; setSlotMinutes: (v: string) => void;
  onCreateSlot: () => void;
  onToggleSlot: (id: string) => void;
  bookingLearner: string; setBookingLearner: (v: string) => void;
  bookingGoal: string; setBookingGoal: (v: string) => void;
  bookingSchedule: string; setBookingSchedule: (v: string) => void;
  bookingMeeting: string; setBookingMeeting: (v: string) => void;
  bookingPrep: string; setBookingPrep: (v: string) => void;
  bookingHomework: string; setBookingHomework: (v: string) => void;
  bookingFollowUp: string; setBookingFollowUp: (v: string) => void;
  onCreateBooking: (packageId?: string) => void;
  onSaveBookingNotes: (bookingId: string) => void;
  onUpdateBookingStatus: (id: string, status: 'requested' | 'accepted' | 'scheduled' | 'completed' | 'cancelled', paymentStatus?: 'unpaid' | 'pending' | 'paid' | 'refunded') => void;
}) {
  const { colors, font } = useTheme();
  const activePackages = props.goal.oneOnOnePackages.filter(item => item.active);
  const currencyRevenue = props.goal.oneOnOneBookings
    .filter(item => item.paymentStatus === 'paid' && item.currency === props.goal.oneOnOneProfile.baseCurrency)
    .reduce((sum, item) => sum + item.price, 0);
  return (
    <>
      <GlassPanel variant="light" borderRadius={26} contentStyle={{ padding: 16, gap: 12 }} style={{ marginBottom: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <IconBadge color="#B08536" size={48} radius={16}><ChalkboardTeacher color="#fff" size={23} weight="bold" /></IconBadge>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[font.display, { color: colors.text, fontSize: 25, lineHeight: 30 }]}>Paid 1:1 mastery</Text>
            <Text style={[font.body, { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 2 }]}>
              Sell personal teaching, coaching, diagnostics, code-alongs, homework review, and follow-up from this path.
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Stat label="Bookings" value={`${props.stats.oneOnOneBookings}`} />
          <Stat label="Pending" value={`${props.stats.oneOnOnePending}`} />
          <Stat label="Paid" value={`${props.stats.oneOnOnePaid}`} />
          <Stat label="Revenue" value={formatPrice(currencyRevenue, props.goal.oneOnOneProfile.baseCurrency)} />
        </View>
      </GlassPanel>

      <SectionTitle title="Teacher offer" subtitle="Offer" />
      <GlassPanel variant="light" borderRadius={20} contentStyle={{ padding: 14, gap: 10 }} style={{ marginBottom: 16 }}>
        <LearnInput value={props.oneHeadline} onChangeText={props.setOneHeadline} placeholder="Offer headline" strong />
        <LearnInput value={props.oneBio} onChangeText={props.setOneBio} placeholder="What you help learners achieve" multiline />
        <LearnInput value={props.oneExpertise} onChangeText={props.setOneExpertise} placeholder="Expertise tags, comma separated" />
        <LearnInput value={props.oneTeachingStyle} onChangeText={props.setOneTeachingStyle} placeholder="Teaching style, method, or promise" multiline />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ width: 96 }}><LearnInput value={props.oneRate} onChangeText={props.setOneRate} placeholder="Rate" /></View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, flexGrow: 1 }}>
            {CURRENCIES.slice(0, 12).map(item => (
              <Chip key={item.code} label={`${item.symbol} ${item.code}`} active={props.oneCurrency === item.code} onPress={() => props.setOneCurrency(item.code)} />
            ))}
          </ScrollView>
        </View>
        <LearnInput value={props.oneMeetingLink} onChangeText={props.setOneMeetingLink} placeholder="Default meeting link or location" />
        <LearnInput value={props.onePolicies} onChangeText={props.setOnePolicies} placeholder="Payment, refund, reschedule, and homework policy" multiline />
        <InlineButton label="Save 1:1 offer" onPress={props.onSaveProfile} />
      </GlassPanel>

      <SectionTitle title="Paid packages" subtitle={`${activePackages.length} active`} />
      <View style={{ gap: 10, marginBottom: 16 }}>
        {props.goal.oneOnOnePackages.map(item => (
          <Pressable key={item.id} onPress={() => props.onTogglePackage(item.id)}>
            <GlassPanel variant="light" borderRadius={18} contentStyle={{ padding: 14, gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 38, height: 38, borderRadius: 14, backgroundColor: item.active ? '#B0853622' : colors.surfaceHover, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: item.active ? '#B08536' : colors.textMuted, fontWeight: '900' }}>{item.sessionCount}x</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[font.bodyBold, { color: colors.text, fontSize: 14 }]}>{item.title}</Text>
                  <Text style={[font.body, { color: colors.textMuted, fontSize: 12, marginTop: 2 }]}>{item.minutes}m each · {item.active ? 'Active' : 'Paused'}</Text>
                </View>
                <Text style={[font.bodyBold, { color: '#B08536', fontSize: 16 }]}>{formatPrice(item.price, item.currency)}</Text>
              </View>
              <Text style={[font.body, { color: colors.textSecondary, fontSize: 12, lineHeight: 18 }]}>{item.description}</Text>
            </GlassPanel>
          </Pressable>
        ))}
        <GlassPanel variant="light" borderRadius={18} contentStyle={{ padding: 14, gap: 10 }}>
          <LearnInput value={props.packageTitle} onChangeText={props.setPackageTitle} placeholder="Package title" />
          <LearnInput value={props.packageDescription} onChangeText={props.setPackageDescription} placeholder="What is included?" multiline />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><LearnInput value={props.packageMinutes} onChangeText={props.setPackageMinutes} placeholder="Minutes" /></View>
            <View style={{ flex: 1 }}><LearnInput value={props.packageCount} onChangeText={props.setPackageCount} placeholder="Sessions" /></View>
            <View style={{ flex: 1 }}><LearnInput value={props.packagePrice} onChangeText={props.setPackagePrice} placeholder="Price" /></View>
          </View>
          <InlineButton label="Add paid package" onPress={props.onCreatePackage} />
        </GlassPanel>
      </View>

      <SectionTitle title="Availability" subtitle={`${props.goal.oneOnOneSlots.filter(item => item.available).length} open slots`} />
      <View style={{ gap: 10, marginBottom: 16 }}>
        {props.goal.oneOnOneSlots.map(slot => (
          <Pressable key={slot.id} onPress={() => props.onToggleSlot(slot.id)}>
            <GlassPanel variant="light" borderRadius={16} contentStyle={{ padding: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {slot.available ? <CheckCircle color={colors.success} size={21} weight="fill" /> : <CircleDashed color={colors.textMuted} size={21} />}
                <Text style={[font.bodyBold, { color: colors.text, flex: 1, fontSize: 13 }]}>{slot.label}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '800' }}>{slot.durationMinutes}m</Text>
              </View>
            </GlassPanel>
          </Pressable>
        ))}
        <GlassPanel variant="light" borderRadius={18} contentStyle={{ padding: 14, gap: 10 }}>
          <LearnInput value={props.slotLabel} onChangeText={props.setSlotLabel} placeholder="e.g. Tue/Thu 7 PM IST or Saturday mornings" />
          <LearnInput value={props.slotMinutes} onChangeText={props.setSlotMinutes} placeholder="Default minutes" />
          <InlineButton label="Add availability" onPress={props.onCreateSlot} />
        </GlassPanel>
      </View>

      <SectionTitle title="Learner booking" subtitle="Book" />
      <GlassPanel variant="light" borderRadius={20} contentStyle={{ padding: 14, gap: 10 }} style={{ marginBottom: 16 }}>
        <LearnInput value={props.bookingLearner} onChangeText={props.setBookingLearner} placeholder="Learner name" />
        <LearnInput value={props.bookingGoal} onChangeText={props.setBookingGoal} placeholder="What they want to master" multiline />
        <LearnInput value={props.bookingSchedule} onChangeText={props.setBookingSchedule} placeholder="Proposed date/time" />
        <LearnInput value={props.bookingMeeting} onChangeText={props.setBookingMeeting} placeholder="Meeting link or location override" />
        <View style={{ gap: 8 }}>
          {activePackages.length ? activePackages.map(item => (
            <Pressable key={item.id} onPress={() => props.onCreateBooking(item.id)}>
              <View style={{ minHeight: 42, borderRadius: 14, backgroundColor: '#B08536', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '900' }}>Request {item.title} · {formatPrice(item.price, item.currency)}</Text>
              </View>
            </Pressable>
          )) : <InlineButton label="Request session" onPress={() => props.onCreateBooking()} />}
        </View>
      </GlassPanel>

      <SectionTitle title="Booking pipeline" subtitle="Pipeline" />
      <View style={{ gap: 10, marginBottom: 16 }}>
        {props.goal.oneOnOneBookings.length === 0 ? (
          <GlassPanel variant="light" borderRadius={18} contentStyle={{ padding: 16 }}>
            <Text style={[font.bodyBold, { color: colors.text, fontSize: 15 }]}>No 1:1 bookings yet</Text>
            <Text style={[font.body, { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 5 }]}>
              Add packages and availability, then create learner requests from this path.
            </Text>
          </GlassPanel>
        ) : props.goal.oneOnOneBookings.map(booking => (
          <GlassPanel key={booking.id} variant="light" borderRadius={18} contentStyle={{ padding: 14, gap: 10 }}>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <View style={{ width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#B0853622' }}>
                <Text style={{ color: '#B08536', fontWeight: '900' }}>{booking.learnerName.slice(0, 1).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[font.bodyBold, { color: colors.text, fontSize: 14 }]}>{booking.learnerName}</Text>
                <Text style={[font.body, { color: colors.textMuted, fontSize: 12, marginTop: 2 }]} numberOfLines={1}>{booking.packageTitle} · {formatPrice(booking.price, booking.currency)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ color: booking.paymentStatus === 'paid' ? colors.success : '#B08536', fontSize: 11, fontWeight: '900', textTransform: 'uppercase' }}>{booking.paymentStatus}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', marginTop: 2 }}>{booking.status}</Text>
              </View>
            </View>
            <Text style={[font.body, { color: colors.textSecondary, fontSize: 12, lineHeight: 18 }]}>{booking.learnerGoal}</Text>
            {booking.scheduledFor || booking.meetingLink ? (
              <Text style={[font.bodySemibold, { color: colors.textMuted, fontSize: 12, lineHeight: 18 }]}>
                {[booking.scheduledFor, booking.meetingLink].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
            {booking.prepNote ? <Text style={[font.body, { color: colors.textMuted, fontSize: 12, lineHeight: 18 }]}>Prep: {booking.prepNote}</Text> : null}
            {booking.homework ? <Text style={[font.body, { color: colors.textMuted, fontSize: 12, lineHeight: 18 }]}>Homework: {booking.homework}</Text> : null}
            {booking.followUp ? <Text style={[font.body, { color: colors.textMuted, fontSize: 12, lineHeight: 18 }]}>Follow-up: {booking.followUp}</Text> : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <SmallAction label="Accept" onPress={() => props.onUpdateBookingStatus(booking.id, 'accepted', 'pending')} />
              <SmallAction label="Paid" onPress={() => props.onUpdateBookingStatus(booking.id, 'scheduled', 'paid')} />
              <SmallAction label="Done" onPress={() => props.onUpdateBookingStatus(booking.id, 'completed', 'paid')} />
              <SmallAction label="Cancel" danger onPress={() => props.onUpdateBookingStatus(booking.id, 'cancelled', booking.paymentStatus)} />
            </View>
            <GlassPanel variant="light" borderRadius={16} contentStyle={{ padding: 12, gap: 8 }}>
              <LearnInput value={props.bookingPrep} onChangeText={props.setBookingPrep} placeholder="Prep note for this session" multiline />
              <LearnInput value={props.bookingHomework} onChangeText={props.setBookingHomework} placeholder="Homework / practice assigned" multiline />
              <LearnInput value={props.bookingFollowUp} onChangeText={props.setBookingFollowUp} placeholder="Follow-up message or next package pitch" multiline />
              <InlineButton label="Save to this booking" onPress={() => props.onSaveBookingNotes(booking.id)} />
            </GlassPanel>
          </GlassPanel>
        ))}
      </View>
    </>
  );
}

function StudioTab(props: {
  goal: LearningGoal;
  stats: ReturnType<typeof learningStats>;
  onToggleWeek: (id: string) => void;
  onScoreRubric: (id: string, score: number) => void;
  rubricTitle: string;
  setRubricTitle: (v: string) => void;
  rubricDescription: string;
  setRubricDescription: (v: string) => void;
  onCreateRubric: () => void;
  evidenceTitle: string;
  setEvidenceTitle: (v: string) => void;
  evidenceDetail: string;
  setEvidenceDetail: (v: string) => void;
  onCreateEvidence: () => void;
}) {
  const { colors, font } = useTheme();
  return (
    <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <Stat label="Syllabus" value={`${props.stats.syllabusDone}/${props.goal.syllabus.length}`} />
        <Stat label="Rubric" value={`${props.stats.rubricPercent}%`} />
        <Stat label="Evidence" value={`${props.stats.evidence}`} />
      </View>

      <SectionTitle title="Course studio" subtitle="Syllabus" />
      <View style={{ gap: 10, marginBottom: 16 }}>
        {props.goal.syllabus.map(week => (
          <Pressable key={week.id} onPress={() => props.onToggleWeek(week.id)}>
            <GlassPanel variant="light" borderRadius={18} contentStyle={{ padding: 14 }}>
              <View style={{ flexDirection: 'row', gap: 11 }}>
                {week.done ? <CheckCircle color={ACCENT} size={23} weight="fill" /> : <CircleDashed color={colors.textMuted} size={23} />}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[font.bodyBold, { color: colors.text, fontSize: 14 }]}>{week.title}</Text>
                  <Text style={[font.body, { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 4 }]}>{week.objective}</Text>
                  <Text style={[font.bodySemibold, { color: ACCENT, fontSize: 11, lineHeight: 16, marginTop: 7 }]}>{week.deliverable}</Text>
                </View>
              </View>
            </GlassPanel>
          </Pressable>
        ))}
      </View>

      <SectionTitle title="Rubric" subtitle={`${props.stats.rubricScore}/${props.stats.rubricMax} scored`} />
      <View style={{ gap: 10, marginBottom: 16 }}>
        {props.goal.rubric.map(item => (
          <GlassPanel key={item.id} variant="light" borderRadius={18} contentStyle={{ padding: 14, gap: 10 }}>
            <View>
              <Text style={[font.bodyBold, { color: colors.text, fontSize: 14 }]}>{item.title}</Text>
              <Text style={[font.body, { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 3 }]}>{item.description}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 7 }}>
              {Array.from({ length: item.maxScore + 1 }).map((_, score) => (
                <Pressable key={score} onPress={() => props.onScoreRubric(item.id, score)} style={{ flex: 1 }}>
                  <View style={{ minHeight: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: item.score === score ? ACCENT : colors.surfaceHover, borderWidth: StyleSheet.hairlineWidth, borderColor: item.score === score ? ACCENT : colors.border }}>
                    <Text style={{ color: item.score === score ? '#fff' : colors.textSecondary, fontWeight: '900', fontSize: 12 }}>{score}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </GlassPanel>
        ))}
        <GlassPanel variant="light" borderRadius={18} contentStyle={{ padding: 14, gap: 10 }}>
          <LearnInput value={props.rubricTitle} onChangeText={props.setRubricTitle} placeholder="New rubric criterion" />
          <LearnInput value={props.rubricDescription} onChangeText={props.setRubricDescription} placeholder="What does good work look like?" multiline />
          <InlineButton label="Add criterion" onPress={props.onCreateRubric} />
        </GlassPanel>
      </View>

      <SectionTitle title="Evidence locker" subtitle="Proof" />
      <GlassPanel variant="light" borderRadius={18} contentStyle={{ padding: 14, gap: 10 }} style={{ marginBottom: 12 }}>
        <LearnInput value={props.evidenceTitle} onChangeText={props.setEvidenceTitle} placeholder="Evidence title" />
        <LearnInput value={props.evidenceDetail} onChangeText={props.setEvidenceDetail} placeholder="Paste link, describe submission, or write proof" multiline />
        <InlineButton label="Save evidence" onPress={props.onCreateEvidence} />
      </GlassPanel>
      <View style={{ gap: 10, marginBottom: 16 }}>
        {props.goal.evidence.map(item => (
          <GlassPanel key={item.id} variant="light" borderRadius={16} contentStyle={{ padding: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <LinkSimple color={ACCENT} size={17} weight="bold" />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[font.bodyBold, { color: colors.text, fontSize: 13 }]}>{item.title}</Text>
                <Text style={[font.body, { color: colors.textMuted, fontSize: 12, marginTop: 2 }]} numberOfLines={2}>{item.detail || item.kind}</Text>
              </View>
            </View>
          </GlassPanel>
        ))}
      </View>
    </>
  );
}

function PeopleTab(props: {
  goal: LearningGoal;
  learnerName: string;
  setLearnerName: (v: string) => void;
  learnerTarget: string;
  setLearnerTarget: (v: string) => void;
  learnerNotes: string;
  setLearnerNotes: (v: string) => void;
  learnerLevel: LearningLevel;
  setLearnerLevel: (v: LearningLevel) => void;
  onCreateLearner: () => void;
  onUpdateProgress: (id: string, progress: number) => void;
}) {
  const { colors, font } = useTheme();
  const average = props.goal.learners.length
    ? Math.round(props.goal.learners.reduce((sum, learner) => sum + learner.progress, 0) / props.goal.learners.length)
    : 0;
  return (
    <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <Stat label="Learners" value={`${props.goal.learners.length}`} />
        <Stat label="Average" value={`${average}%`} />
        <Stat label="Mode" value={MODE_LABELS[props.goal.mode]} />
      </View>

      <SectionTitle title="Learner roster" subtitle="People" />
      <GlassPanel variant="light" borderRadius={18} contentStyle={{ padding: 14, gap: 10 }} style={{ marginBottom: 16 }}>
        <LearnInput value={props.learnerName} onChangeText={props.setLearnerName} placeholder="Name" />
        <LearnInput value={props.learnerTarget} onChangeText={props.setLearnerTarget} placeholder="Personal target or class outcome" />
        <LearnInput value={props.learnerNotes} onChangeText={props.setLearnerNotes} placeholder="Context, constraints, learning style, notes" multiline />
        <Label text="Level" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {LEVELS.map(item => <Chip key={item.id} label={item.label} active={props.learnerLevel === item.id} onPress={() => props.setLearnerLevel(item.id)} />)}
        </View>
        <InlineButton label="Add learner" onPress={props.onCreateLearner} />
      </GlassPanel>

      <View style={{ gap: 10, marginBottom: 16 }}>
        {props.goal.learners.length === 0 ? (
          <GlassPanel variant="light" borderRadius={18} contentStyle={{ padding: 16 }}>
            <Text style={[font.bodyBold, { color: colors.text, fontSize: 15 }]}>No learners yet</Text>
            <Text style={[font.body, { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: 5 }]}>
              Add yourself, a student, a coaching client, or a group member to track progress separately.
            </Text>
          </GlassPanel>
        ) : props.goal.learners.map(learner => (
          <GlassPanel key={learner.id} variant="light" borderRadius={18} contentStyle={{ padding: 14, gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: `${ACCENT}22` }}>
                <Text style={{ color: ACCENT, fontWeight: '900', fontSize: 16 }}>{learner.name.slice(0, 1).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[font.bodyBold, { color: colors.text, fontSize: 15 }]} numberOfLines={1}>{learner.name}</Text>
                <Text style={[font.body, { color: colors.textMuted, fontSize: 12, marginTop: 2 }]} numberOfLines={1}>{learner.target}</Text>
              </View>
              <Text style={[font.bodyBold, { color: ACCENT, fontSize: 18 }]}>{learner.progress}%</Text>
            </View>
            <View style={{ height: 8, borderRadius: 999, backgroundColor: colors.surfaceHover, overflow: 'hidden' }}>
              <View style={{ width: `${learner.progress}%`, height: '100%', backgroundColor: ACCENT }} />
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[25, 50, 75, 100].map(score => (
                <Pressable key={score} onPress={() => props.onUpdateProgress(learner.id, score)} style={{ flex: 1 }}>
                  <View style={{ minHeight: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: learner.progress === score ? ACCENT : colors.surfaceHover, borderWidth: StyleSheet.hairlineWidth, borderColor: learner.progress === score ? ACCENT : colors.border }}>
                    <Text style={{ color: learner.progress === score ? '#fff' : colors.textSecondary, fontSize: 11, fontWeight: '900' }}>{score}%</Text>
                  </View>
                </Pressable>
              ))}
            </View>
            {learner.notes ? <Text style={[font.body, { color: colors.textMuted, fontSize: 12, lineHeight: 18 }]}>{learner.notes}</Text> : null}
          </GlassPanel>
        ))}
      </View>
    </>
  );
}

function RoadmapTab({ goal }: { goal: LearningGoal }) {
  const { colors, font } = useTheme();
  return (
    <View style={{ gap: 10, marginBottom: 16 }}>
      {goal.modules.map((module, index) => {
        const complete = module.status === 'completed';
        const active = module.status === 'active';
        return (
          <GlassPanel key={module.id} variant="light" borderRadius={20} contentStyle={{ padding: 14 }}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: complete ? ACCENT : active ? `${ACCENT}22` : colors.surfaceHover }}>
                <Text style={{ color: complete ? '#fff' : active ? ACCENT : colors.textMuted, fontWeight: '900' }}>{index + 1}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[font.bodyBold, { color: colors.text, fontSize: 15 }]}>{module.title}</Text>
                <Text style={[font.body, { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 3 }]}>{module.description}</Text>
                <Text style={{ color: active ? ACCENT : colors.textMuted, fontSize: 11, fontWeight: '900', marginTop: 8, textTransform: 'uppercase' }}>
                  {complete ? 'Completed' : active ? 'Active now' : 'Locked'}
                </Text>
              </View>
            </View>
          </GlassPanel>
        );
      })}
    </View>
  );
}

function PracticeTab(props: {
  goal: LearningGoal;
  onToggleCard: (id: string) => void;
  onAnswer: (id: string, selected: string) => void;
  cardFront: string; setCardFront: (v: string) => void;
  cardBack: string; setCardBack: (v: string) => void;
  onCreateCard: () => void;
  codeTitle: string; setCodeTitle: (v: string) => void;
  codeLanguage: string; setCodeLanguage: (v: string) => void;
  codePrompt: string; setCodePrompt: (v: string) => void;
  codeStarter: string; setCodeStarter: (v: string) => void;
  codeNotes: string; setCodeNotes: (v: string) => void;
  onCreateCodeLab: () => void;
  onToggleCodeLab: (id: string) => void;
  showCodeLabs: boolean;
}) {
  const { colors, font } = useTheme();
  return (
    <>
      <SectionTitle title="Flashcards" subtitle={`${props.goal.flashcards.filter(card => card.mastered).length}/${props.goal.flashcards.length} mastered`} />
      <View style={{ gap: 10, marginBottom: 16 }}>
        {props.goal.flashcards.map(card => (
          <Pressable key={card.id} onPress={() => props.onToggleCard(card.id)}>
            <GlassPanel variant="light" borderRadius={18} contentStyle={{ padding: 14 }}>
              <Text style={[font.bodyBold, { color: colors.text, fontSize: 14 }]}>{card.front}</Text>
              <Text style={[font.body, { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 6 }]}>{card.back}</Text>
              <Text style={{ color: card.mastered ? ACCENT : colors.textMuted, fontSize: 11, fontWeight: '900', marginTop: 9 }}>
                {card.mastered ? 'MASTERED' : 'TAP TO MARK MASTERED'}
              </Text>
            </GlassPanel>
          </Pressable>
        ))}
        <GlassPanel variant="light" borderRadius={18} contentStyle={{ padding: 14, gap: 10 }}>
          <LearnInput value={props.cardFront} onChangeText={props.setCardFront} placeholder="New flashcard front" />
          <LearnInput value={props.cardBack} onChangeText={props.setCardBack} placeholder="Back / answer" multiline />
          <InlineButton label="Add flashcard" onPress={props.onCreateCard} />
        </GlassPanel>
      </View>

      <SectionTitle title="Quiz" subtitle="Adaptive check" />
      <View style={{ gap: 10, marginBottom: 16 }}>
        {props.goal.quiz.map(question => (
          <GlassPanel key={question.id} variant="light" borderRadius={18} contentStyle={{ padding: 14, gap: 9 }}>
            <Text style={[font.bodyBold, { color: colors.text, fontSize: 14, lineHeight: 20 }]}>{question.question}</Text>
            {question.options.map(option => {
              const selected = question.selected === option;
              return (
                <Pressable key={option} onPress={() => props.onAnswer(question.id, option)}>
                  <View style={{ borderRadius: 13, padding: 10, backgroundColor: selected ? (question.correct ? `${ACCENT}2A` : colors.dangerMuted) : colors.surfaceHover }}>
                    <Text style={[font.bodySemibold, { color: selected ? (question.correct ? ACCENT : colors.danger) : colors.textSecondary, fontSize: 12 }]}>{option}</Text>
                  </View>
                </Pressable>
              );
            })}
            {question.selected ? <Text style={[font.body, { color: colors.textMuted, fontSize: 12, lineHeight: 18 }]}>{question.explanation}</Text> : null}
          </GlassPanel>
        ))}
      </View>

      {props.showCodeLabs ? (
        <>
          <SectionTitle title="Code-along" subtitle={`${props.goal.codeLabs.filter(item => item.done).length}/${props.goal.codeLabs.length} complete`} />
          <View style={{ gap: 10, marginBottom: 16 }}>
            {props.goal.codeLabs.length === 0 ? (
              <GlassPanel variant="light" borderRadius={18} contentStyle={{ padding: 14 }}>
                <Text style={[font.bodyBold, { color: colors.text, fontSize: 14 }]}>No code labs yet</Text>
                <Text style={[font.body, { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 4 }]}>
                  Add one for coding, app building, data work, formulas, or any step-by-step practice.
                </Text>
              </GlassPanel>
            ) : props.goal.codeLabs.map(item => (
              <Pressable key={item.id} onPress={() => props.onToggleCodeLab(item.id)}>
                <GlassPanel variant="light" borderRadius={18} contentStyle={{ padding: 14, gap: 9 }}>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    {item.done ? <CheckCircle color={ACCENT} size={22} weight="fill" /> : <ClipboardText color={colors.textMuted} size={22} />}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[font.bodyBold, { color: colors.text, fontSize: 14 }]}>{item.title}</Text>
                      <Text style={[font.bodySemibold, { color: ACCENT, fontSize: 11, marginTop: 2 }]}>{item.language}</Text>
                    </View>
                  </View>
                  <Text style={[font.body, { color: colors.textSecondary, fontSize: 12, lineHeight: 18 }]}>{item.prompt}</Text>
                  <View style={{ borderRadius: 14, backgroundColor: '#0D1117', padding: 12 }}>
                    <Text style={{ color: '#E2E8F0', fontSize: 12, lineHeight: 18, fontFamily: 'monospace' }} numberOfLines={6}>{item.starterCode}</Text>
                  </View>
                  {item.notes ? <Text style={[font.body, { color: colors.textMuted, fontSize: 12, lineHeight: 18 }]}>{item.notes}</Text> : null}
                </GlassPanel>
              </Pressable>
            ))}
            <GlassPanel variant="light" borderRadius={18} contentStyle={{ padding: 14, gap: 10 }}>
              <LearnInput value={props.codeTitle} onChangeText={props.setCodeTitle} placeholder="Code-along title" />
              <LearnInput value={props.codeLanguage} onChangeText={props.setCodeLanguage} placeholder="Language or tool" />
              <LearnInput value={props.codePrompt} onChangeText={props.setCodePrompt} placeholder="What should the learner build or change?" multiline />
              <LearnInput value={props.codeStarter} onChangeText={props.setCodeStarter} placeholder="Starter code, formula, or steps" multiline />
              <LearnInput value={props.codeNotes} onChangeText={props.setCodeNotes} placeholder="Hints, gotchas, solution notes" multiline />
              <InlineButton label="Add code lab" onPress={props.onCreateCodeLab} />
            </GlassPanel>
          </View>
        </>
      ) : null}
    </>
  );
}

function CoachTab({ goal, prompts, reflection, setReflection, onCreateReflection, onChat }: {
  goal: LearningGoal;
  prompts: string[];
  reflection: string;
  setReflection: (v: string) => void;
  onCreateReflection: () => void;
  onChat: () => void;
}) {
  const { colors, font } = useTheme();
  return (
    <>
      <SectionTitle title="Coach prompts" subtitle="Coach" />
      <View style={{ gap: 10, marginBottom: 16 }}>
        {prompts.map(prompt => (
          <Pressable key={prompt} onPress={onChat}>
            <GlassPanel variant="light" borderRadius={18} contentStyle={{ padding: 13 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Question color={ACCENT} size={18} weight="bold" />
                <Text style={[font.bodySemibold, { color: colors.textSecondary, flex: 1, fontSize: 13, lineHeight: 18 }]}>{prompt}</Text>
                <Play color={colors.textMuted} size={16} weight="bold" />
              </View>
            </GlassPanel>
          </Pressable>
        ))}
      </View>
      <SectionTitle title="Reflection log" subtitle={`${goal.reflections.length} entries`} />
      <GlassPanel variant="light" borderRadius={18} contentStyle={{ padding: 14, gap: 10 }} style={{ marginBottom: 16 }}>
        <LearnInput value={reflection} onChangeText={setReflection} placeholder="What did you understand, miss, or improve today?" multiline />
        <InlineButton label="Save reflection" onPress={onCreateReflection} />
      </GlassPanel>
      <View style={{ gap: 10, marginBottom: 16 }}>
        {goal.reflections.map(item => (
          <GlassPanel key={item.id} variant="light" borderRadius={16} contentStyle={{ padding: 12 }}>
            <Text style={[font.body, { color: colors.textSecondary, fontSize: 13, lineHeight: 19 }]}>{item.text}</Text>
          </GlassPanel>
        ))}
      </View>
    </>
  );
}

function ClassroomTab(props: {
  goal: LearningGoal;
  assignmentTitle: string; setAssignmentTitle: (v: string) => void;
  assignmentInstructions: string; setAssignmentInstructions: (v: string) => void;
  onCreateAssignment: () => void;
  onToggleAssignment: (id: string) => void;
  resourceTitle: string; setResourceTitle: (v: string) => void;
  resourceDetail: string; setResourceDetail: (v: string) => void;
  onCreateResource: () => void;
  linkedNoteTitle: string; setLinkedNoteTitle: (v: string) => void;
  linkedNoteBody: string; setLinkedNoteBody: (v: string) => void;
  onCreateLinkedNote: () => void;
}) {
  const { colors, font } = useTheme();
  return (
    <>
      <SectionTitle title="Assignments" subtitle={`${props.goal.assignments.filter(item => !item.done).length} open`} />
      <View style={{ gap: 10, marginBottom: 16 }}>
        {props.goal.assignments.map(item => (
          <Pressable key={item.id} onPress={() => props.onToggleAssignment(item.id)}>
            <GlassPanel variant="light" borderRadius={18} contentStyle={{ padding: 14 }}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {item.done ? <CheckCircle color={ACCENT} size={22} weight="fill" /> : <ClipboardText color={colors.textMuted} size={22} />}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[font.bodyBold, { color: colors.text, fontSize: 14 }]}>{item.title}</Text>
                  <Text style={[font.body, { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 4 }]}>{item.instructions}</Text>
                </View>
              </View>
            </GlassPanel>
          </Pressable>
        ))}
        <GlassPanel variant="light" borderRadius={18} contentStyle={{ padding: 14, gap: 10 }}>
          <LearnInput value={props.assignmentTitle} onChangeText={props.setAssignmentTitle} placeholder="Assignment title" />
          <LearnInput value={props.assignmentInstructions} onChangeText={props.setAssignmentInstructions} placeholder="Instructions or rubric" multiline />
          <InlineButton label="Create assignment" onPress={props.onCreateAssignment} />
        </GlassPanel>
      </View>

      <SectionTitle title="Resources" subtitle={`${props.goal.resources.length} saved`} />
      <GlassPanel variant="light" borderRadius={18} contentStyle={{ padding: 14, gap: 10 }} style={{ marginBottom: 12 }}>
        <Text style={[font.bodyBold, { color: colors.text, fontSize: 14 }]}>Learning note</Text>
        <Text style={[font.body, { color: colors.textMuted, fontSize: 12, lineHeight: 18 }]}>
          Write notes while learning and save them into the Notes app while keeping them linked here as a resource.
        </Text>
        <LearnInput value={props.linkedNoteTitle} onChangeText={props.setLinkedNoteTitle} placeholder="Note title" />
        <LearnInput value={props.linkedNoteBody} onChangeText={props.setLinkedNoteBody} placeholder="Concepts, mistakes, examples, summary, next action" multiline />
        <InlineButton label="Save linked note" onPress={props.onCreateLinkedNote} />
      </GlassPanel>
      <GlassPanel variant="light" borderRadius={18} contentStyle={{ padding: 14, gap: 10 }} style={{ marginBottom: 12 }}>
        <LearnInput value={props.resourceTitle} onChangeText={props.setResourceTitle} placeholder="Resource title" />
        <LearnInput value={props.resourceDetail} onChangeText={props.setResourceDetail} placeholder="Link, note, book, video, or file detail" />
        <InlineButton label="Save resource" onPress={props.onCreateResource} />
      </GlassPanel>
      <View style={{ gap: 10, marginBottom: 16 }}>
        {props.goal.resources.map(item => (
          <GlassPanel key={item.id} variant="light" borderRadius={16} contentStyle={{ padding: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <LinkSimple color={ACCENT} size={17} weight="bold" />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[font.bodyBold, { color: colors.text, fontSize: 13 }]}>{item.title}</Text>
                {item.detail ? <Text style={[font.body, { color: colors.textMuted, fontSize: 12, marginTop: 2 }]} numberOfLines={2}>{item.detail}</Text> : null}
              </View>
            </View>
          </GlassPanel>
        ))}
      </View>
    </>
  );
}

function ProgressTab({ goal, stats, onToggleMilestone, sessionTitle, setSessionTitle, sessionFocus, setSessionFocus, sessionNotes, setSessionNotes, sessionMinutes, setSessionMinutes, onCreateSession }: {
  goal: LearningGoal;
  stats: ReturnType<typeof learningStats>;
  onToggleMilestone: (id: string) => void;
  sessionTitle: string;
  setSessionTitle: (v: string) => void;
  sessionFocus: string;
  setSessionFocus: (v: string) => void;
  sessionNotes: string;
  setSessionNotes: (v: string) => void;
  sessionMinutes: string;
  setSessionMinutes: (v: string) => void;
  onCreateSession: () => void;
}) {
  const { colors, font } = useTheme();
  return (
    <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <Stat label="Roadmap" value={`${stats.percent}%`} />
        <Stat label="Quiz" value={`${stats.quizScore}%`} />
        <Stat label="Cards" value={`${stats.masteredCards}/${goal.flashcards.length}`} />
        <Stat label="Milestones" value={`${stats.milestoneDone}/${goal.milestones.length}`} />
      </View>

      <SectionTitle title="Milestone proof" subtitle="Outcomes" />
      <View style={{ gap: 10, marginBottom: 16 }}>
        {goal.milestones.map(milestone => (
          <Pressable key={milestone.id} onPress={() => onToggleMilestone(milestone.id)}>
            <GlassPanel variant="light" borderRadius={18} contentStyle={{ padding: 14 }}>
              <View style={{ flexDirection: 'row', gap: 11 }}>
                {milestone.done ? <CheckCircle color={ACCENT} size={23} weight="fill" /> : <CircleDashed color={colors.textMuted} size={23} />}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[font.bodyBold, { color: colors.text, fontSize: 14 }]}>{milestone.title}</Text>
                  <Text style={[font.body, { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 4 }]}>{milestone.proof}</Text>
                </View>
              </View>
            </GlassPanel>
          </Pressable>
        ))}
      </View>

      <SectionTitle title="Session log" subtitle={`${stats.sessions} sessions · ${goal.studyMinutes} minutes`} />
      <GlassPanel variant="light" borderRadius={18} contentStyle={{ padding: 14, gap: 10 }} style={{ marginBottom: 16 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <LearnInput value={sessionTitle} onChangeText={setSessionTitle} placeholder="Session title" />
          </View>
          <View style={{ width: 82 }}>
            <LearnInput value={sessionMinutes} onChangeText={setSessionMinutes} placeholder="Min" />
          </View>
        </View>
        <LearnInput value={sessionFocus} onChangeText={setSessionFocus} placeholder="Focus area or learner objective" />
        <LearnInput value={sessionNotes} onChangeText={setSessionNotes} placeholder="What changed, clicked, or needs review?" multiline />
        <InlineButton label="Log session" onPress={onCreateSession} />
      </GlassPanel>

      {goal.sessions.length > 0 ? (
        <View style={{ gap: 10, marginBottom: 16 }}>
          {goal.sessions.slice(0, 5).map(session => (
            <GlassPanel key={session.id} variant="light" borderRadius={16} contentStyle={{ padding: 13 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Timer color={ACCENT} size={18} weight="bold" />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[font.bodyBold, { color: colors.text, fontSize: 13 }]} numberOfLines={1}>{session.title}</Text>
                  <Text style={[font.body, { color: colors.textMuted, fontSize: 12, marginTop: 2 }]} numberOfLines={2}>
                    {`${session.minutes}m -> ${session.focus}${session.notes ? ` -> ${session.notes}` : ''}`}
                  </Text>
                </View>
              </View>
            </GlassPanel>
          ))}
        </View>
      ) : null}

      <GlassPanel variant="light" borderRadius={22} contentStyle={{ padding: 15, gap: 10 }} style={{ marginBottom: 16 }}>
        <Text style={[font.bodyBold, { color: colors.text, fontSize: 15 }]}>Weak topics</Text>
        {(goal.weakTopics.length ? goal.weakTopics : ['No weak topic captured yet']).map(topic => (
          <Text key={topic} style={[font.body, { color: colors.textSecondary, fontSize: 13, lineHeight: 20 }]}>- {topic}</Text>
        ))}
      </GlassPanel>
      <LearningSystemCard goal={goal} />
    </>
  );
}

function SettingsTab(props: {
  goal: LearningGoal;
  settings: LearningSettings;
  pathTitle: string; setPathTitle: (v: string) => void;
  pathTarget: string; setPathTarget: (v: string) => void;
  pathCategory: string; setPathCategory: (v: string) => void;
  pathMode: LearningMode; setPathMode: (v: LearningMode) => void;
  pathLevel: LearningLevel; setPathLevel: (v: LearningLevel) => void;
  pathDailyMinutes: string; setPathDailyMinutes: (v: string) => void;
  pathDeadline: string; setPathDeadline: (v: string) => void;
  defaultCodeLanguage: string; setDefaultCodeLanguage: (v: string) => void;
  onApplyPath: () => void;
  onSaveDefaults: () => void;
  onUpdateSettings: (settings: LearningSettings) => void;
}) {
  const { colors, font } = useTheme();
  return (
    <>
      <SectionTitle title="Path settings" subtitle={props.goal.title} />
      <GlassPanel variant="light" borderRadius={20} contentStyle={{ padding: 14, gap: 10 }} style={{ marginBottom: 16 }}>
        <LearnInput value={props.pathTitle} onChangeText={props.setPathTitle} placeholder="Path title" strong />
        <LearnInput value={props.pathTarget} onChangeText={props.setPathTarget} placeholder="Outcome or target" multiline />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <LearnInput value={props.pathDailyMinutes} onChangeText={props.setPathDailyMinutes} placeholder="Daily minutes" />
          </View>
          <View style={{ flex: 1 }}>
            <LearnInput value={props.pathDeadline} onChangeText={props.setPathDeadline} placeholder="Deadline" />
          </View>
        </View>
        <Label text="Mode" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {MODES.map(item => <Chip key={item.id} label={item.label} active={props.pathMode === item.id} onPress={() => props.setPathMode(item.id)} />)}
        </View>
        <Label text="Level" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {LEVELS.map(item => <Chip key={item.id} label={item.label} active={props.pathLevel === item.id} onPress={() => props.setPathLevel(item.id)} />)}
        </View>
        <Label text="Category" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {LEARNING_CATEGORIES.map(item => <Chip key={item} label={item} active={props.pathCategory === item} onPress={() => props.setPathCategory(item)} />)}
        </ScrollView>
        <InlineButton label="Apply path settings" onPress={props.onApplyPath} />
      </GlassPanel>

      <SectionTitle title="Learn defaults" subtitle="Defaults" />
      <GlassPanel variant="light" borderRadius={20} contentStyle={{ padding: 14, gap: 10 }} style={{ marginBottom: 16 }}>
        <LearnInput value={props.defaultCodeLanguage} onChangeText={props.setDefaultCodeLanguage} placeholder="Default code language or tool" />
        <SettingsToggle
          title="Show teaching tools"
          subtitle="Course, class, roster, assignments"
          value={props.settings.showTeacherTools}
          onValueChange={(showTeacherTools) => props.onUpdateSettings({ ...props.settings, showTeacherTools })}
        />
        <SettingsToggle
          title="Show code-along labs"
          subtitle="Code, formulas, builds"
          value={props.settings.showCodeLabs}
          onValueChange={(showCodeLabs) => props.onUpdateSettings({ ...props.settings, showCodeLabs })}
        />
        <SettingsToggle
          title="Auto-link study notes"
          subtitle="Save Learn notes to Notes"
          value={props.settings.autoLinkNotes}
          onValueChange={(autoLinkNotes) => props.onUpdateSettings({ ...props.settings, autoLinkNotes })}
        />
        <InlineButton label="Save these as defaults" onPress={props.onSaveDefaults} />
      </GlassPanel>

      <GlassPanel variant="light" borderRadius={20} contentStyle={{ padding: 14 }} style={{ marginBottom: 16 }}>
        <Text style={[font.bodyBold, { color: colors.text, fontSize: 14 }]}>What settings control</Text>
        <Text style={[font.body, { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 5 }]}>
          Keep Learn lightweight for solo study, or turn on the larger teaching/coaching surfaces when managing learners, assignments, rubrics, proof, and code-alongs.
        </Text>
      </GlassPanel>
    </>
  );
}

function SettingsToggle({ title, subtitle, value, onValueChange }: {
  title: string;
  subtitle: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  const { colors, font } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[font.bodyBold, { color: colors.text, fontSize: 14 }]}>{title}</Text>
        <Text style={[font.body, { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 2 }]}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.surfaceHover, true: `${ACCENT}88` }}
        thumbColor={value ? ACCENT : colors.textMuted}
      />
    </View>
  );
}

function LearningSystemCard({ goal }: { goal: LearningGoal }) {
  const { colors, font } = useTheme();
  return (
    <GlassPanel variant="light" borderRadius={22} contentStyle={{ padding: 15, gap: 10 }} style={{ marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Sparkle color={ACCENT} size={19} weight="bold" />
        <Text style={[font.bodyBold, { color: colors.text, fontSize: 15 }]}>
          {goal.mode === 'teacher' ? 'Teacher workflow' : goal.mode === 'coach' ? 'Coaching loop' : 'Study system'}
        </Text>
      </View>
      <Text style={[font.body, { color: colors.textSecondary, fontSize: 13, lineHeight: 20 }]}>
        {goal.mode === 'teacher'
          ? 'Create lessons, assign practice, collect resources, and use reflections as feedback notes.'
          : goal.mode === 'coach'
            ? 'Do one rep, record feedback, review weak topics, and raise difficulty gradually.'
            : 'Study the active module, test recall, save weak topics, then revise with flashcards.'}
      </Text>
    </GlassPanel>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  const { colors, font } = useTheme();
  return (
    <View style={{ marginBottom: 9, flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
      <Text style={[font.bodyBold, { color: colors.text, fontSize: 16 }]}>{title}</Text>
      {subtitle ? <Text style={[font.body, { color: colors.textMuted, fontSize: 12 }]}>{subtitle}</Text> : null}
    </View>
  );
}

function Label({ text }: { text: string }) {
  const { colors, font } = useTheme();
  return <Text style={[font.bodyBold, { color: colors.text, fontSize: 13 }]}>{text}</Text>;
}

function LearnInput({ value, onChangeText, placeholder, multiline = false, strong = false }: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  multiline?: boolean;
  strong?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.textMuted}
      multiline={multiline}
      style={{
        minHeight: multiline ? 72 : 46,
        borderRadius: 16,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
        backgroundColor: colors.inputBg,
        color: colors.text,
        paddingHorizontal: 14,
        paddingVertical: multiline ? 12 : 8,
        fontSize: strong ? 16 : 14,
        fontWeight: strong ? '800' : '500',
        textAlignVertical: multiline ? 'top' : 'center',
      }}
    />
  );
}

function InlineButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <AnimatedPressable onPress={onPress} scaleValue={0.96} haptic="medium" accessibilityRole="button" accessibilityLabel={label}>
      <View style={{ minHeight: 42, borderRadius: 14, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '900' }}>{label}</Text>
      </View>
    </AnimatedPressable>
  );
}

function SmallAction({ label, onPress, danger = false }: { label: string; onPress: () => void; danger?: boolean }) {
  const { colors } = useTheme();
  const color = danger ? colors.danger : ACCENT;
  return (
    <AnimatedPressable onPress={onPress} scaleValue={0.93} haptic="light" accessibilityRole="button" accessibilityLabel={label}>
      <View style={{
        borderRadius: 999,
        minHeight: 34,
        paddingHorizontal: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: danger ? colors.dangerMuted : `${ACCENT}22`,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: danger ? colors.danger : `${ACCENT}55`,
      }}>
        <Text style={{ color, fontSize: 11, fontWeight: '900' }}>{label}</Text>
      </View>
    </AnimatedPressable>
  );
}

function ActionButton({ icon, label, onPress, filled = false }: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  filled?: boolean;
}) {
  const { colors } = useTheme();
  // flex lives on the plain wrapper View — a flex prop on AnimatedPressable
  // would drop and collapse the cell to content width.
  return (
    <View style={{ flex: 1 }}>
      <AnimatedPressable onPress={onPress} scaleValue={0.95} haptic="light" accessibilityRole="button" accessibilityLabel={label}>
        <View style={{
          minHeight: 50,
          borderRadius: 16,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          backgroundColor: filled ? ACCENT : colors.surface,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: filled ? ACCENT : colors.border,
        }}>
          {icon}
          <Text style={{ color: filled ? '#fff' : colors.textSecondary, fontSize: 11, fontWeight: '900' }}>{label}</Text>
        </View>
      </AnimatedPressable>
    </View>
  );
}
