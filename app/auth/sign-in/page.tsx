import { AuthForm } from '@/components/AuthForm';
import Image from 'next/image';

export default function SignInPage() {
  return <main className="auth-page"><div className="auth-mark"><Image src="/buildbridge-logo.png" alt="BuildBridge" width={560} height={373} priority/><div className="auth-brand-copy"><b>Your learning should lead somewhere.</b><p>Build skills. Complete real projects. Prove your work. Earn trust.</p></div></div><AuthForm mode="sign-in"/></main>;
}
