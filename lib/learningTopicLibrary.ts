import {
  addLearningCodeLab,
  createLearningGoal,
  type LearningGoal,
  type LearningLevel,
  type LearningMode,
  type LearningResource,
} from './learn';

export interface LearningTopicMaterial {
  title: string;
  provider: string;
  url: string;
  note: string;
}

export interface CuratedLearningTopic {
  id: string;
  title: string;
  category: string;
  level: LearningLevel;
  mode: LearningMode;
  dailyMinutes: number;
  summary: string;
  whyNow: string;
  project: string;
  tags: string[];
  materials: LearningTopicMaterial[];
  codeLab?: {
    language: string;
    prompt: string;
    starterCode: string;
    notes: string;
  };
}

export const CURATED_LEARNING_TOPICS: CuratedLearningTopic[] = [
  topic('ai-literacy', 'AI literacy and prompt judgment', 'Technology', 'beginner', 'Understand AI output, verify facts, and use prompts responsibly.', 'AI is now a baseline skill across school, work, and creation.', 'Create a reusable prompt checklist and test it on three real tasks.', ['AI', 'career'], [
    material('Google AI Essentials', 'Google', 'https://grow.google/ai/', 'Practical AI basics for everyday work.'),
    material('Elements of AI', 'University of Helsinki', 'https://www.elementsofai.com/', 'Free beginner-friendly AI course.'),
  ]),
  topic('generative-ai-llms', 'Generative AI and LLM foundations', 'Technology', 'some', 'Learn how LLMs work, where they fail, and how to evaluate answers.', 'LLMs are becoming the interface for research, writing, coding, and operations.', 'Build a comparison sheet for three AI tools on one workflow.', ['AI', 'LLM'], [
    material('Hugging Face Learn', 'Hugging Face', 'https://huggingface.co/learn', 'Free courses and practical model resources.'),
    material('Introduction to Large Language Models', 'Google Cloud Skills Boost', 'https://www.cloudskillsboost.google/catalog?keywords=large%20language%20models', 'Free Google LLM learning modules.'),
  ], code('Python', 'Call an LLM or mock one, then log prompt, answer, and verification notes.', 'prompt = "Explain LLMs in 3 bullets"\nprint(prompt)\n', 'Add a verification step before accepting output.')),
  topic('ai-agents-automation', 'AI agents and workflow automation', 'Technology', 'some', 'Design small agent workflows with tools, memory, checks, and human approval.', 'Agentic software is shifting work from doing tasks to supervising systems.', 'Map one personal workflow into trigger, steps, checks, and fallback.', ['AI', 'automation'], [
    material('OpenAI Agents SDK docs', 'OpenAI', 'https://platform.openai.com/docs/guides/agents', 'Agent-building concepts and patterns.'),
    material('LangChain Academy', 'LangChain', 'https://academy.langchain.com/', 'Free agent and LLM app learning modules.'),
  ], code('TypeScript', 'Sketch a tool-using assistant with one guarded action.', 'type ToolResult = { ok: boolean; message: string };\nfunction approve(action: string): ToolResult {\n  return { ok: false, message: `Needs approval: ${action}` };\n}\n', 'Keep human approval on irreversible actions.')),
  topic('responsible-ai', 'Responsible AI, ethics, and safety', 'Technology', 'beginner', 'Learn bias, privacy, transparency, and governance basics.', 'AI adoption is moving faster than policy and trust systems.', 'Write an AI-use policy for a class, team, or personal project.', ['AI', 'ethics'], [
    material('Responsible AI practices', 'Google AI', 'https://ai.google/responsibility/responsible-ai-practices/', 'Principles and practices for responsible AI.'),
    material('AI Risk Management Framework', 'NIST', 'https://www.nist.gov/itl/ai-risk-management-framework', 'Free AI risk framework.'),
  ]),
  topic('machine-learning', 'Machine learning foundations', 'Technology', 'some', 'Learn models, training data, evaluation, overfitting, and basic ML workflows.', 'ML remains the foundation under many AI products and data roles.', 'Train or inspect one simple model and explain its failure modes.', ['AI', 'data'], [
    material('Machine Learning Crash Course', 'Google', 'https://developers.google.com/machine-learning/crash-course', 'Free practical ML foundations.'),
    material('Kaggle Learn Intro to Machine Learning', 'Kaggle', 'https://www.kaggle.com/learn/intro-to-machine-learning', 'Short free ML lessons.'),
  ], code('Python', 'Train a tiny classifier or write pseudo-code for model evaluation.', 'accuracy = correct / total\nprint(f"accuracy={accuracy:.2f}")\n', 'Track inputs, outputs, metric, and one limitation.')),
  topic('data-analysis-python', 'Data analysis with Python', 'Technology', 'beginner', 'Clean, analyze, visualize, and explain datasets.', 'Data fluency is valuable across business, finance, health, and product work.', 'Analyze a small CSV and publish three insights.', ['data', 'python'], [
    material('Kaggle Learn Python', 'Kaggle', 'https://www.kaggle.com/learn/python', 'Free Python lessons for data work.'),
    material('freeCodeCamp Data Analysis with Python', 'freeCodeCamp', 'https://www.freecodecamp.org/learn/data-analysis-with-python/', 'Free full curriculum.'),
  ], code('Python', 'Load a CSV, group one column, and write one insight.', 'import pandas as pd\n\ndf = pd.DataFrame()\nprint(df.head())\n', 'Never stop at charts; write the decision the data supports.')),
  topic('sql-databases', 'SQL and databases', 'Technology', 'beginner', 'Query, join, aggregate, and reason about relational data.', 'SQL is still a universal skill for analytics, product, operations, and AI data work.', 'Create five useful queries for a small dataset.', ['data', 'backend'], [
    material('SQLBolt', 'SQLBolt', 'https://sqlbolt.com/', 'Interactive free SQL practice.'),
    material('Khan Academy SQL', 'Khan Academy', 'https://www.khanacademy.org/computing/computer-programming/sql', 'Free beginner SQL course.'),
  ], code('SQL', 'Write a query that groups results and explains the business meaning.', 'SELECT category, COUNT(*) AS total\nFROM items\nGROUP BY category;\n', 'Practice reading query results like evidence.')),
  topic('cybersecurity-foundations', 'Cybersecurity foundations', 'Technology', 'beginner', 'Understand threats, passwords, networks, phishing, and defensive habits.', 'Cyber risk is rising as more work and identity moves online.', 'Make a personal or family security checklist.', ['security'], [
    material('Introduction to Cybersecurity', 'Cisco Networking Academy', 'https://www.netacad.com/courses/cybersecurity/introduction-cybersecurity', 'Free intro cybersecurity course.'),
    material('Cybersecurity basics', 'CISA', 'https://www.cisa.gov/secure-our-world', 'Free practical security guidance.'),
  ]),
  topic('ai-security', 'AI security and governance', 'Technology', 'intermediate', 'Learn prompt injection, data leakage, evals, model risk, and guardrails.', 'AI and cybersecurity are converging into one high-demand skill area.', 'Threat-model one AI feature and propose controls.', ['AI', 'security'], [
    material('OWASP Top 10 for LLM Applications', 'OWASP', 'https://owasp.org/www-project-top-10-for-large-language-model-applications/', 'Free LLM security risks and mitigations.'),
    material('NIST AI RMF', 'NIST', 'https://www.nist.gov/itl/ai-risk-management-framework', 'Risk management framework for AI systems.'),
  ], code('Markdown', 'Write an AI feature threat model with assets, attacks, and mitigations.', '## Assets\n- User data\n\n## Risks\n- Prompt injection\n\n## Controls\n- Input filtering\n', 'Include privacy and abuse cases, not only technical bugs.')),
  topic('cloud-engineering', 'Cloud engineering', 'Technology', 'some', 'Learn compute, networking, storage, IAM, monitoring, and deployment basics.', 'Cloud remains core infrastructure for AI, apps, and modern operations.', 'Diagram and deploy a tiny web service or static site.', ['cloud', 'devops'], [
    material('AWS Skill Builder', 'AWS', 'https://skillbuilder.aws/', 'Free cloud training catalog.'),
    material('Microsoft Learn Azure', 'Microsoft', 'https://learn.microsoft.com/training/azure/', 'Free Azure learning paths.'),
  ], code('YAML', 'Write a minimal deployment checklist for a cloud service.', 'service: app\nchecks:\n  - env vars\n  - logs\n  - rollback\n', 'Cloud skill includes operations, not just clicking deploy.')),
  topic('devops-cicd', 'DevOps and CI/CD', 'Technology', 'some', 'Automate builds, tests, deployments, and rollback habits.', 'AI coding makes verification and release discipline more important.', 'Create a CI checklist for one project.', ['devops', 'software'], [
    material('GitHub Skills', 'GitHub', 'https://skills.github.com/', 'Free interactive GitHub and CI lessons.'),
    material('Atlassian DevOps guide', 'Atlassian', 'https://www.atlassian.com/devops', 'Free DevOps concepts and workflows.'),
  ], code('YAML', 'Draft a CI workflow that runs tests before release.', 'name: checks\non: [push]\njobs:\n  test:\n    runs-on: ubuntu-latest\n', 'Add one quality gate before deploy.')),
  topic('full-stack-web', 'Full-stack web development', 'Technology', 'beginner', 'Build web pages, APIs, databases, auth, and deployable apps.', 'Web apps remain one of the most accessible paths to shipping products.', 'Ship a tiny CRUD app with one real user workflow.', ['software', 'web'], [
    material('The Odin Project', 'The Odin Project', 'https://www.theodinproject.com/', 'Free full-stack curriculum.'),
    material('MDN Learn Web Development', 'MDN', 'https://developer.mozilla.org/en-US/docs/Learn', 'Free web standards learning.'),
  ], code('JavaScript', 'Build a small form that saves and displays items.', 'const items = [];\nfunction addItem(text) {\n  items.push(text);\n}\n', 'Make it usable before making it clever.')),
  topic('mobile-apps-react-native', 'Mobile apps with React Native and Expo', 'Technology', 'some', 'Build cross-platform mobile UI, navigation, device APIs, and releases.', 'Mobile remains essential for consumer tools and creator products.', 'Build a tiny habit tracker screen with local state.', ['mobile', 'software'], [
    material('Expo Tutorial', 'Expo', 'https://docs.expo.dev/tutorial/introduction/', 'Free Expo app-building tutorial.'),
    material('React Native docs', 'Meta', 'https://reactnative.dev/docs/getting-started', 'Official React Native learning docs.'),
  ], code('TypeScript', 'Create one reusable mobile card component.', 'type CardProps = { title: string; body: string };\nexport function Card(props: CardProps) {\n  return null;\n}\n', 'Design for small screens first.')),
  topic('product-management-ai', 'AI product management', 'Business', 'some', 'Turn user problems into AI-assisted workflows, metrics, and safe launches.', 'Teams need people who can translate AI capability into useful products.', 'Write a product brief for one AI-powered workflow.', ['product', 'AI'], [
    material('Product Management course', 'Great Learning Academy', 'https://www.mygreatlearning.com/academy/learn-for-free/courses/product-management', 'Free product management course.'),
    material('AI product guide', 'Google PAIR', 'https://pair.withgoogle.com/guidebook/', 'People + AI product design guidance.'),
  ]),
  topic('ux-ui-design', 'UX/UI design systems', 'Design', 'beginner', 'Learn layout, hierarchy, usability, components, and design critique.', 'AI can generate screens, but judgment and usability still decide quality.', 'Redesign one broken screen and explain every decision.', ['design'], [
    material('Figma Resource Library', 'Figma', 'https://www.figma.com/resource-library/', 'Free design learning resources.'),
    material('Material Design', 'Google', 'https://m3.material.io/', 'Free design system guidance.'),
  ]),
  topic('digital-marketing-seo', 'Digital marketing and SEO', 'Business', 'beginner', 'Learn search visibility, analytics, content, funnels, and experimentation.', 'Creators and businesses need distribution, not only production.', 'Create a one-page content and SEO plan for a topic.', ['marketing'], [
    material('SEO Starter Guide', 'Google Search Central', 'https://developers.google.com/search/docs/fundamentals/seo-starter-guide', 'Official free SEO basics.'),
    material('Google Skillshop', 'Google', 'https://skillshop.withgoogle.com/', 'Free Google marketing product training.'),
  ]),
  topic('creator-systems', 'Creator content systems', 'Writing', 'beginner', 'Build repeatable idea capture, scripting, publishing, and feedback loops.', 'Audience building is increasingly a practical career and business skill.', 'Create a 7-day content calendar with one reusable template.', ['creator', 'content'], [
    material('YouTube Creator Academy', 'YouTube', 'https://www.youtube.com/creators/', 'Free creator growth resources.'),
    material('HubSpot Content Marketing', 'HubSpot Academy', 'https://academy.hubspot.com/courses/content-marketing', 'Free content marketing course.'),
  ]),
  topic('personal-finance', 'Personal finance and investing basics', 'Finance', 'beginner', 'Learn budgeting, debt, saving, investing, and risk.', 'Financial literacy compounds across every career and life stage.', 'Build a personal money dashboard and weekly review.', ['money'], [
    material('Personal finance', 'Khan Academy', 'https://www.khanacademy.org/college-careers-more/personal-finance', 'Free personal finance lessons.'),
    material('Investor.gov', 'SEC', 'https://www.investor.gov/introduction-investing', 'Free investing education.'),
  ]),
  topic('entrepreneurship', 'Entrepreneurship and startup validation', 'Business', 'beginner', 'Learn problem discovery, validation, MVPs, customers, and iteration.', 'Small teams can build faster with AI, but validation still matters.', 'Interview five target users and summarize patterns.', ['startup'], [
    material('Startup School', 'Y Combinator', 'https://www.startupschool.org/', 'Free startup lessons and community.'),
    material('How to Start a Startup', 'Stanford', 'https://startupclass.samaltman.com/', 'Free startup lecture series.'),
  ]),
  topic('communication-public-speaking', 'Communication and public speaking', 'Public speaking', 'beginner', 'Improve clarity, storytelling, presentations, and confidence.', 'Human communication is more valuable as automation handles routine output.', 'Record a three-minute explanation and revise it twice.', ['communication'], [
    material('Toastmasters resources', 'Toastmasters', 'https://www.toastmasters.org/resources', 'Free speaking resources.'),
    material('Purdue OWL presentations', 'Purdue OWL', 'https://owl.purdue.edu/owl/general_writing/academic_writing/presentation_skills.html', 'Free presentation guidance.'),
  ]),
  topic('study-skills-exam', 'Study skills and exam strategy', 'Exam prep', 'beginner', 'Learn active recall, spaced repetition, mock tests, and stress control.', 'Learners need better systems, not only more hours.', 'Build a 14-day revision plan with weak-topic tracking.', ['study', 'exam'], [
    material('Learning how to learn', 'Coursera', 'https://www.coursera.org/learn/learning-how-to-learn', 'Can be audited free.'),
    material('Study skills', 'Khan Academy', 'https://www.khanacademy.org/college-careers-more/learnstorm-growth-mindset-activities-us', 'Free learning mindset resources.'),
  ]),
  topic('statistics-math', 'Statistics and practical math', 'Mathematics', 'beginner', 'Learn probability, distributions, inference, charts, and decision math.', 'Stats powers AI, finance, experiments, and everyday reasoning.', 'Explain one chart and one probability mistake in plain language.', ['math', 'data'], [
    material('Statistics and probability', 'Khan Academy', 'https://www.khanacademy.org/math/statistics-probability', 'Free statistics curriculum.'),
    material('Seeing Theory', 'Brown University', 'https://seeing-theory.brown.edu/', 'Visual free probability and statistics.'),
  ]),
  topic('business-writing', 'Business writing and note synthesis', 'Writing', 'beginner', 'Write clearer memos, summaries, proposals, and decisions.', 'AI drafts text, but people still need judgment, structure, and concise synthesis.', 'Turn messy notes into a one-page decision memo.', ['writing'], [
    material('Purdue OWL professional writing', 'Purdue OWL', 'https://owl.purdue.edu/owl/subject_specific_writing/professional_technical_writing/index.html', 'Free professional writing guide.'),
    material('Plain language guidelines', 'PlainLanguage.gov', 'https://www.plainlanguage.gov/guidelines/', 'Free clear writing principles.'),
  ]),
  topic('language-learning', 'Language learning practice system', 'Language', 'beginner', 'Build vocabulary, listening, speaking, and spaced review habits.', 'Language skills unlock global work, travel, and cultural access.', 'Record a 60-second speaking sample every day for one week.', ['language'], [
    material('Duolingo', 'Duolingo', 'https://www.duolingo.com/learn', 'Free language practice.'),
    material('BBC Languages archive', 'BBC', 'https://www.bbc.co.uk/languages/', 'Free language learning archive.'),
  ]),
  topic('fitness-health', 'Fitness and movement basics', 'Health', 'beginner', 'Learn training principles, activity, recovery, and habit design.', 'Health routines support energy, focus, and long-term resilience.', 'Create a 3-day beginner movement plan and log results.', ['health', 'fitness'], [
    material('Exercise', 'NHS', 'https://www.nhs.uk/live-well/exercise/', 'Free health and exercise guidance.'),
    material('Physical activity', 'WHO', 'https://www.who.int/news-room/fact-sheets/detail/physical-activity', 'Free global physical activity guidance.'),
  ]),
  topic('nutrition-cooking', 'Nutrition and cooking basics', 'Health', 'beginner', 'Learn meals, macros, grocery planning, and simple repeatable cooking.', 'Food systems affect energy, budget, family routines, and health.', 'Make a three-meal repeatable menu with cost and nutrition notes.', ['health', 'cooking'], [
    material('The Nutrition Source', 'Harvard T.H. Chan', 'https://nutritionsource.hsph.harvard.edu/', 'Free nutrition evidence and guides.'),
    material('MyPlate', 'USDA', 'https://www.myplate.gov/', 'Free meal planning guidance.'),
  ]),
  topic('mental-resilience', 'Mental resilience and stress management', 'Health', 'beginner', 'Build emotional regulation, reflection, recovery, and support habits.', 'Sustainable productivity requires stress skills, not only task systems.', 'Create a personal reset protocol for stressful days.', ['wellbeing'], [
    material('Doing What Matters in Times of Stress', 'WHO', 'https://www.who.int/publications/i/item/9789240003927', 'Free WHO stress-management guide.'),
    material('Mental wellbeing', 'NHS', 'https://www.nhs.uk/every-mind-matters/', 'Free mental wellbeing guidance.'),
  ]),
  topic('career-interviews', 'Career planning and interviews', 'Career', 'beginner', 'Clarify roles, portfolio proof, resumes, interviews, and follow-ups.', 'Career paths are changing quickly as AI reshapes entry-level work.', 'Create a role target, proof list, and five interview stories.', ['career'], [
    material('Interview Warmup', 'Google', 'https://grow.google/certificates/interview-warmup/', 'Free interview practice tool.'),
    material('CareerOneStop', 'U.S. Department of Labor', 'https://www.careeronestop.org/', 'Free career exploration and job-search resources.'),
  ]),
  topic('remote-work-productivity', 'Remote work and async productivity', 'Career', 'beginner', 'Learn async updates, meetings, documentation, boundaries, and collaboration.', 'Distributed teams need clearer communication and better personal systems.', 'Write a weekly async update template and meeting rules.', ['career', 'productivity'], [
    material('Team Playbook', 'Atlassian', 'https://www.atlassian.com/team-playbook', 'Free team collaboration plays.'),
    material('re:Work guides', 'Google', 'https://rework.withgoogle.com/', 'Free team and workplace practices.'),
  ]),
  topic('climate-sustainability', 'Climate and sustainability basics', 'Science', 'beginner', 'Understand climate science, carbon, policy, and sustainable decisions.', 'Climate literacy matters for business, civic life, and future careers.', 'Audit one personal or team habit for carbon and cost impact.', ['climate'], [
    material('UN CC:e-Learn', 'United Nations', 'https://unccelearn.org/', 'Free climate change courses.'),
    material('Climate science', 'NASA', 'https://science.nasa.gov/climate-change/', 'Free climate science explanations.'),
  ]),
];

