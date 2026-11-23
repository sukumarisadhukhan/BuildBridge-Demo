import { CertificateVerification } from '@/components/CertificateVerification';

type PageProps = { params: Promise<{ certificateCode: string }> };

export default async function VerifyCertificateByCodePage({ params }: PageProps) {
  const { certificateCode } = await params;
  return <CertificateVerification certificateCode={certificateCode} />;
}
