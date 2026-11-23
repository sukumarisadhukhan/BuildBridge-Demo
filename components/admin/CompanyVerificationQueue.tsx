
'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  RefreshCw,
  ShieldCheck,
  Building2,
  CheckCircle2,
  Clock,
  XCircle,
} from 'lucide-react';

type ProfileSummary = {
  email: string | null;
  full_name: string | null;
};

type ProfileRelation = ProfileSummary | ProfileSummary[] | null;

type CompanyRequest = {
  id: string;
  user_id: string;
  organization_name: string;
  organization_email: string;
  email_domain: string;
  official_website: string | null;
  organization_type: string | null;
  description: string | null;
  country_of_registration: string | null;
  business_registration: string | null;
  authorized_representative_name: string | null;
  authorized_representative_title: string | null;
  authorized_representative_phone: string | null;
  status: string;
  email_verified_at: string | null;
  dns_verified_at: string | null;
  created_at: string;
  review_note: string | null;
  requester: ProfileRelation;
  reviewer: ProfileRelation;
};

function getProfile(
  relation: ProfileRelation
): ProfileSummary | null {
  if (!relation) return null;
  return Array.isArray(relation) ? relation[0] ?? null : relation;
}

function getStatusLabel(status: string) {
  const labels: Record<string, string> = {
    domain_pending: 'DNS verification pending',
    pending_dns: 'DNS verification pending',
    pending_admin: 'Awaiting administrator review',
    pending_admin_review: 'Ready for administrator review',
    approved: 'Approved',
    rejected: 'Rejected',
    additional_information_required: 'Additional information required',
    email_pending: 'Email verification pending',
    submitted: 'Submitted',
  };

  return labels[status] ?? status.replaceAll('_', ' ');
}