function material(title: string, provider: string, url: string, note: string): LearningTopicMaterial {
  return { title, provider, url, note };
}

function code(language: string, prompt: string, starterCode: string, notes: string) {
  return { language, prompt, starterCode, notes };
}

function topic(
  id: string,
  title: string,
  category: string,
  level: LearningLevel,
  summary: string,
  whyNow: string,
  project: string,
  tags: string[],
  materials: LearningTopicMaterial[],
  codeLab?: CuratedLearningTopic['codeLab'],
): CuratedLearningTopic {
  return { id, title, category, level, mode: 'student', dailyMinutes: 25, summary, whyNow, project, tags, materials, codeLab };
}

export function createLearningGoalFromTopic(topicItem: CuratedLearningTopic): LearningGoal {
  const now = new Date().toISOString();
  let goal = createLearningGoal({
    title: topicItem.title,
    category: topicItem.category,
    mode: topicItem.mode,
    level: topicItem.level,
    targetOutcome: topicItem.project,
    dailyMinutes: topicItem.dailyMinutes,
  });
  const resources: LearningResource[] = topicItem.materials.map((item, index) => ({
    id: `${Date.now()}-topic-resource-${index}`,
    title: `${item.provider}: ${item.title}`,
    kind: 'link',
    detail: `${item.url}\n${item.note}`,
    createdAt: now,
  }));
  goal = {
    ...goal,
    resources,
    assignments: [{
      id: `${Date.now()}-topic-project`,
      title: 'Echo proof project',
      instructions: topicItem.project,
      done: false,
      createdAt: now,
    }, ...goal.assignments],
    evidence: [{
      id: `${Date.now()}-topic-why`,
      title: 'Why this matters now',
      detail: topicItem.whyNow,
      kind: 'note',
      createdAt: now,
    }, ...goal.evidence],
    updatedAt: now,
  };
  if (topicItem.codeLab) {
    goal = addLearningCodeLab(goal, {
      title: `${topicItem.title} code-along`,
      language: topicItem.codeLab.language,
      prompt: topicItem.codeLab.prompt,
      starterCode: topicItem.codeLab.starterCode,
      notes: topicItem.codeLab.notes,
    });
  }
  return goal;
}
