import type { ExternalListing } from '../types';

type GithubIssue = {
  id: number;
  number: number;
  title?: string;
  body?: string | null;
  html_url?: string;
  repository_url?: string;
  pull_request?: unknown;
  state?: string;
  labels?: Array<string | { name?: string }>;
  created_at?: string;
  updated_at?: string;
};

type GithubRepository = {
  full_name?: string;
  html_url?: string;
  archived?: boolean;
  language?: string | null;
};

function validExternalUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function timeoutFetch(url: string, headers: HeadersInit, timeoutMs = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, {
    headers,
    cache: 'no-store',
    next: { revalidate: 1800 },
    signal: controller.signal,
  }).finally(() => clearTimeout(timer));
}

function labelNames(issue: GithubIssue) {
  return (issue.labels || []).map((label) => typeof label === 'string' ? label : label.name || '')
    .filter(Boolean);
}

export async function discoverGithub(params: {
  query: string;
  skill: string;
  technology: string;
  language: string;
  page: number;
  sort: 'relevance' | 'newest';
}): Promise<{ listings: ExternalListing[]; hasMore: boolean; status: 'ok' | 'empty' | 'error'; message?: string }> {
  const terms: string[] = ['is:issue', 'is:open', 'archived:false'];
  const labels = '(label:"good first issue" OR label:"help wanted")';
  terms.push(labels);
  if (params.query) terms.push(params.query);
  if (params.skill) terms.push(params.skill);
  if (params.technology) terms.push(params.technology);
  if (params.language) terms.push(`language:${params.language}`);

  const search = new URL('https://api.github.com/search/issues');
  search.searchParams.set('q', terms.join(' '));
  search.searchParams.set('per_page', '30');
  search.searchParams.set('page', String(params.page));
  if (params.sort === 'newest') {
    search.searchParams.set('sort', 'updated');
    search.searchParams.set('order', 'desc');
  }

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'BuildBridge',
  };
  if (process.env.GITHUB_TOKEN?.trim()) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN.trim()}`;
  }

  let response: Response;
  try {
    response = await timeoutFetch(search.toString(), headers);
  } catch {
    return { listings: [], hasMore: false, status: 'error', message: 'GitHub did not respond within the request timeout.' };
  }
  if (response.status === 403 || response.status === 429) {
    return { listings: [], hasMore: false, status: 'error', message: 'GitHub rate limit reached. Retry after the provider limit resets.' };
  }
  if (!response.ok) {
    return { listings: [], hasMore: false, status: 'error', message: `GitHub returned an unavailable response (${response.status}).` };
  }

  let payload: { items?: GithubIssue[]; total_count?: number } | null = null;
  try {
    payload = await response.json();
  } catch {
    return { listings: [], hasMore: false, status: 'error', message: 'GitHub returned an invalid response.' };
  }
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const verified: ExternalListing[] = [];
  const seen = new Set<string>();

  for (const issue of items) {
    if (issue.pull_request || issue.state !== 'open') continue;
    const sourceUrl = validExternalUrl(issue.html_url);
    if (!sourceUrl || !issue.repository_url) continue;
    let repoUrl: string | null = null;
    let repositoryName = '';
    try {
      const apiUrl = new URL(issue.repository_url);
      if (apiUrl.origin !== 'https://api.github.com') continue;
      const parts = apiUrl.pathname.split('/').filter(Boolean);
      if (parts.length >= 3) repositoryName = `${parts[1]}/${parts[2]}`;
      repoUrl = validExternalUrl(`https://github.com/${repositoryName}`);
    } catch {
      continue;
    }
    if (!repoUrl) continue;

    let programmingLanguages: string[] = [];
    try {
      const repoResponse = await timeoutFetch(`https://api.github.com/repos/${repositoryName}`, headers);
      if (repoResponse.ok) {
        const repo = await repoResponse.json() as GithubRepository;
        if (repo.archived) continue;
        if (repo.language) programmingLanguages = [repo.language];
      }
      if (!programmingLanguages.length) {
        const languagesResponse = await timeoutFetch(`https://api.github.com/repos/${repositoryName}/languages`, headers);
        if (languagesResponse.ok) {
          const languages = await languagesResponse.json() as Record<string, number>;
          programmingLanguages = Object.keys(languages).slice(0, 8);
        }
      }
    } catch {
      // Repository metadata is optional; the live issue remains usable.
    }

    const externalId = `github:issue:${issue.id}`;
    if (seen.has(externalId)) continue;
    seen.add(externalId);
    const labels = labelNames(issue);
    const now = new Date().toISOString();
    verified.push({
      id: externalId,
      externalId: String(issue.id),
      provider: 'github',
      title: issue.title?.trim().slice(0, 300) || 'Untitled GitHub issue',
      description: issue.body?.trim().slice(0, 1200) || 'No description was supplied by the source.',
      sourceUrl,
      applicationUrl: sourceUrl,
      organization: repositoryName.split('/')[0],
      repository: repositoryName,
      category: 'open_source',
      skills: labels,
      programmingLanguages,
      publishedAt: issue.created_at,
      updatedAt: issue.updated_at,
      lastVerifiedAt: now,
      status: 'active',
      external: true,
    });
  }

  if (!verified.length) {
    return {
      listings: [],
      hasMore: false,
      status: items.length ? 'empty' : 'empty',
      message: items.length ? 'GitHub issues were found, but no usable non-archived issue listings remained.' : 'No matching live GitHub issues were found.',
    };
  }
  return {
    listings: verified,
    hasMore: (payload?.total_count || 0) > params.page * 30,
    status: 'ok',
  };
}
