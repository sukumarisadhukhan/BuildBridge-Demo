'use client';

export type SocialProvider = 'google' | 'github' | 'linkedin_oidc';

type Props = {
  busy?: boolean;
  onSelect: (provider: SocialProvider) => void;
};

function ProviderMark({ provider }: { provider: SocialProvider }) {
  if (provider === 'google') return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.68-.06-1.34-.18-1.98H12v3.75h5.38a4.6 4.6 0 0 1-2 3.02v2.45h3.24c1.9-1.75 2.98-4.33 2.98-7.24Z"/><path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.43l-3.24-2.45c-.9.6-2.04.96-3.38.96-2.6 0-4.8-1.75-5.6-4.1H3.05v2.53A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.4 13.98a6 6 0 0 1 0-3.96V7.5H3.05a10 10 0 0 0 0 9l3.35-2.52Z"/><path fill="#EA4335" d="M12 5.92c1.47 0 2.78.5 3.81 1.5l2.86-2.85A9.56 9.56 0 0 0 12 2a10 10 0 0 0-8.95 5.5L6.4 10c.8-2.35 3-4.08 5.6-4.08Z"/></svg>;
  if (provider === 'github') return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 .9a11.1 11.1 0 0 0-3.51 21.63c.55.1.76-.24.76-.54v-2.1c-3.1.68-3.76-1.32-3.76-1.32-.5-1.3-1.25-1.65-1.25-1.65-1.02-.7.08-.69.08-.69 1.13.08 1.72 1.16 1.72 1.16 1 1.72 2.62 1.22 3.26.93.1-.72.39-1.22.7-1.5-2.47-.28-5.07-1.23-5.07-5.5 0-1.22.44-2.21 1.16-2.99-.12-.29-.5-1.43.11-2.97 0 0 .95-.3 3.06 1.14a10.6 10.6 0 0 1 5.57 0c2.12-1.44 3.06-1.14 3.06-1.14.61 1.54.23 2.68.11 2.97.72.78 1.16 1.77 1.16 2.99 0 4.28-2.6 5.21-5.08 5.49.4.35.75 1.02.75 2.05v3.03c0 .3.2.65.77.54A11.1 11.1 0 0 0 12 .9Z"/></svg>;
  if (provider === 'linkedin_oidc') return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#0A66C2" d="M20.45 2H3.55C2.69 2 2 2.68 2 3.53v16.94c0 .85.69 1.53 1.55 1.53h16.9c.86 0 1.55-.68 1.55-1.53V3.53c0-.85-.69-1.53-1.55-1.53ZM7.94 18.34H4.97V9.02h2.97v9.32ZM6.45 7.75a1.72 1.72 0 1 1 0-3.44 1.72 1.72 0 0 1 0 3.44Zm12.13 10.59h-2.96v-4.53c0-1.08-.02-2.47-1.5-2.47-1.5 0-1.73 1.17-1.73 2.39v4.61H9.43V9.02h2.84v1.27h.04c.4-.73 1.37-1.5 2.82-1.5 3.02 0 3.57 1.98 3.57 4.55v5Z"/></svg>;
  return null;
}

const providers: { id: SocialProvider; name: string }[] = [
  { id: 'google', name: 'Google' },
  { id: 'github', name: 'GitHub' },
  { id: 'linkedin_oidc', name: 'LinkedIn' },
];

export function SocialAuthButtons({ busy = false, onSelect }: Props) {
  return <div className="auth-providers" aria-label="Continue with a social account">
    {providers.map(provider => <button key={provider.id} type="button" disabled={busy} onClick={() => onSelect(provider.id)}>
      <ProviderMark provider={provider.id}/><span>{provider.name}</span>
    </button>)}
  </div>;
}
