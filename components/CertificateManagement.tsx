'use client';

import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Award, Download, ExternalLink, FileCheck2, Printer, ShieldCheck } from 'lucide-react';
import { projectApi } from '@/lib/project-api-client';

type CertificateType =
  | 'project_learning'
  | 'skill_demonstration'
  | 'company_project_completion'
  | 'learning_pathway_completion'
  | 'legacy_unverified';

type CertificateRecord = {
  id: string;
  certificate_code: string | null;
  certificate_type: CertificateType;
  certificate_status: 'issued' | 'revoked';
  recipient_name: string | null;
  project_title: string | null;
  project_description: string | null;
  pathway_name: string | null;
  skills: string[];
  issuer_name: string | null;
  signatory_name: string | null;
  signatory_title: string | null;
  issued_at: string;
  revoked_at?: string | null;
  revocation_reason?: string | null;
};

type Student = { id: string; full_name: string | null; role: string };
type Project = { id: string; title: string; category?: string; project_source?: string };
type Signatory = { signatory_name: string; signatory_title: string };

const certificateTitles: Record<CertificateType, string> = {
  project_learning: 'Certificate of Project Learning',
  skill_demonstration: 'Certificate of Skill Demonstration',
  company_project_completion: 'Company-Authorized Project Completion Certificate',
  learning_pathway_completion: 'Learning Pathway Completion Certificate',
  legacy_unverified: 'Legacy credential — not verified',
};

function issueDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'long', day: 'numeric' }).format(date);
}

export function CompanyCertificateAuthorization({
  verified,
  signatory,
  onSaved,
}: {
  verified: boolean;
  signatory: Signatory | null;
  onSaved: () => void;
}) {
  const signatoryName = signatory?.signatory_name || '';
  const signatoryTitle = signatory?.signatory_title || '';
  const [name, setName] = useState(signatoryName);
  const [title, setTitle] = useState(signatoryTitle);
  const [authorized, setAuthorized] = useState(Boolean(signatory));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const hasSignatory = Boolean(signatory);

  useEffect(() => {
    setName(signatoryName);
    setTitle(signatoryTitle);
    setAuthorized(hasSignatory);
  }, [hasSignatory, signatoryName, signatoryTitle]);

  async function saveAuthorization() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await projectApi('/api/backend', {
        method: 'POST',
        body: {
          action: 'authorize_certificate_issuer',
          authorized,
          signatoryName: name,
          signatoryTitle: title,
        },
      });
      setMessage(authorized
        ? 'Certificate issuer authorization saved.'
        : 'Certificate issuer authorization removed.');
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Issuer authorization could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="certificate-authorization">
      <h3>Company completion certificates</h3>
      <p className="muted">
        A company is shown as certificate issuer only after a verified owner explicitly authorizes a named signatory.
        No signature image or organization logo is added unless one is separately provided and authorized.
      </p>
      {!verified ? <p className="project-warning">Your organization must be verified before it can authorize certificate issuance.</p> : <>
        <div className="certificate-signatory-grid">
          <label>Authorized signatory name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} /></label>
          <label>Designation<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} /></label>
        </div>
        <label className="certificate-authorize-check">
          <input type="checkbox" checked={authorized} onChange={(event) => setAuthorized(event.target.checked)} />
          <span>I authorize this named signatory and organization to appear on completion certificates for this company’s approved projects.</span>
        </label>
        <button className="outline" type="button" disabled={busy || (!authorized && !hasSignatory) || (authorized && (!name.trim() || !title.trim()))} onClick={() => void saveAuthorization()}>
          {busy ? 'Saving…' : authorized ? 'Save issuer authorization' : 'Remove issuer authorization'}
        </button>
      </>}
      {error && <p className="project-error" role="alert">{error}</p>}
      {message && <p className="notice" role="status">{message}</p>}
    </section>
  );
}

