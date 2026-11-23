import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { createUnsubscribeToken } from '@/lib/email-unsubscribe';

export const runtime = 'nodejs';
export const maxDuration = 60;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    || request.headers.get('x-cron-secret');
  if (!secret || !supplied) return false;
  const expected = Buffer.from(secret);
  const actual = Buffer.from(supplied);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] as string));
}

async function processNotifications(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Invalid cron authorization.' }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Email delivery requires SUPABASE_SERVICE_ROLE_KEY.' }, { status: 503 });
  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const baseUrl = process.env.APP_BASE_URL;
  if (!resendKey || !from || !baseUrl) return NextResponse.json({ error: 'Email delivery requires RESEND_API_KEY, EMAIL_FROM and APP_BASE_URL.' }, { status: 503 });

  let remindersQueued = 0;
  try {
    const { data: assignments, error: assignmentError } = await admin.from('project_assignments')
      .select('id,student_user_id,status,project:projects!project_assignments_project_id_fkey(title,deadline)')
      .in('status', ['active', 'submitted', 'revision_requested'])
      .not('project.deadline', 'is', null)
      .limit(1000);
    if (assignmentError) return NextResponse.json({ error: `Deadline assignments could not be loaded: ${assignmentError.message}` }, { status: 500 });

    const today = new Date();
    const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    for (const assignment of assignments || []) {
      const project = Array.isArray(assignment.project) ? assignment.project[0] : assignment.project;
      if (!project?.deadline) continue;
      const dueUtc = Date.parse(`${project.deadline}T00:00:00Z`);
      if (!Number.isFinite(dueUtc)) continue;
      const days = Math.round((dueUtc - todayUtc) / 86400000);
      if (days !== 1 && days !== 7) continue;
      const { error: notifyError } = await admin.rpc('notify_buildbridge_user', {
        target_user_id: assignment.student_user_id,
        event_kind: 'deadline_reminder',
        event_title: `${days}-day project deadline reminder`,
        event_body: `"${project.title}" is due on ${project.deadline}.`,
        event_payload: { assignmentId: assignment.id, title: project.title, deadline: project.deadline, daysRemaining: days },
        event_dedupe_key: `deadline:${assignment.id}:${days}`,
      });
      if (notifyError) throw new Error(`Could not queue deadline reminder: ${notifyError.message}`);
      const { error: logError } = await admin.from('deadline_reminder_log').insert({
        assignment_id: assignment.id, days_before_deadline: days,
      });
      if (logError?.code === '23505') continue;
      if (logError) throw new Error(`Could not record deadline reminder: ${logError.message}`);
      remindersQueued += 1;
    }

    const { data: pending, error: pendingError } = await admin.from('email_outbox')
      .select('id,user_id,recipient_email,event_type,subject,payload,attempts')
      .in('status', ['pending', 'failed']).lte('next_attempt_at', new Date().toISOString())
      .order('created_at', { ascending: true }).limit(50);
    if (pendingError) return NextResponse.json({ error: `Email queue could not be loaded: ${pendingError.message}` }, { status: 500 });

    let sent = 0;
    let failed = 0;
    for (const item of pending || []) {
      const { data: claimed, error: claimError } = await admin.from('email_outbox')
        .update({ status: 'sending', attempts: item.attempts + 1 })
        .eq('id', item.id).in('status', ['pending', 'failed']).select('id').maybeSingle();
      if (claimError) throw new Error(`Could not claim email ${item.id}: ${claimError.message}`);
      if (!claimed) continue;

      try {
        const { data: preferences, error: preferenceError } = await admin.from('notification_preferences')
          .select('email_enabled,project_updates,deadline_reminders,opportunity_updates,learning_updates')
          .eq('user_id', item.user_id).maybeSingle();
        if (preferenceError) throw new Error(`Email preferences could not be checked: ${preferenceError.message}`);
        const categoryEnabled = item.event_type === 'deadline_reminder' ? preferences?.deadline_reminders !== false
          : item.event_type === 'opportunity_update' ? preferences?.opportunity_updates !== false
          : item.event_type === 'learning_update' ? preferences?.learning_updates !== false
          : preferences?.project_updates !== false;
        if (preferences?.email_enabled === false || !categoryEnabled) {
          const { error: suppressError } = await admin.from('email_outbox').update({ status: 'suppressed', last_error: 'Email disabled by the user.' }).eq('id', item.id);
          if (suppressError) throw new Error(`Suppressed email state could not be saved: ${suppressError.message}`);
          continue;
        }
        const unsubscribeToken = createUnsubscribeToken(item.user_id, Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30);
        const unsubscribeUrl = `${baseUrl.replace(/\/$/, '')}/api/email/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;
        const body = escapeHtml(String(item.payload?.body || 'There is a new update in your BuildBridge workspace.'));
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': item.id },
          body: JSON.stringify({
            from: process.env.EMAIL_FROM_NAME ? `${process.env.EMAIL_FROM_NAME} <${from}>` : from,
            to: [item.recipient_email],
            subject: item.subject,
            html: `<div style="font-family:Arial,sans-serif;color:#111936"><h2>BuildBridge update</h2><p>${body}</p><p><a href="${baseUrl.replace(/\/$/, '')}/workspace">Open your workspace</a></p><hr/><p style="font-size:12px;color:#68718a">You received this because email notifications are enabled. <a href="${unsubscribeUrl}">Unsubscribe</a></p></div>`,
            text: `BuildBridge update\n\n${String(item.payload?.body || 'There is a new update in your BuildBridge workspace.')}\n\nWorkspace: ${baseUrl.replace(/\/$/, '')}/workspace\nUnsubscribe: ${unsubscribeUrl}`,
          }),
        });
        const responseBody = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(String(responseBody?.message || responseBody?.error || `Resend returned ${response.status}`));
        const { error: updateError } = await admin.from('email_outbox').update({ status: 'sent', sent_at: new Date().toISOString(), last_error: null }).eq('id', item.id);
        if (updateError) throw new Error(`Email sent but delivery state could not be saved: ${updateError.message}`);
        const { error: logError } = await admin.from('email_delivery_logs').insert({ outbox_id: item.id, provider: 'resend', status: 'sent', provider_message_id: responseBody?.id || null });
        if (logError) throw new Error(`Email sent but delivery log could not be saved: ${logError.message}`);
        sent += 1;
      } catch (cause) {
        const reason = cause instanceof Error ? cause.message : 'Email provider request failed.';
        const attempt = item.attempts + 1;
        const retryAt = new Date(Date.now() + Math.min(60, 2 ** attempt) * 60000).toISOString();
        const { error: updateError } = await admin.from('email_outbox').update({
          status: attempt >= 8 ? 'exhausted' : 'failed',
          last_error: reason.slice(0, 1000),
          next_attempt_at: retryAt,
        }).eq('id', item.id);
        if (updateError) throw new Error(`Email failed and its retry state could not be saved: ${updateError.message}`);
        const { error: logError } = await admin.from('email_delivery_logs').insert({ outbox_id: item.id, provider: 'resend', status: 'failed', detail: reason.slice(0, 1000) });
        if (logError) throw new Error(`Email failed and its delivery log could not be saved: ${logError.message}`);
        failed += 1;
      }
    }

    return NextResponse.json({ remindersQueued, sent, failed });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Notification processing failed.' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return processNotifications(request);
}

export async function POST(request: Request) {
  return processNotifications(request);
}
