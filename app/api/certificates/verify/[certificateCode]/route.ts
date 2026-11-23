import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfiguration, supabaseConfigurationMessage } from '@/lib/supabase-config';

type RouteContext = { params: Promise<{ certificateCode: string }> };

export async function GET(_req: Request, { params }: RouteContext) {
  try {
    const { certificateCode } = await params;
    const normalized = certificateCode.toUpperCase();
    const isProjectCertificate = /^BB-[A-F0-9]{16}$/.test(normalized);
    const isTheoryCertificate = /^BBT-[A-F0-9]{16}$/.test(normalized);
    if (!isProjectCertificate && !isTheoryCertificate) {
      return NextResponse.json({ error: 'Enter a valid BuildBridge certificate ID.' }, { status: 400 });
    }
    const configuration = getSupabaseConfiguration();
    if (configuration.error) return NextResponse.json({ error: supabaseConfigurationMessage(configuration.error) }, { status: 503 });
    const supabase = createClient(configuration.url, configuration.key, {
      auth: { flowType: 'implicit', persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = isTheoryCertificate
      ? await supabase.rpc('verify_theory_certificate', { certificate_code_input: normalized })
      : await supabase.rpc('verify_certificate', { certificate_code_input: normalized });
    if (error) return NextResponse.json({ error: `Certificate verification could not be completed: ${error.message}` }, { status: 502 });
    const certificate = Array.isArray(data) ? data[0] : data;
    if (!certificate) return NextResponse.json({ error: 'No certificate matches this ID.' }, { status: 404 });
    if (isTheoryCertificate) {
      return NextResponse.json({ data: {
        certificate_code: certificate.certificate_code,
        certificate_type: 'theory_learning_completion',
        recipient_name: certificate.recipient_name,
        project_title: null,
        project_description: null,
        pathway_name: certificate.course_name,
        skills: [],
        issuer_name: 'BuildBridge',
        signatory_name: null,
        signatory_title: null,
        issued_at: certificate.issued_at,
        certificate_status: 'issued',
        score: certificate.score,
      } }, { headers: { 'Cache-Control': 'no-store' } });
    }
    return NextResponse.json({ data: certificate }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Certificate verification failed.' }, { status: 500 });
  }
}
