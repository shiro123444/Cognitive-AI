/* eslint-disable sort-keys */
/**
 * Translation keys used by the components, with English defaults.
 *
 * Most keys are the foundation-owned camelCase keys from `src/i18n.ts`, so the
 * host locale (en-US / zh-CN) applies. The keys marked "new" are not yet in the
 * foundation bundle; `defaultValue` keeps them readable until they are merged.
 */
export const COMPONENT_RESOURCE_DEFAULTS = {
  // Shared
  resultError: 'The operation failed. Please retry explicitly.',
  errorCancelled: 'The local wait was cancelled.',
  id: 'ID',
  createdAt: 'Created',
  noData: 'No data available',

  // Course
  courseTitle: 'Course',
  courseSummary: 'Summary',
  courseStatus: 'Status',
  courseChapters: 'Chapters',
  courseObjectives: 'Learning objectives',
  courseNoChapters: 'This course has no chapters yet.', // new
  courseChapterOrder: 'Order {{order}}', // new
  courseMoreChapters: '{{count}} more chapters not shown.', // new

  // Material
  materialResults: 'Material excerpts',
  materialNoResults: 'No matching material excerpts.',
  materialRetrievalKeyword: 'Keyword search', // new
  materialPage: 'Page',
  materialCitation: 'Citation',
  materialHeading: 'Section',
  materialOpenReference: 'Open source reference',
  a11yOpenReference: 'Open the cited source in a new view',

  // Graph
  a11yGraph: 'Concept graph and list of relationships',
  graphNodes: 'Concepts',
  graphEdges: 'Relationships',
  graphNodeDetails: 'Concept details',
  graphEmpty: 'No graph data is available.',
  graphEvidence: 'Evidence',
  graphDefinition: 'Definition',
  graphDescription:
    'Accessible concept graph with a readable node and edge list.',
  graphNodeList: 'Concept list',
  graphEdgeList: 'Relationship list',
  graphSelectNode: 'Select a concept to inspect it.',
  graphNoDefinition: 'No definition provided.', // new
  graphNoRelationships: 'No relationships for this concept.', // new
  graphTruncatedDiagram: 'The diagram shows the first {{count}} nodes.', // new
  graphMoreRelationships: '{{count}} more relationships not shown.', // new

  // Quiz
  quizItems: 'Questions',
  quizPrompt: 'Question',
  quizAnswerPlaceholder: 'Type your answer',
  quizSubmit: 'Submit answers',
  quizSubmitting: 'Submitting answers…',
  quizEmpty: 'No questions are available for this chapter.',
  quizAnswerRequired: 'Enter an answer for every question.',
  quizAnswerTooLong: 'This answer is too long.',
  quizFeedback: 'Feedback',
  quizCorrect: 'Correct',
  quizIncorrect: 'Needs review',
  quizScore: 'Score',
  quizResults: 'Question results',
  quizFormLabel: 'Quiz answer form',
  quizSubmitted: 'Answers submitted',
  quizSubmission: 'Submission',
  quizAnswersPersisted: 'Your answers remain available after an error.',
  quizSubmitAgain: 'Submit again', // new

  // Progress
  opProgressRead: 'Progress',
  progressEvents: 'Learning events',
  progressSubmissions: 'Quiz submissions',
  progressNoSubmissions: 'No quiz submissions yet.',
  progressScore: 'Score',
  progressCreatedAt: 'Submitted',
  progressCourse: 'Course',
  progressStudent: 'Student',
  progressSubmissionId: 'Submission ID',
  quizChapter: 'Chapter',
  progressNoEvents: 'No recorded activity.', // new
  progressChapterUnassigned: 'No chapter assigned', // new
  progressMoreEvents: '{{count}} more activity types not shown.', // new
  progressMoreSubmissions: '{{count}} more submissions not shown.', // new

  // Lab
  labRun: 'Experiment run',
  labTemplate: 'Template',
  labStatus: 'Status',
  labProgress: 'Progress',
  labProgressMessage: 'Progress message',
  labStartedAt: 'Started',
  labCompletedAt: 'Completed',
  labArtifacts: 'Artifacts',
  labReport: 'Report',
  labStart: 'Start experiment',
  labStarting: 'Starting experiment…',
  labRetry: 'Retry experiment',
  labCancelWait: 'Stop waiting',
  labCancelNotice:
    'Stopping only cancels this local wait. It does not cancel work already running on the server.',
  labNoArtifacts: 'No artifacts yet.',
  labError: 'The experiment run reported an error.',
  labAdapter: 'Adapter',
  labArtifactType: 'Type',
  labReportStatus: 'Report status',
  labNotStarted: 'Not started',
  a11yLabLauncher: 'Experiment launcher',
  labLauncherDescription:
    'Start this lab template for the current course. Nothing runs until you choose to start.', // new
} as const;

export type ComponentResourceKey = keyof typeof COMPONENT_RESOURCE_DEFAULTS;

export const COMPONENT_RESOURCE_KEYS = Object.keys(
  COMPONENT_RESOURCE_DEFAULTS,
) as ComponentResourceKey[];
