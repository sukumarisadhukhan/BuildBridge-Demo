'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Check, X } from 'lucide-react';

type NotificationItem = { id: string; kind: string; title: string; body: string; payload?: Record<string, unknown> | null; read_at: string | null; created_at: string };

async function loadNotifications() {
  const response = await fetch('/api/notifications', { cache: 'no-store' });
  const result = await response.json().catch(() => ({ error: 'Notifications returned an unreadable response.' }));
  if (!response.ok) throw new Error(result.error || `Notifications failed (${response.status}).`);
  return result.notifications as NotificationItem[];
}

function notificationDestination(item: NotificationItem) {
  const suggested = typeof item.payload?.href === 'string' ? item.payload.href : '';
  if (suggested && suggested.startsWith('/') && !suggested.startsWith('//') && !suggested.includes('\\')) {
    try {
      const url = new URL(suggested, window.location.origin);
      if (url.origin === window.location.origin) return `${url.pathname}${url.search}${url.hash}`;
    } catch { /* Fall through to the known event route. */ }
  }
  const suggestedScreen = typeof item.payload?.screen === 'string' ? item.payload.screen : '';
  const supportedScreens = new Set(['Dashboard','My Projects','Projects','Opportunities','My Path','Learn','Submissions','Achievements','AI Mentor']);
  if (supportedScreens.has(suggestedScreen)) return `/workspace?screen=${encodeURIComponent(suggestedScreen)}`;
  if (item.kind === 'deadline_reminder') return '/workspace?screen=My%20Projects';
  if (item.payload?.decision || item.payload?.milestoneId) return '/workspace?screen=My%20Projects';
  if (item.payload?.submissionId) return '/workspace?screen=Submissions';
  if (item.payload?.projectId) return '/workspace?screen=My%20Projects';
  if (item.payload?.opportunityId || item.payload?.applicationId) return '/workspace?screen=Opportunities';
  if (item.payload?.roadmapId) return '/workspace?screen=My%20Path';
  return '/workspace';
}

export function NotificationCenter() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const unread = items.filter(item => !item.read_at).length;

  const refresh = useCallback(async () => {
    try {
      setItems(await loadNotifications());
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Notifications could not be loaded.');
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function markRead(id?: string) {
    const response = await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(id ? { id } : { all: true }),
    });
    const result = await response.json().catch(() => ({ error: 'Notification update returned an unreadable response.' }));
    if (!response.ok) {
      setError(result.error || 'Notification state could not be updated.');
      return false;
    }
    const now = new Date().toISOString();
    setItems(current => current.map(item => !id || item.id === id ? { ...item, read_at: now } : item));
    return true;
  }

  async function openNotification(item: NotificationItem) {
    if (!item.read_at) {
      const saved = await markRead(item.id);
      if (!saved) return;
    }
    setOpen(false);
    router.push(notificationDestination(item));
  }

  return <div className="notification-center">
    <button className="icon-btn notification-trigger" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} aria-expanded={open} onClick={()=>setOpen(!open)}>
      <Bell/><span>{unread>99?'99+':unread||''}</span>
    </button>
    {open&&<section className="notification-popover" aria-label="Notifications">
      <header><div><b>Notifications</b><small>{unread?`${unread} unread`:'You are all caught up'}</small></div><div><button className="text-btn" onClick={()=>void refresh()}>Refresh</button><button className="icon-btn" aria-label="Close notifications" onClick={()=>setOpen(false)}><X size={16}/></button></div></header>
      {error&&<p className="notice" role="alert">{error}</p>}
      {items.length>0&&unread>0&&<button className="notification-mark-all" onClick={()=>void markRead()}>Mark all read <Check size={14}/></button>}
      <div className="notification-list">{items.length?items.map(item=><article className={item.read_at?'notification-item':'notification-item unread'} key={item.id}>
        <button aria-label={`Open notification: ${item.title}`} onClick={()=>void openNotification(item)}><b>{item.title}</b><p>{item.body}</p><small>{new Date(item.created_at).toLocaleString()}</small></button>
      </article>):!error&&<p className="notification-empty">No notifications yet. Project and review activity will appear here.</p>}</div>
    </section>}
  </div>;
}
