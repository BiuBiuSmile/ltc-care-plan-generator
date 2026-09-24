
const CONFIG = window.CARE_PLAN_CONFIG || {};
const $ = (s) => document.querySelector(s);
let adminKey = sessionStorage.getItem("carePlanAdminKey") || "";
let toastTimer = null;
function apiBase(){ return String(CONFIG.API_URL || "").replace(/\/care-plan-web\/?$/, ""); }
function adminUrl(){ return `${apiBase()}/care-plan-admin`; }
function esc(v){ return String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function toast(msg){ const el=$("#toast"); el.textContent=msg; el.classList.remove("hidden"); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.add("hidden"),1800); }
function fmtDate(v){ if(!v) return "—"; const d=new Date(v); return Number.isNaN(d.getTime())?v:d.toLocaleString("zh-TW",{hour12:false}); }
async function api(action, extra={}){
  const r=await fetch(adminUrl(),{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json","X-Care-Plan-Admin-Key":adminKey},body:JSON.stringify({action,...extra})});
  const raw=await r.text(); let data={}; try{data=raw?JSON.parse(raw):{}}catch{}
  if(!r.ok||data.ok===false) throw new Error(data.message||`HTTP ${r.status}`);
  return data;
}
function render(data){
  const s=data.stats||{};
  $("#adminStats").innerHTML=[['測試帳號',s.total||0],['有效帳號',s.active||0],['已用 AI',s.used||0],['剩餘 AI',s.remaining||0]].map(([a,b])=>`<div class="stat-card"><span>${a}</span><strong>${b}</strong></div>`).join('');
  const rows=data.users||[];
  $("#testerRows").innerHTML=rows.length?rows.map(u=>{
    const max=Number(u.max_calls||10),used=Number(u.used_calls||0),remain=Math.max(0,max-used),pct=Math.min(100,max?used/max*100:0);
    const expired=u.expires_at && Date.parse(u.expires_at)<=Date.now();
    const active=Number(u.enabled)===1&&!expired;
    return `<tr><td><span class="tester-name">${esc(u.name)}</span><span class="tester-mail">${esc(u.email)}</span></td><td><div class="usage-meter"><strong>${used} / ${max}（剩 ${remain}）</strong><div class="usage-bar"><div class="usage-fill" style="width:${pct}%"></div></div></div></td><td>${u.expires_at?fmtDate(u.expires_at):'未設定'}</td><td><span class="status-pill ${active?'active':'off'}">${active?'啟用':'停用／到期'}</span></td><td>${fmtDate(u.last_used_at)}</td><td><div class="row-actions"><button class="mini-btn" data-act="reissue" data-id="${u.id}">重發邀請</button><button class="mini-btn" data-act="reset" data-id="${u.id}">重設10次</button><button class="mini-btn" data-act="toggle" data-enabled="${Number(u.enabled)===1?0:1}" data-id="${u.id}">${Number(u.enabled)===1?'停用':'啟用'}</button><button class="mini-btn danger" data-act="delete" data-id="${u.id}">刪除</button></div></td></tr>`;
  }).join(''):`<tr><td colspan="6">尚未建立測試帳號。</td></tr>`;
}
async function login(){
  const value=$("#adminKey").value.trim(); if(!value)return;
  adminKey=value; $("#adminLoginBtn").disabled=true; $("#adminLoginError").classList.add("hidden");
  try{const data=await api('list'); sessionStorage.setItem("carePlanAdminKey",adminKey); $("#adminLogin").classList.add("hidden"); $("#adminPanel").classList.remove("hidden"); render(data);}
  catch(e){$("#adminLoginError").textContent=e.message;$("#adminLoginError").classList.remove("hidden"); adminKey='';}
  finally{$("#adminLoginBtn").disabled=false;}
}
async function createTester(){
  const name=$("#testerName").value.trim(),email=$("#testerEmailInput").value.trim(),date=$("#testerExpiry").value;
  if(!name||!email){alert('請填姓名與 Email');return;}
  const expires_at=date?new Date(`${date}T23:59:59+08:00`).toISOString():"";
  const btn=$("#createTesterBtn");btn.disabled=true;
  try{const data=await api('create',{name,email,expires_at});render(data);$("#newInviteCode").textContent=data.invite_code||'';$("#inviteResult").classList.remove('hidden');$("#testerName").value='';$("#testerEmailInput").value='';toast('測試邀請已建立');}
  catch(e){alert(e.message)}finally{btn.disabled=false;}
}
async function action(id,act,enabled){
  const labels={reissue:'重新產生邀請碼？舊邀請碼會立即失效。',reset:'將此帳號 AI 額度重設為 10 次？',delete:'確定刪除此測試帳號與使用紀錄？'};
  if(labels[act]&&!confirm(labels[act]))return;
  try{const data=await api(act,{id,enabled:Boolean(Number(enabled))});render(data);if(data.invite_code){$("#newInviteCode").textContent=data.invite_code;$("#inviteResult").classList.remove('hidden');}toast('已更新');}catch(e){alert(e.message)}
}
$("#adminLoginBtn").addEventListener('click',login);$("#adminKey").addEventListener('keydown',e=>{if(e.key==='Enter')login()});
$("#createTesterBtn").addEventListener('click',createTester);$("#refreshAdminBtn").addEventListener('click',async()=>{try{render(await api('list'));toast('已重新整理')}catch(e){alert(e.message)}});
$("#copyInviteBtn").addEventListener('click',async()=>{const t=$("#newInviteCode").textContent.trim();if(t){await navigator.clipboard.writeText(t);toast('邀請碼已複製')}});
$("#testerRows").addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(b)action(Number(b.dataset.id),b.dataset.act,b.dataset.enabled)});
if(adminKey){$("#adminKey").value=adminKey;login();}