export function CertificateAdministration({
  students,
  projects,
  certificates,
  onRefresh,
}: {
  students: Student[];
  projects: Project[];
  certificates: CertificateRecord[];
  onRefresh: () => void;
}) {
  const [studentId, setStudentId] = useState('');
  const [certificateType, setCertificateType] = useState<Exclude<CertificateType, 'company_project_completion'>>('project_learning');
  const [projectId, setProjectId] = useState('');
  const [skills, setSkills] = useState('');
  const [pathwayName, setPathwayName] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const studentOptions = students.filter((student) => student.role === 'student');
  const projectOptions = projects.filter((project) => project.project_source !== 'legacy');

  async function issueCertificate(event: React.FormEvent) {
    event.preventDefault();
    if (!confirmed) {
      setError('Confirm that you reviewed the recorded completion evidence before issuing this credential.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const certificate = await projectApi<CertificateRecord>('/api/certificates', {
        method: 'POST',
        body: {
          studentUserId: studentId,
          certificateType,
          ...(certificateType === 'learning_pathway_completion'
            ? { pathwayName }
            : {
              projectId,
              ...(certificateType === 'skill_demonstration'
                ? { skills: skills.split(',').map((skill) => skill.trim()).filter(Boolean) }
                : {}),
            }),
        },
      });
      setMessage(`Certificate ${certificate.certificate_code} issued.`);
      setConfirmed(false);
      setSkills('');
      setPathwayName('');
      onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Certificate could not be issued.');
    } finally {
      setBusy(false);
    }
  }

  async function revokeCertificate(certificate: CertificateRecord) {
    const reason = window.prompt(`Why is ${certificate.certificate_code} being revoked?`);
    if (reason === null) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await projectApi(`/api/certificates/${certificate.id}`, {
        method: 'PATCH',
        body: { action: 'revoke', reason },
      });
      setMessage(`${certificate.certificate_code} has been revoked.`);
      onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Certificate could not be revoked.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="certificate-admin">
      <section className="panel form-panel">
        <div className="section-title"><div><h2>Issue a BuildBridge credential</h2><p className="muted">Every platform credential requires an administrator’s evidence review. Company completion certificates are issued separately after verified-company authorization and approval of every milestone.</p></div></div>
        <form className="certificate-admin-form" onSubmit={(event) => void issueCertificate(event)}>
          <label>Student<select required value={studentId} onChange={(event) => setStudentId(event.target.value)}><option value="">Select a student</option>{studentOptions.map((student) => <option key={student.id} value={student.id}>{student.full_name || 'Name not provided'} · {student.id.slice(0, 8)}</option>)}</select></label>
          <label>Certificate type<select value={certificateType} onChange={(event) => setCertificateType(event.target.value as Exclude<CertificateType, 'company_project_completion'>)}><option value="project_learning">BuildBridge Certificate of Project Learning</option><option value="skill_demonstration">BuildBridge Certificate of Skill Demonstration</option><option value="learning_pathway_completion">Learning Pathway Completion Certificate</option></select></label>
          {certificateType === 'learning_pathway_completion'
            ? <label>Saved pathway / career goal<input required maxLength={120} value={pathwayName} onChange={(event) => setPathwayName(event.target.value)} placeholder="Must match the student’s saved roadmap"/></label>
            : <>
              <label>Completed project<select required value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">Select a project</option>{projectOptions.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label>
              {certificateType === 'skill_demonstration' && <label>Evidence-backed skills, comma-separated<input required value={skills} onChange={(event) => setSkills(event.target.value)} placeholder="Only skills linked to this project and demonstrated in records"/></label>}
            </>}
          <label className="certificate-authorize-check"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>I reviewed the student’s recorded evidence and confirm it meets the criteria for this certificate type.</span></label>
          <button className="primary" type="submit" disabled={busy || !studentId || !confirmed}>{busy ? 'Saving…' : 'Issue certificate'}</button>
        </form>
        {error && <p className="project-error" role="alert">{error}</p>}
        {message && <p className="notice" role="status">{message}</p>}
      </section>

      <section className="panel">
        <div className="section-title"><div><h2>Certificate register</h2><p className="muted">Revocation updates public verification immediately.</p></div><button className="outline" onClick={onRefresh}>Refresh</button></div>
        {!certificates.length ? <div className="empty-state"><Award size={36}/><h3>No certificate records</h3><p>Authorized certificate records will appear here.</p></div>
          : <div className="certificate-register">{certificates.map((certificate) => <article className="certificate-register-row" key={certificate.id}>
            <div><b>{certificate.recipient_name || 'Name not available'} · {certificateTitles[certificate.certificate_type] || 'BuildBridge Certificate'}</b><small>{certificate.project_title || certificate.pathway_name || 'Learning credential'} · {certificate.issuer_name} · {certificate.certificate_code || 'No verification ID'}</small></div>
            <div className="certificate-register-actions"><span className={`pill ${certificate.certificate_status === 'issued' ? 'green' : 'orange'}`}>{certificate.certificate_status}</span>{certificate.certificate_status === 'issued' && <button className="outline" disabled={busy} onClick={() => void revokeCertificate(certificate)}>Revoke</button>}</div>
          </article>)}</div>}
      </section>
    </div>
  );
}

