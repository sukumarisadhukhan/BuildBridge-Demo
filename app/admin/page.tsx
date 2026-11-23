import { WorkspacePage } from '@/lib/workspace-page';

export default function AdminDashboardPage() {
  return <WorkspacePage requiredRole="admin"/>;
}