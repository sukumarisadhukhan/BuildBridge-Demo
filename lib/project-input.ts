export const PROJECT_CATEGORIES = [
  'Data Analytics',
  'Full-stack Development',
  'AI/ML',
  'Cybersecurity',
  'Product Management',
] as const;

export const PROJECT_DIFFICULTIES = ['Beginner', 'Intermediate', 'Advanced'] as const;

export type ProjectMilestoneInput = {
  title: string;
  description: string;
  acceptanceCriteria: string;
  requiredDeliverables: string[];
  deadline: string | null;
  isRequired: boolean;
};

export type ProjectResourceInput = {
  label: string;
  url: string;
};

export type ProjectRubricInput = {
  criterion: string;
  weight: number;
};

export type ProjectInput = {
  title: string;
  problemStatement: string;
  scope: string;
  deliverables: string;
  acceptanceCriteria: string;
  category: typeof PROJECT_CATEGORIES[number];
  difficulty: typeof PROJECT_DIFFICULTIES[number];
  projectType: string;
  requiredSkills: string[];
  estimatedDurationDays: number | null;
  deadline: string | null;
  revisionPolicy: string;
  paymentTerms: string;
  requirements: string[];
  submissionFormat: string;
  resources: ProjectResourceInput[];
  evaluationRubric: ProjectRubricInput[];
  milestones: ProjectMilestoneInput[];
};

function text(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const result = value.trim();
  return result && result.length <= maxLength ? result : null;
}

function stringList(value: unknown, maxItems: number, maxLength: number): string[] | null {
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const items = value.map((item) => typeof item === 'string' ? item.trim() : '');
  if (items.some((item) => !item || item.length > maxLength)) return null;
  return items;
}

