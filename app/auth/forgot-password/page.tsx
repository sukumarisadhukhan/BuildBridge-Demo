import { AuthForm } from '@/components/AuthForm';
import Image from 'next/image';

export default function ForgotPasswordPage() {
  return <main className="auth-page"><div className="auth-mark"><Image src="/buildbridge-logo.png" alt="BuildBridge" width={230} height={120} priority/><p>Learn it. Build it. Prove it.</p></div><AuthForm mode="forgot"/></main>;
}
