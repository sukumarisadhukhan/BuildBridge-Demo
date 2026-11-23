import type { ExternalListing, ExternalMatch } from './types';

export type StudentEvidence = {
  careerGoal?: string | null;
  profileSkills: string[];
  coursework: string[];
  location?: string | null;
  demonstratedSkills: string[];
  completedProjectSkills: string[];
};

function normalize(value: string) {
  return value.trim().toLowerCase();
}

export function matchListing(listing: ExternalListing, evidence: StudentEvidence): ExternalMatch {
  const demonstrated = [...new Set([
    ...evidence.demonstratedSkills,
    ...evidence.completedProjectSkills,
  ].map(normalize).filter(Boolean))];
  const selfDeclared = [...new Set(evidence.profileSkills.map(normalize).filter(Boolean))];
  const listingSkills = [...new Set(listing.skills.map(normalize).filter(Boolean))];
  const texts = `${listing.title} ${listing.description} ${evidence.careerGoal || ''}`.toLowerCase();
  const matchedDemonstrated = listingSkills.filter((skill) => demonstrated.includes(skill));
  const matchedDeclared = listingSkills.filter((skill) => selfDeclared.includes(skill));
  const missing = listingSkills.filter((skill) => !demonstrated.includes(skill) && !selfDeclared.includes(skill));
  const careerMatch = evidence.careerGoal
    ? texts.includes(normalize(evidence.careerGoal))
    : false;

  const reasonParts: string[] = [];
  if (matchedDemonstrated.length) {
    reasonParts.push(`matches demonstrated evidence: ${matchedDemonstrated.join(', ')}`);
  } else if (matchedDeclared.length) {
    reasonParts.push(`matches profile skills: ${matchedDeclared.join(', ')}`);
  } else if (careerMatch) {
    reasonParts.push(`is relevant to the career goal ${evidence.careerGoal}`);
  } else {
    reasonParts.push('is a relevant public listing, but no strong skill evidence is shown');
  }
  if (evidence.location && listing.location && !listing.remote) {
    reasonParts.push(`listed location: ${listing.location}`);
  }

  return {
    demonstratedSkills: matchedDemonstrated,
    missingSkills: missing.slice(0, 8),
    reason: `${reasonParts.join('; ')}.`,
    fit: matchedDemonstrated.length || matchedDeclared.length || careerMatch ? 'demonstrated' : 'provisional',
    eligibility: listing.eligibility || 'Eligibility is not supplied by the source; review the original listing.',
  };
}
