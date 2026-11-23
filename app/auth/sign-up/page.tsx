import { AuthForm } from '@/components/AuthForm';
import Image from 'next/image';

export default function SignUpPage() {
  return <main className="auth-page"><div className="auth-mark"><Image src="/buildbridge-logo.png" alt="BuildBridge" width={560} height={373} priority/><div className="auth-brand-copy"><b>Learn with direction.</b><b>Build with evidence.</b><b>Move into real work.</b><p>BRIDGING TRADITIONAL LEARNING TO REAL-WORLD WORK</p></div></div><AuthForm mode="sign-up"/></main>;
}
