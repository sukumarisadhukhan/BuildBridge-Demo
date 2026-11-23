'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function EmailUnsubscribedPage() {
  const [token, setToken] = useState('');
  const [complete, setComplete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setToken(new URLSearchParams(window.location.search).get('token') || ''); }, []);

  async function unsubscribe() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/email/unsubscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unsubscribe failed.');
      setComplete(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unsubscribe failed.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth-page"><section className="auth-panel auth-form-panel"><p className="eyebrow">EMAIL PREFERENCES</p><h1>{complete?'You are unsubscribed':'Confirm unsubscribe'}</h1><p className="muted">{complete?'BuildBridge email notifications have been turned off. In-app notifications remain available in your workspace.':'Confirm that you want to stop receiving BuildBridge notification emails.'}</p>{!complete&&<button className="primary" disabled={!token||busy} onClick={()=>void unsubscribe()}>{busy?'Updating…':'Unsubscribe from email notifications'}</button>}{error&&<p className="auth-message error" role="alert">{error}</p>}<p className="auth-switch"><Link href="/auth/sign-in">Return to BuildBridge</Link></p></section></main>;
}
