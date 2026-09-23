/**
 * Cloudflare Worker 正式版架構示意
 * 這不是可直接上線的完整金流／會員系統，只是展示後端應該放哪裡。
 *
 * 建議 Secrets / Bindings：
 * - OPENAI_API_KEY
 * - DB (Cloudflare D1)
 *
 * POST /api/generate
 * Authorization: Bearer <user-session-token>
 *
 * 流程：
 * 1. 驗證 user session
 * 2. 查 D1 subscription / quota
 * 3. 無方案或剩餘 0 次 -> 拒絕
 * 4. 呼叫 OpenAI
 * 5. 成功後由後端扣 1 次
 * 6. 回傳結果
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, {headers:corsHeaders(request)});
    if (url.pathname !== '/api/generate' || request.method !== 'POST') return json({ok:false,message:'Not found'},404,request);

    const auth = request.headers.get('Authorization') || '';
    if (!auth.startsWith('Bearer ')) return json({ok:false,code:'LOGIN_REQUIRED',message:'請先登入。'},401,request);

    // 正式版：改成從 D1 查詢該使用者的方案、到期日、剩餘次數。
    const demoUser = {active:true,remaining:93};
    if (!demoUser.active) return json({ok:false,code:'SUBSCRIPTION_REQUIRED',message:'尚未啟用 AI 方案。'},402,request);
    if (demoUser.remaining <= 0) return json({ok:false,code:'QUOTA_EXHAUSTED',message:'本月 AI 次數已用完。'},429,request);

    const payload = await request.json();

    // 正式版：在這裡使用 env.OPENAI_API_KEY 呼叫 OpenAI。
    // 只有 OpenAI 成功後，才用 D1 transaction 將 remaining - 1。

    return json({ok:true,remaining:demoUser.remaining-1,content:'這裡會回傳 AI 整理後的個管計畫。'},200,request);
  }
};
function corsHeaders(request){
  const origin=request.headers.get('Origin')||'';
  const allowed=new Set(['https://YOUR_GITHUB_NAME.github.io','https://YOUR_DOMAIN.example']);
  return {'Access-Control-Allow-Origin':allowed.has(origin)?origin:'null','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
}
function json(data,status,request){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8',...corsHeaders(request)}})}