export function CertificateVault({ certificates }: { certificates: CertificateRecord[] }) {
  const [selectedId, setSelectedId] = useState('');
  const [certificate, setCertificate] = useState<CertificateRecord | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const selectedRecord = useMemo(() => certificates.find((item) => item.id === selectedId), [certificates, selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setCertificate(null);
      return;
    }
    let active = true;
    setLoading(true);
    setError('');
    projectApi<CertificateRecord>(`/api/certificates/${selectedId}`)
      .then((result) => { if (active) setCertificate(result); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Certificate could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selectedId]);

  const verifyUrl = certificate?.certificate_code
    ? `${typeof window === 'undefined' ? '' : window.location.origin}/verify/${encodeURIComponent(certificate.certificate_code)}`
    : '';

  useEffect(() => {
    let active = true;
    setQrDataUrl('');
    if (!verifyUrl) return () => { active = false; };
    QRCode.toDataURL(verifyUrl, { width: 180, margin: 1, errorCorrectionLevel: 'Q' })
      .then((dataUrl) => { if (active) setQrDataUrl(dataUrl); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Verification QR code could not be generated.'); });
    return () => { active = false; };
  }, [verifyUrl]);

  return (
    <section className="certificate-vault">
      <div className="certificate-vault-intro"><div><h2>Achievement vault</h2><p className="muted">Issued credentials are backed by recorded evidence and the required company or platform approval.</p></div><ShieldCheck size={26}/></div>
      {!certificates.length
        ? <div className="empty-state"><Award size={42}/><h3>No certificates issued yet</h3><p>Company completion certificates require approval of every project milestone and an authorized company signatory. BuildBridge credentials require an administrator’s evidence review.</p></div>
        : <div className="certificate-vault-layout">
          <aside className="certificate-list" aria-label="Issued certificates">
            {certificates.map((item) => <article className={`certificate-list-item ${item.id === selectedId ? 'selected' : ''}`} key={item.id}>
              <div><b>{certificateTitles[item.certificate_type] || 'BuildBridge Certificate'}</b><small>{item.project_title || item.pathway_name || 'Learning credential'}</small><small>{item.certificate_code || 'No verification ID'} · {issueDate(item.issued_at)}</small></div>
              <span className={`pill ${item.certificate_status === 'issued' ? 'green' : 'orange'}`}>{item.certificate_status}</span>
              <button className="outline" onClick={() => setSelectedId(item.id)}>{item.id === selectedId ? 'Selected' : 'View certificate'}</button>
            </article>)}
          </aside>
          {selectedRecord && <div className="certificate-preview-panel">
            <div className="certificate-preview-status"><div><b>{certificateTitles[selectedRecord.certificate_type] || 'BuildBridge Certificate'}</b><span className={`pill ${selectedRecord.certificate_status === 'issued' ? 'green' : 'orange'}`}>{selectedRecord.certificate_status}</span></div>
              <div className="certificate-action-buttons">
                <button className="outline" disabled={!certificate || certificate.certificate_status !== 'issued'} onClick={() => window.print()}><Download size={15}/>Download PDF</button>
                <button className="outline" disabled={!certificate || certificate.certificate_status !== 'issued'} onClick={() => window.print()}><Printer size={15}/>Print</button>
              </div>
            </div>
            {selectedRecord.certificate_status === 'revoked' && <p className="certificate-revoked-notice" role="status">This certificate is revoked and cannot be downloaded as an issued credential. {selectedRecord.revocation_reason || ''}</p>}
            {loading ? <div className="project-skeletons" role="status" aria-label="Loading certificate"><i/><i/></div>
              : error ? <div className="project-error" role="alert">{error}</div>
                : certificate && certificate.certificate_status === 'issued' && <>
                  <p className="certificate-pdf-hint">The PDF is generated through your browser’s vector print engine. Choose “Save as PDF” in the print dialog.</p>
                  <article className="certificate-sheet" id="certificate-print-root">
                    <div className="certificate-frame">
                      <header className="certificate-header">
                        <img className="certificate-logo" src="/buildbridge-logo.png" alt="BuildBridge" />
                        <div><b>{certificate.issuer_name}</b><small>Learning &amp; Project Credentials</small></div>
                      </header>
                      <div className="certificate-gold-divider" />
                      <p className="certificate-overline">{certificate.certificate_type === 'company_project_completion' ? 'COMPANY-AUTHORIZED ACHIEVEMENT' : 'CERTIFICATE OF ACHIEVEMENT'}</p>
                      <h1>{certificateTitles[certificate.certificate_type] || 'BuildBridge Certificate'}</h1>
                      <p className="certificate-intro">{certificate.certificate_type === 'company_project_completion'
                        ? 'This certifies that'
                        : 'Presented to'}</p>
                      <p className="certificate-recipient">{certificate.recipient_name || 'Name not available'}</p>
                      <p className="certificate-recognition">{certificate.certificate_type === 'company_project_completion'
                        ? 'has completed the approved project and its required milestones.'
                        : certificate.certificate_type === 'learning_pathway_completion'
                          ? 'has completed the recorded learning pathway.'
                          : certificate.certificate_type === 'skill_demonstration'
                            ? 'has demonstrated the skills listed below through recorded project evidence.'
                            : 'has completed the project learning experience described below.'}</p>
                      <div className="certificate-project-block">
                        <span>{certificate.certificate_type === 'learning_pathway_completion' ? 'LEARNING PATHWAY' : 'PROJECT'}</span>
                        <h2>{certificate.pathway_name || certificate.project_title || 'Project title unavailable'}</h2>
                        {certificate.project_description && <p>{certificate.project_description}</p>}
                      </div>
                      {certificate.skills?.length > 0 && <div className="certificate-skills-block"><small>DEMONSTRATED SKILLS</small><div className="certificate-skills">{certificate.skills.map((skill) => <span key={skill}>{skill}</span>)}</div></div>}
                      <footer className="certificate-footer">
                        <div className="certificate-signature">
                          <span className="certificate-signature-line"/>
                          {certificate.signatory_name && <b>{certificate.signatory_name}</b>}
                          {certificate.signatory_title && <small>{certificate.signatory_title}</small>}
                          {!certificate.signatory_name && <small>{certificate.issuer_name}</small>}
                        </div>
                        <div className="certificate-issue-meta">
                          <b>Issued {issueDate(certificate.issued_at)}</b>
                          <small>Certificate ID · {certificate.certificate_code || 'Unavailable'}</small>
                          <a href={verifyUrl} target="_blank" rel="noopener noreferrer">{verifyUrl}</a>
                        </div>
                        <div className="certificate-qr-block">
                          {qrDataUrl ? <img src={qrDataUrl} alt="Scan to verify this certificate" /> : <span aria-label="QR code loading"/>}
                          <small>Verify credential</small>
                        </div>
                      </footer>
                    </div>
                  </article>
                  {certificate.certificate_status === 'issued' && <a className="certificate-verification-link" href={verifyUrl} target="_blank" rel="noopener noreferrer"><FileCheck2 size={16}/>Open public verification page <ExternalLink size={14}/></a>}
                </>}
          </div>}
        </div>}
    </section>
  );
}
