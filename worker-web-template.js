/**
 * Cloudflare Worker Web 版端點骨架（尚未直接串 OpenAI）
 * 目的：讓 GitHub Pages 只送 source_text + change_form_data，真正 prompt 與 API Key 留在後端。
 *
 * 前端 config.js：
 *   DEMO_MODE: false
 *   API_URL: "https://你的-worker.workers.dev/care-plan-web"
 *
 * POST body:
 * {
 *   source_text: "...",
 *   change_form_data: {...},
 *   intervention_change: "尚未使用"
 * }
 *
 * TODO：下一階段把桌面版 SYSTEM_INSTRUCTION / USER_PROMPT_TEMPLATE 搬到 Worker，
 * 再用 env.OPENAI_API_KEY 呼叫 OpenAI。不要把 API Key 放 GitHub Pages。
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, {headers: cors(request)});
    if (url.pathname !== '/care-plan-web' || request.method !== 'POST') return json({ok:false,message:'Not found'},404,request);
    const body = await request.json().catch(()=>null);
    if (!body?.source_text || !body?.change_form_data) return json({ok:false,message:'資料不完整'},400,request);
    // 正式版：在此建立 prompt、呼叫 OpenAI、驗證 JSON 後回傳。
    return json({ok:false,message:'此端點目前是範本，尚未啟用 OpenAI。'},501,request);
  }
};
function cors(request){
  const origin=request.headers.get('Origin')||'';
  // 正式上線請改成你自己的 GitHub Pages / 自訂網域白名單。
  const allowed=['https://YOUR_NAME.github.io','https://YOUR_DOMAIN'];
  return {'Access-Control-Allow-Origin':allowed.includes(origin)?origin:'null','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
}
function json(data,status,request){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8',...cors(request)}})}