export function validateProjectInput(body: Record<string, unknown>):
  | { data: ProjectInput }
  | { error: string } {
  const title = text(body.title, 160);
  const problemStatement = text(body.problemStatement, 6000);
  const scope = text(body.scope, 6000);
  const deliverables = text(body.deliverables, 4000);
  const acceptanceCriteria = text(body.acceptanceCriteria, 4000);
  const projectType = text(body.projectType, 60);
  if (!title || !problemStatement || !scope || !deliverables || !acceptanceCriteria || !projectType) {
    return { error: 'Title, problem statement, scope, deliverables, acceptance criteria, and project type are required.' };
  }
  if (!PROJECT_CATEGORIES.includes(body.category as typeof PROJECT_CATEGORIES[number])) {
    return { error: 'Choose a supported project category.' };
  }
  if (!PROJECT_DIFFICULTIES.includes(body.difficulty as typeof PROJECT_DIFFICULTIES[number])) {
    return { error: 'Choose a supported difficulty.' };
  }

  const requiredSkills = stringList(body.requiredSkills, 20, 60);
  const requirements = stringList(body.requirements, 30, 500);
  if (!requiredSkills || !requiredSkills.length || !requirements) {
    return { error: 'Add at least one required skill and provide valid project requirements.' };
  }

  const submissionFormat = text(body.submissionFormat, 1000);
  if (!submissionFormat) return { error: 'Describe the required submission format.' };

  let estimatedDurationDays: number | null = null;
  if (body.estimatedDurationDays !== null && body.estimatedDurationDays !== undefined && body.estimatedDurationDays !== '') {
    const parsed = Number(body.estimatedDurationDays);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 365) {
      return { error: 'Estimated duration must be between 1 and 365 days.' };
    }
    estimatedDurationDays = parsed;
  }

  let deadline: string | null = null;
  if (body.deadline) {
    const deadlineDate = typeof body.deadline === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.deadline)
      ? new Date(`${body.deadline}T00:00:00Z`)
      : null;
    if (!deadlineDate || Number.isNaN(deadlineDate.getTime()) || deadlineDate.toISOString().slice(0, 10) !== body.deadline) {
      return { error: 'Enter a valid project deadline.' };
    }
    deadline = body.deadline;
  }

  const revisionPolicy = body.revisionPolicy === undefined ? '' : text(body.revisionPolicy, 2000);
  const paymentTerms = body.paymentTerms === undefined ? '' : text(body.paymentTerms, 1000);
  if (revisionPolicy === null || paymentTerms === null) {
    return { error: 'Revision policy or compensation details are too long.' };
  }

  if (!Array.isArray(body.milestones) || body.milestones.length < 1 || body.milestones.length > 10) {
    return { error: 'Add between 1 and 10 project milestones.' };
  }
  const milestones: ProjectMilestoneInput[] = [];
  for (const item of body.milestones) {
    if (!item || typeof item !== 'object') return { error: 'Each milestone must include a title and completion details.' };
    const milestone = item as Record<string, unknown>;
    const milestoneTitle = text(milestone.title, 160);
    const description = text(milestone.description, 1000);
    const criteria = text(milestone.acceptanceCriteria, 1000);
    const requiredDeliverables = milestone.requiredDeliverables === undefined
      ? []
      : stringList(milestone.requiredDeliverables, 20, 200);
    const isRequired = milestone.isRequired === undefined ? true : milestone.isRequired;
    let milestoneDeadline: string | null = null;
    const deadlineValue = milestone.deadline;
    if (deadlineValue !== undefined && deadlineValue !== null && deadlineValue !== '') {
      const deadlineText = typeof deadlineValue === 'string' ? deadlineValue : '';
      const parsed = /^\d{4}-\d{2}-\d{2}$/.test(deadlineText)
        ? new Date(`${deadlineText}T00:00:00Z`)
        : null;
      if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== deadlineText) {
        return { error: 'Enter a valid milestone deadline.' };
      }
      milestoneDeadline = deadlineText;
    }
    if (!milestoneTitle || !description || !criteria) {
      return { error: 'Each milestone requires a title, description, and acceptance criteria.' };
    }
    if (!requiredDeliverables || typeof isRequired !== 'boolean') {
      return { error: 'Milestone deliverables must be a list and required must be true or false.' };
    }
    milestones.push({
      title: milestoneTitle,
      description,
      acceptanceCriteria: criteria,
      requiredDeliverables,
      deadline: milestoneDeadline,
      isRequired,
    });
  }
  if (!milestones.some((milestone) => milestone.isRequired)) {
    return { error: 'At least one project milestone must be required for completion.' };
  }

  if (!Array.isArray(body.resources) || body.resources.length > 15) {
    return { error: 'Provide up to 15 project resources.' };
  }
  const resources: ProjectResourceInput[] = [];
  for (const item of body.resources) {
    if (!item || typeof item !== 'object') return { error: 'Each resource requires a label and valid URL.' };
    const resource = item as Record<string, unknown>;
    const label = text(resource.label, 120);
    const url = text(resource.url, 1000);
    if (!label || !url) return { error: 'Each resource requires a label and valid URL.' };
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('Unsupported URL protocol.');
    } catch {
      return { error: 'Project resource URLs must use HTTP or HTTPS.' };
    }
    resources.push({ label, url });
  }

  if (!Array.isArray(body.evaluationRubric) || body.evaluationRubric.length < 1 || body.evaluationRubric.length > 10) {
    return { error: 'Add between 1 and 10 evaluation rubric criteria.' };
  }
  const evaluationRubric: ProjectRubricInput[] = [];
  for (const item of body.evaluationRubric) {
    if (!item || typeof item !== 'object') return { error: 'Each rubric item requires a criterion and a weight.' };
    const rubricItem = item as Record<string, unknown>;
    const criterion = text(rubricItem.criterion, 200);
    const weight = Number(rubricItem.weight);
    if (!criterion || !Number.isInteger(weight) || weight < 1 || weight > 100) {
      return { error: 'Rubric criteria need a name and a whole-number weight from 1 to 100.' };
    }
    evaluationRubric.push({ criterion, weight });
  }
  if (evaluationRubric.reduce((sum, item) => sum + item.weight, 0) !== 100) {
    return { error: 'Evaluation rubric weights must total 100.' };
  }

  return {
    data: {
      title,
      problemStatement,
      scope,
      deliverables,
      acceptanceCriteria,
      category: body.category as ProjectInput['category'],
      difficulty: body.difficulty as ProjectInput['difficulty'],
      projectType,
      requiredSkills,
      estimatedDurationDays,
      deadline,
      revisionPolicy,
      paymentTerms,
      requirements,
      submissionFormat,
      resources,
      evaluationRubric,
      milestones,
    },
  };
}

export function projectRow(input: ProjectInput) {
  return {
    title: input.title,
    problem_statement: input.problemStatement,
    scope: input.scope,
    deliverables: input.deliverables,
    acceptance_criteria: input.acceptanceCriteria,
    category: input.category,
    difficulty: input.difficulty,
    project_type: input.projectType,
    required_skills: input.requiredSkills,
    estimated_duration_days: input.estimatedDurationDays,
    deadline: input.deadline,
    revision_policy: input.revisionPolicy || null,
    payment_terms: input.paymentTerms || null,
    requirements: input.requirements,
    submission_format: input.submissionFormat,
    resources: input.resources,
    evaluation_rubric: input.evaluationRubric,
    updated_at: new Date().toISOString(),
  };
}
