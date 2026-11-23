'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BadgeCheck, Search, ShieldCheck } from 'lucide-react';

type VerificationRecord = {
  certificate_code: string;
  certificate_type: string;
  recipient_name: string | null;
  project_title: string | null;
  project_description: string | null;
  pathway_name: string | null;
  skills: string[];
  issuer_name: string;
  signatory_name: string | null;
  signatory_title: string | null;
  issued_at: string;
  certificate_status: 'issued' | 'revoked';
  score?: number | null;
};

const typeNames: Record<string, string> = {
  project_learning: 'BuildBridge Certificate of Project Learning',
  skill_demonstration: 'BuildBridge Certificate of Skill Demonstration',
  company_project_completion: 'Company-Authorized Project Completion Certificate',
  learning_pathway_completion: 'Learning Pathway Completion Certificate',
  theory_learning_completion: 'Theory Learning Certificate',
  legacy_unverified: 'Legacy credential — not verified',
};

export function CertificateVerification({ certificateCode = '' }: { certificateCode?: string }) {
  const router = useRouter();
  const [code, setCode] = useState(certificateCode);
  const [record, setRecord] = useState<VerificationRecord | null>(null);
  const [loading, setLoading] = useState(Boolean(certificateCode));
  const [error, setError] = useState('');

  useEffect(() => {
    setCode(certificateCode);
    if (!certificateCode) {
      setLoading(false);
      setRecord(null);
      setError('');
      return;
    }
    let active = true;
    setLoading(true);
    setRecord(null);
    setError('');
    fetch(`/api/certificates/verify/${encodeURIComponent(certificateCode)}`, { cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json() as { data?: VerificationRecord; error?: string };
        if (!response.ok) throw new Error(result.error || 'Certificate could not be verified.');
        return result.data;
      })
      .then((data) => {
        if (!data) throw new Error('No certificate matches this ID.');
        if (active) setRecord(data);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Certificate could not be verified.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [certificateCode]);

  function verify(event: React.FormEvent) {
    event.preventDefault();
    const normalized = code.trim().toUpperCase();
    if (!/^(BB|BBT)-[A-F0-9]{16}$/.test(normalized)) {
      setError('Enter a BuildBridge certificate ID beginning with BB- or BBT-, followed by 16 letters or numbers.');
      return;
    }
    router.push(`/verify/${encodeURIComponent(normalized)}`);
  }

  const issuedDate = record ? new Date(record.issued_at) : null;

  return (
    <main className="certificate-verification-page">
      <section className="certificate-verification-card">
        <div className="certificate-verification-brand"><img src="/buildbridge-logo.png" alt="BuildBridge" /><span>Credential verification</span></div>
        <h1>Verify a certificate</h1>
        <p>Enter the certificate ID or open this page by scanning the QR code printed on a BuildBridge credential.</p>
        <form className="certificate-verify-form" onSubmit={verify}>
          <label htmlFor="certificate-id">Certificate ID</label>
          <div><input id="certificate-id" value={code} onChange={(event) => setCode(event.target.value)} placeholder="BB-0123456789ABCDEF" autoComplete="off"/><button className="primary" type="submit"><Search size={16}/>Verify</button></div>
        </form>
        {loading && <p className="certificate-verification-state" role="status">Checking the certificate record…</p>}
        {error && <p className="certificate-verification-error" role="alert">{error}</p>}
        {record && <article className={`certificate-verification-result ${record.certificate_status === 'issued' ? 'verified' : 'revoked'}`}>
          <div className="certificate-verification-status"><span>{record.certificate_status === 'issued' ? <BadgeCheck size={23}/> : <ShieldCheck size={23}/>}</span><div><b>{record.certificate_status === 'issued' ? 'Certificate is valid' : 'Certificate is revoked'}</b><small>{typeNames[record.certificate_type] || 'BuildBridge Certificate'}</small></div></div>
          <dl>
            <div><dt>Certificate holder</dt><dd>{record.recipient_name || 'Not recorded'}</dd></div>
            <div><dt>Project / pathway</dt><dd>{record.pathway_name || record.project_title || 'Not recorded'}</dd></div>
            {record.skills?.length > 0 && <div><dt>Evidence-backed skills</dt><dd>{record.skills.join(', ')}</dd></div>}
            {record.score !== undefined && record.score !== null && <div><dt>Theory knowledge-check score</dt><dd>{Number(record.score).toFixed(0)}%</dd></div>}
            <div><dt>Issuing organization</dt><dd>{record.issuer_name}</dd></div>
            {record.signatory_name && <div><dt>Authorized signatory</dt><dd>{record.signatory_name}{record.signatory_title ? ` · ${record.signatory_title}` : ''}</dd></div>}
            <div><dt>Issue date</dt><dd>{issuedDate && !Number.isNaN(issuedDate.getTime()) ? issuedDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : 'Not recorded'}</dd></div>
            <div><dt>Certificate ID</dt><dd>{record.certificate_code}</dd></div>
            <div><dt>Status</dt><dd>{record.certificate_status}</dd></div>
          </dl>
        </article>}
        <small className="certificate-verification-privacy">Verification shows only the information printed on the certificate. It does not expose the holder’s email, account ID, or private evidence files.</small>
      </section>
    </main>
  );
}