export default function CompanyVerificationQueue() {
  const [requests, setRequests] = useState<CompanyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadRequests = useCallback(async () => {
    setError('');

    try {
      const response = await fetch('/api/company-domain', {
        method: 'GET',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload.error || 'Unable to load company verification requests.'
        );
      }

      setRequests(payload.requests ?? []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Company verification requests could not be loaded.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const reviewRequest = async (
    request: CompanyRequest,
    decision: 'approved' | 'rejected' | 'additional_information_required'
  ) => {
    if (decision === 'approved' &&
        (!request.email_verified_at || !request.dns_verified_at)) {
      setError('Both organization email and DNS must be verified first.');
      return;
    }

    const note = notes[request.id] ?? '';

    if (
      decision === 'rejected' &&
      !note.trim()
    ) {
      setError('Provide a rejection reason before rejecting a request.');
      return;
    }

    setBusyId(request.id);
    setError('');
    setMessage('');

    try {
      const response = await fetch('/api/company-domain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'review',
          requestId: request.id,
          decision,
          note,
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload.error || 'The verification decision could not be saved.'
        );
      }

      setMessage(
        decision === 'approved'
          ? `${request.organization_name} approved successfully.`
          : decision === 'rejected'
            ? `${request.organization_name} rejected.`
            : 'Additional information requested.'
      );

      await loadRequests();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to process the verification request.'
      );
    } finally {
      setBusyId(null);
    }
  };

  const refresh = () => {
    setRefreshing(true);
    void loadRequests();
  };

  const pending = requests.filter(
    (r) => !['approved', 'rejected'].includes(r.status)
  );

  const readyForReview = pending.filter(
    (r) => Boolean(r.email_verified_at && r.dns_verified_at)
  );

  if (loading) {
    return (
      <section className="rounded-2xl border bg-white p-8">
        Loading company verification requests...
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border bg-white p-5">
          <p className="text-sm text-slate-500">Total requests</p>
          <p className="mt-2 text-3xl font-bold">{requests.length}</p>
        </div>

        <div className="rounded-2xl border bg-white p-5">
          <p className="text-sm text-slate-500">Pending verification</p>
          <p className="mt-2 text-3xl font-bold">{pending.length}</p>
        </div>

        <div className="rounded-2xl border bg-white p-5">
          <p className="text-sm text-slate-500">Ready for review</p>
          <p className="mt-2 text-3xl font-bold">{readyForReview.length}</p>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              Company verification queue
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Review registered organizations and their domain ownership.
            </p>
          </div>

          <button
            onClick={refresh}
            disabled={refreshing}
            className="flex items-center gap-2 rounded-lg border px-4 py-2 font-medium hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={16} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {message && (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            {message}
          </div>
        )}

        {requests.length === 0 ? (
          <div className="py-12 text-center">
            <Building2 className="mx-auto mb-4 text-slate-400" size={42} />
            <h3 className="text-lg font-semibold">
              No company verification requests
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              Organization requests will appear here after representatives
              complete and submit their company verification forms.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {requests.map((request) => {
              const requester = getProfile(request.requester);
              const verified =
                Boolean(request.email_verified_at && request.dns_verified_at);
              const closed = ['approved', 'rejected'].includes(request.status);
              const busy = busyId === request.id;

              return (
                <article
                  key={request.id}
                  className="rounded-xl border p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-bold">
                        {request.organization_name}
                      </h3>

                      <p className="mt-1 text-sm text-slate-600">
                        {requester?.full_name || 'Representative'}
                        {' · '}
                        {requester?.email || request.organization_email}
                      </p>

                      <p className="text-sm text-slate-500">
                        {request.email_domain}
                      </p>
                    </div>

                    <span className="rounded-full bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
                      {getStatusLabel(request.status)}
                    </span>
                  </div>

                  <div className="mt-5 grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
                    <div>
                      <p className="text-slate-500">Organization email</p>
                      <p className="font-medium">
                        {request.organization_email}
                      </p>
                    </div>

                    <div>
                      <p className="text-slate-500">Official website</p>
                      {request.official_website ? (
                        <a
                          href={request.official_website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="break-all text-emerald-700 underline"
                        >
                          {request.official_website}
                        </a>
                      ) : (
                        <p>Not provided</p>
                      )}
                    </div>

                    <div>
                      <p className="text-slate-500">Representative</p>
                      <p className="font-medium">
                        {request.authorized_representative_name || 'Not provided'}
                      </p>
                      <p>{request.authorized_representative_title}</p>
                    </div>

                    <div>
                      <p className="text-slate-500">Organization type</p>
                      <p className="font-medium">
                        {request.organization_type || 'Not provided'}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-4 text-sm">
                    <span className="flex items-center gap-2">
                      {request.email_verified_at
                        ? <CheckCircle2 className="text-emerald-600" size={17} />
                        : <Clock className="text-amber-600" size={17} />}
                      Organization email
                      {request.email_verified_at ? ' verified' : ' pending'}
                    </span>

                    <span className="flex items-center gap-2">
                      {request.dns_verified_at
                        ? <CheckCircle2 className="text-emerald-600" size={17} />
                        : <Clock className="text-amber-600" size={17} />}
                      DNS
                      {request.dns_verified_at ? ' verified' : ' pending'}
                    </span>
                  </div>

                  {request.description && (
                    <p className="mt-4 whitespace-pre-wrap text-sm text-slate-600">
                      {request.description}
                    </p>
                  )}

                  {request.review_note && (
                    <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
                      <strong>Previous review:</strong> {request.review_note}
                    </p>
                  )}

                  {!closed && (
                    <div className="mt-5 space-y-3 border-t pt-4">
                      <label className="block text-sm font-medium">
                        Administrator review note
                        <textarea
                          value={notes[request.id] ?? ''}
                          onChange={(e) =>
                            setNotes((old) => ({
                              ...old,
                              [request.id]: e.target.value,
                            }))
                          }
                          maxLength={1000}
                          rows={2}
                          placeholder="Enter feedback or rejection reason..."
                          className="mt-2 w-full rounded-lg border p-3"
                        />
                      </label>

                      <div className="flex flex-wrap gap-2">
                        <button
                          disabled={!verified || busy}
                          onClick={() =>
                            void reviewRequest(request, 'approved')
                          }
                          className="flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <ShieldCheck size={16} />
                          {busy ? 'Saving...' : 'Approve company'}
                        </button>

                        <button
                          disabled={busy}
                          onClick={() =>
                            void reviewRequest(request, 'additional_information_required')
                          }
                          className="rounded-lg border px-4 py-2 font-semibold disabled:opacity-50"
                        >
                          Request information
                        </button>

                        <button
                          disabled={busy}
                          onClick={() =>
                            void reviewRequest(request, 'rejected')
                          }
                          className="flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 font-semibold text-red-700 disabled:opacity-50"
                        >
                          <XCircle size={16} />
                          Reject
                        </button>
                      </div>

                      {!verified && (
                        <p className="text-sm text-amber-700">
                          Approval is disabled until both organization email
                          and DNS ownership have been verified.
                        </p>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
