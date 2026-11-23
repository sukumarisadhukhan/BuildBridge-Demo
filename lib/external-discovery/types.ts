export type ExternalCategory =
  | 'open_source'
  | 'competition'
  | 'hackathon'
  | 'internship'
  | 'freelance'
  | 'project_challenge';

export type ExternalListing = {
  id: string;
  externalId: string;
  provider: string;
  title: string;
  description: string;
  sourceUrl: string;
  applicationUrl?: string;
  organization?: string;
  repository?: string;
  category: ExternalCategory;
  skills: string[];
  programmingLanguages?: string[];
  difficulty?: string;
  compensation?: string;
  eligibility?: string;
  location?: string;
  remote?: boolean;
  deadline?: string;
  publishedAt?: string;
  updatedAt?: string;
  lastVerifiedAt: string;
  status: 'active' | 'expired' | 'unknown';
  external: true;
};

export type ExternalMatch = {
  demonstratedSkills: string[];
  missingSkills: string[];
  reason: string;
  fit: 'demonstrated' | 'provisional';
  eligibility: string;
};

export type ExternalDiscoveryResult = {
  listings: ExternalListing[];
  matches: Record<string, ExternalMatch>;
  page: number;
  perPage: number;
  hasMore: boolean;
  providerStatus: {
    github: 'ok' | 'empty' | 'error';
    githubMessage?: string;
  };
};
