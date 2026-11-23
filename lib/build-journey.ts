export const STUDENT_JOURNEY_STAGES = [
  {
    id: 'learn',
    name: 'Learn',
    detail: 'Build foundations',
    title: 'Learn with a clear direction.',
    description: 'Choose a career goal, identify skill gaps and follow a practical learning path in your preferred language.',
    action: 'Explore focused learning',
  },
  {
    id: 'build',
    name: 'Build',
    detail: 'Create real projects',
    title: 'Build work that has a purpose.',
    description: 'Take on scoped practice and industry projects, then work through milestones with useful feedback.',
    action: 'Explore real projects',
  },
  {
    id: 'prove',
    name: 'Prove',
    detail: 'Submit evidence',
    title: 'Prove what you can actually do.',
    description: 'Submit repositories, deployments, reports and other evidence against clear completion criteria.',
    action: 'See how evidence works',
  },
  {
    id: 'earn',
    name: 'Earn',
    detail: 'Unlock opportunities',
    title: 'Turn verified skills into opportunities.',
    description: 'Use demonstrated work to discover relevant internships, freelance assignments and paid micro-projects.',
    action: 'Discover opportunities',
  },
] as const;
