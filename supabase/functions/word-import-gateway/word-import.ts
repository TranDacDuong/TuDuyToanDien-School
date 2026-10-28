type Rpc = (name: string, args: Record<string, unknown>) => Promise<any>;
const uuid = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export async function wordImportAction(payload: any, rpc: Rpc) {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  if (payload.action === 'wordImportClaim') {
    const job = await rpc('claim_word_question_import', {});
    if (!job) return { job: null };
    const response = await fetch(`${url}/storage/v1/object/sign/word-question-sources/${job.source_path}`, {
      method: 'POST', headers, body: JSON.stringify({ expiresIn: 3600 }), signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error('Cannot download Word source');
    const signed = await response.json();
    return { job: { ...job, download_url: `${url}/storage/v1${signed.signedURL}` } };
  }
  if (!uuid(payload.id) || !uuid(payload.token)) throw new Error('Invalid Word import lease');
  if (payload.action === 'wordImportCycle') {
    if (!Array.isArray(payload.items) || payload.items.length > 10 || JSON.stringify(payload).length > 1500000 ||
        !['processing', 'completed', 'failed'].includes(payload.status) || JSON.stringify(payload.progress || {}).length > 10000) throw new Error('Invalid Word import batch');
    return { active: await rpc('word_question_import_cycle', {
      p_id: payload.id, p_token: payload.token, p_items: payload.items, p_progress: payload.progress || {},
      p_status: payload.status, p_error: String(payload.error || '').slice(0, 500) || null,
    }) };
  }
  if (payload.action === 'wordImportMedia') {
    if (typeof payload.name !== 'string' || !/^[a-f0-9]{64}\.png$/.test(payload.name) ||
        typeof payload.base64 !== 'string' || payload.base64.length > 5600000) throw new Error('Invalid Word image');
    if (!await rpc('word_question_import_lease', { p_id: payload.id, p_token: payload.token })) return { active: false };
    const binary = Uint8Array.from(atob(payload.base64), c => c.charCodeAt(0));
    if (binary.length > 4194304 || ![137,80,78,71,13,10,26,10].every((v,i) => binary[i] === v)) throw new Error('PNG required');
    const path = `${payload.id}/${payload.name}`;
    const response = await fetch(`${url}/storage/v1/object/word-question-media/${path}`, {
      method: 'POST', headers: { ...headers, 'Content-Type': 'image/png', 'Cache-Control': '31536000' },
      body: binary, signal: AbortSignal.timeout(20000),
    });
    if (!response.ok && response.status !== 409) {
      const result = await response.json().catch(() => ({}));
      if (String(result.statusCode) !== '409') throw new Error(`Word image upload failed: ${response.status}`);
    }
    return { active: true, path };
  }
  throw new Error('Unknown Word import action');
}
