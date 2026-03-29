import { useState, useEffect, useRef, useCallback } from "react";
import * as XLSX from "xlsx";
import { createClient } from '@supabase/supabase-js';
import Holidays from 'date-holidays';
import JSZip from "jszip";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

if (!document.querySelector("#gf3")) {
  const l = document.createElement("link"); l.id = "gf3";
  l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700;800;900&display=swap";
  document.head.appendChild(l);
}
if (!document.querySelector("#css3")) {
  const s = document.createElement("style"); s.id = "css3";
  s.textContent = `
    *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
    html,body{
      background:
        radial-gradient(circle at top left, rgba(255,255,255,.78), transparent 26%),
        linear-gradient(160deg,#EEF0FF 0%,#E8F0FA 40%,#E8F4FD 100%);
    }
    body{color:#1E1B4B}
    input,button,textarea{font-family:'Noto Sans KR',sans-serif}
    button{transition:transform .18s ease, box-shadow .22s ease, background-color .22s ease, border-color .22s ease}
    input[type=number]::-webkit-outer-spin-button,input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
    input[type=date]::-webkit-calendar-picker-indicator{opacity:0.35;cursor:pointer}
    @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
    @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
    @keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
    @keyframes toast{from{opacity:0;transform:translateX(-50%) translateY(10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
    @keyframes fabPop{from{opacity:0;transform:scale(.88) translateY(6px)}to{opacity:1;transform:scale(1) translateY(0)}}
    .fu{animation:fadeUp .3s cubic-bezier(.22,1,.36,1) both}
    .tx-row:active{background:rgba(99,102,241,.08)!important}
    .btn-press:active{transform:scale(.96)!important}
    .btn-press:hover{box-shadow:0 12px 28px rgba(99,102,241,.16)}
    .inp{
      background:rgba(255,255,255,.72)!important;
      border:1px solid rgba(255,255,255,.88)!important;
      box-shadow:inset 0 1px 0 rgba(255,255,255,.42), 0 10px 28px rgba(148,163,184,.12)!important;
      backdrop-filter:blur(14px)
    }
    .inp::placeholder{color:#A0AEC0}
    .inp:focus{border-color:#7C83FF!important;box-shadow:0 0 0 3px rgba(124,131,255,.12),0 10px 28px rgba(99,102,241,.12)!important}
    .glass-panel{
      background:linear-gradient(180deg, rgba(255,255,255,.72), rgba(255,255,255,.56))!important;
      border:1px solid rgba(255,255,255,.9)!important;
      box-shadow:0 18px 44px rgba(99,102,241,.12)!important;
      backdrop-filter:blur(20px)
    }
    .glass-soft{
      background:rgba(255,255,255,.62)!important;
      border:1px solid rgba(255,255,255,.72)!important;
      box-shadow:0 10px 28px rgba(148,163,184,.12)!important;
      backdrop-filter:blur(16px)
    }
    @media(min-width:768px){
      #root>div{
        max-width:430px!important;
        margin:0 auto!important;
        border-radius:32px;
        overflow:hidden;
        box-shadow:0 28px 80px rgba(99,102,241,.20)!important
      }
    }
  `;
  document.head.appendChild(s);
}

/* ── Constants & Utilities ── */
const LIMIT = 200_000;
const mKey = (offset=0) => { const d=new Date(); d.setMonth(d.getMonth()-offset); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; };
const monthLabel = (offset=0) => { const d=new Date(); d.setMonth(d.getMonth()-offset); return `${d.getFullYear()}년 ${d.getMonth()+1}월`; };
const todayMD = () => { const d=new Date(); return `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}`; };
const pctColor = p => p>=90?"#EF4444":p>=70?"#F59E0B":"#10B981";

const formatDateHeader = (dateStr) => {
  if (!dateStr) return dateStr;
  const [mm, dd] = dateStr.split("/");
  const d = new Date(new Date().getFullYear(), parseInt(mm)-1, parseInt(dd));
  const days = ["일","월","화","수","목","금","토"];
  return `${parseInt(mm)}월 ${parseInt(dd)}일 (${days[d.getDay()]})`;
};

// MM/DD ↔ YYYY-MM-DD
const toYMD = (mmdd) => {
  if (!mmdd) return "";
  const [mm, dd] = mmdd.split("/");
  if (!mm || !dd) return "";
  return `${new Date().getFullYear()}-${mm.padStart(2,"0")}-${dd.padStart(2,"0")}`;
};
const fromYMD = (ymd) => {
  if (!ymd) return "";
  const p = ymd.split("-");
  if (p.length < 3) return "";
  return `${p[1]}/${p[2]}`;
};

/* ── Storage & DB ── */
const S = {
  get: async k => { try { const v=localStorage.getItem(k); return v?JSON.parse(v):null; } catch { return null; } },
  set: async (k,v) => { try { localStorage.setItem(k,JSON.stringify(v)); } catch {} },
};
const GS = {
  load: async () => {
    const { data:{ user } } = await supabase.auth.getUser();
    if (!user) return [];
    const { data } = await supabase.from("transactions").select("*").eq("user_id",user.id).order("created_at",{ascending:false});
    return data||[];
  },
  add: async tx => {
    const { data:{ user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("transactions").insert({id:tx.id,user_id:user.id,amount:tx.amount,merchant:tx.merchant,date:tx.date,image_url:tx.image_url||null});
  },
  del: async id => { await supabase.from("transactions").delete().eq("id",id); },
  update: async tx => { await supabase.from("transactions").update({amount:tx.amount,merchant:tx.merchant,date:tx.date}).eq("id",tx.id); },
};
const US = {
  load: async () => {
    const { data:{ user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase.from("user_settings").select("*").eq("user_id",user.id).single();
    return data;
  },
  save: async (cfg, userId) => {
    await supabase.from("user_settings").upsert({user_id:userId,project_name:cfg.projectName||"",email:cfg.email||"",threshold:cfg.threshold||50000,updated_at:new Date().toISOString()});
  },
};

const compress = (url,px=900) => new Promise(res => {
  const img=new Image(); img.onload=()=>{
    const sc=Math.min(1,px/Math.max(img.width,img.height));
    const c=document.createElement("canvas"); c.width=img.width*sc; c.height=img.height*sc;
    c.getContext("2d").drawImage(img,0,0,c.width,c.height); res(c.toDataURL("image/jpeg",.7));
  }; img.src=url;
});
const uploadReceipt = async (userId, txId, dataUrl) => {
  try {
    const base64=dataUrl.split(",")[1]; const mime=dataUrl.split(";")[0].split(":")[1];
    const ext=mime==="image/png"?"png":"jpg"; const path=`${userId}/${txId}.${ext}`;
    const blob=await fetch(dataUrl).then(r=>r.blob());
    const { error }=await supabase.storage.from("receipts").upload(path,blob,{contentType:mime,upsert:true});
    if(error) return null;
    const { data }=supabase.storage.from("receipts").getPublicUrl(path);
    return data.publicUrl;
  } catch { return null; }
};

async function ocr(b64, mt) {
  try {
    const r=await fetch("https://api.anthropic.com/v1/messages",{
      method:"POST",
      headers:{"Content-Type":"application/json","x-api-key":import.meta.env.VITE_ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
      body:JSON.stringify({model:"claude-haiku-4-5-20251001",max_tokens:200,
        system:`Receipt parser. Return ONLY valid JSON: {"amount":number_or_null,"merchant":"string","date":"MM/DD"}. amount=total KRW integer. merchant=Korean store name or "알 수 없음". date=MM/DD or null.`,
        messages:[{role:"user",content:[{type:"image",source:{type:"base64",media_type:mt,data:b64}},{type:"text",text:"총 결제금액, 가맹점명, 결제일자 추출"}]}]})
    });
    const d=await r.json(); const t=d.content?.find(b=>b.type==="text")?.text||"{}";
    return JSON.parse(t.replace(/```json|```/g,"").trim());
  } catch { return {amount:null,merchant:"알 수 없음",date:null}; }
}

function exportXlsx(txns, projectName) {
  const wb=XLSX.utils.book_new(); const ws={};
  const sc=(addr,v)=>{ ws[addr]={v,t:typeof v==="number"?"n":"s"}; };
  sc("A1","법인카드 지출 결의서"); sc("A3","일자 :                                                                           성명 :  (인)");
  sc("A4","아래와 같이 지출 결의서를 제출하오니 확인 바랍니다."); sc("A5","=== 아     래 ==="); sc("A6","1. 개인 경비 및 지원금");
  sc("A7","프로젝트명"); sc("D7","항목"); sc("E7","일자"); sc("F7","금액"); sc("G7","비고");
  const proj=projectName||"";
  for(let i=0;i<22;i++){
    const row=8+i; sc(`A${row}`,proj); sc(`D${row}`,"식비");
    if(i<txns.length){ sc(`E${row}`,txns[i].date||""); ws[`F${row}`]={v:txns[i].amount,t:"n"}; }
  }
  sc("A30","소계"); ws["F30"]={f:"SUM(F8:F29)",t:"n"};
  const merges=[{s:{r:0,c:0},e:{r:1,c:6}},{s:{r:2,c:0},e:{r:2,c:6}},{s:{r:3,c:0},e:{r:3,c:6}},{s:{r:4,c:0},e:{r:4,c:6}},{s:{r:5,c:0},e:{r:5,c:6}},{s:{r:6,c:0},e:{r:6,c:2}}];
  for(let i=0;i<22;i++) merges.push({s:{r:7+i,c:0},e:{r:7+i,c:2}});
  merges.push({s:{r:29,c:0},e:{r:29,c:2}});
  ws["!merges"]=merges; ws["!ref"]="A1:G30";
  ws["!cols"]=[{wch:8},{wch:8},{wch:8},{wch:8},{wch:12},{wch:12},{wch:12}];
  XLSX.utils.book_append_sheet(wb,ws,"수입지출계획");
  const d=new Date();
  XLSX.writeFile(wb,`${d.getMonth()+1}월_지출결의서_${proj||"식대"}.xlsx`);
}

/* ── Icons ── */
const IcCamera = ({color="white",size=18}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/>
  </svg>
);
const IcImage = ({color="white",size=18}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
  </svg>
);
const IcPencil = ({color="white",size=18}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);
const IcDownload = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);

const IconHome = ({active}) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active?"white":"#94A3B8"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/><path d="M9 21V12h6v9"/>
  </svg>
);
const IconGallery = ({active}) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active?"white":"#94A3B8"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5" fill={active?"white":"#94A3B8"} stroke="none"/><path d="M21 15l-5-5L5 21"/>
  </svg>
);
const IconSettings = ({active}) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active?"white":"#94A3B8"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
  </svg>
);

const CardSVG = ({size=80}) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" style={{animation:"float 3.5s ease-in-out infinite",flexShrink:0}}>
    <defs>
      <linearGradient id="cg1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#818CF8"/><stop offset="100%" stopColor="#6366F1"/></linearGradient>
      <radialGradient id="cg2" cx="30%" cy="20%" r="60%"><stop offset="0%" stopColor="white" stopOpacity=".45"/><stop offset="100%" stopColor="white" stopOpacity="0"/></radialGradient>
      <filter id="cf1" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="8" stdDeviation="10" floodColor="#6366F1" floodOpacity=".35"/></filter>
    </defs>
    <g transform="rotate(-12 50 50)" filter="url(#cf1)">
      <rect x="8" y="20" width="84" height="56" rx="10" fill="url(#cg1)"/>
      <ellipse cx="36" cy="32" rx="24" ry="11" fill="url(#cg2)" transform="rotate(-8 36 32)"/>
      <rect x="8" y="20" width="84" height="56" rx="10" fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="1.2"/>
      <rect x="16" y="30" width="15" height="11" rx="3" fill="#E8C96A" opacity=".95"/>
      {[0,1,2,3].map(g=>([0,1,2,3].map(d=>(<circle key={`${g}${d}`} cx={16+g*15+d*3} cy={54} r="1.1" fill="white" opacity=".6"/>))))}
      <circle cx="70" cy="62" r="6" fill="#C7D2FE" opacity=".85"/>
      <circle cx="78" cy="62" r="6" fill="#A5B4FC" opacity=".85"/>
    </g>
  </svg>
);

/* ── UI Primitives ── */
const Toast = ({toast}) => toast?(
  <div className="glass-soft" style={{position:"fixed",bottom:104,left:"50%",transform:"translateX(-50%)",zIndex:9999,
    background:toast.err?"linear-gradient(180deg, rgba(248,113,113,.92), rgba(239,68,68,.88))":"linear-gradient(180deg, rgba(129,140,248,.95), rgba(99,102,241,.88))",
    backdropFilter:"blur(18px)",color:"#fff",padding:"11px 24px",borderRadius:999,
    fontSize:13,fontWeight:700,whiteSpace:"nowrap",boxShadow:"0 18px 36px rgba(99,102,241,.24)",
    animation:"toast .25s ease both",border:"1px solid rgba(255,255,255,.2)"}}>
    {toast.msg}
  </div>
):null;

/* ── Form Input ── */
const FormInput = ({label,value,onChange,type="text",placeholder}) => (
  <div style={{marginBottom:12}}>
    {label&&<div style={{fontSize:12,color:"#64748B",fontWeight:500,marginBottom:6,textAlign:"left"}}>{label}</div>}
    <input className="inp" type={type} value={value} placeholder={placeholder} onChange={e=>onChange(e.target.value)}
      style={{width:"100%",background:"rgba(255,255,255,.72)",border:"1px solid rgba(255,255,255,.88)",borderRadius:14,
        padding:"14px 16px",fontSize:15,color:"#1e1b4b",outline:"none",transition:"border-color .15s, box-shadow .15s",fontFamily:"inherit"}}/>
  </div>
);

/* ── Tab Bar ── */
const TabBar = ({tab,setTab}) => (
  <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:430,
    zIndex:100,padding:"12px 21px calc(21px + env(safe-area-inset-bottom,0px)) 21px"}}>
    <div className="glass-panel" style={{display:"flex",background:"rgba(255,255,255,0.64)",backdropFilter:"blur(22px)",
      borderRadius:36,height:62,padding:4,border:"1px solid rgba(255,255,255,0.9)",
      boxShadow:"0 12px 32px rgba(99,102,241,.14)"}}>
      {[{id:"home",label:"홈",Icon:IconHome},{id:"gallery",label:"갤러리",Icon:IconGallery},{id:"settings",label:"설정",Icon:IconSettings}]
        .map(({id,label,Icon})=>{
          const active=tab===id;
          return (
            <button key={id} onClick={()=>setTab(id)} style={{
              flex:1,border:"none",cursor:"pointer",fontFamily:"inherit",
              borderRadius:26,background:active?"linear-gradient(150deg,#7C83FF,#6366F1)":"transparent",
              display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,
              boxShadow:active?"0 10px 24px rgba(99,102,241,.24)":"none",
              transition:"background .2s"}}>
              <Icon active={active}/>
              <span style={{fontSize:10,fontWeight:600,color:active?"#FFFFFF":"#94A3B8",letterSpacing:0.5,transition:"color .2s"}}>{label}</span>
            </button>
          );
        })}
    </div>
  </div>
);

/* ── Back Header ── */
const BackHeader = ({title,onBack}) => (
  <div style={{display:"flex",alignItems:"center",gap:10,padding:"52px 20px 16px"}}>
    <button className="btn-press glass-soft" onClick={onBack} style={{
      width:36,height:36,borderRadius:"50%",background:"rgba(255,255,255,.62)",border:"1px solid rgba(255,255,255,.88)",
      display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",
      boxShadow:"0 12px 24px rgba(148,163,184,.14)",flexShrink:0}}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 18l-6-6 6-6"/>
      </svg>
    </button>
    <div style={{fontSize:17,fontWeight:700,color:"#1e1b4b"}}>{title}</div>
  </div>
);

/* ── Confirm Button (fixed bottom) ── */
const FixedConfirmBtn = ({onClick,label="확인"}) => (
  <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",
    width:"100%",maxWidth:430,padding:"16px 20px",
    paddingBottom:"calc(16px + env(safe-area-inset-bottom, 0px))",
    background:"linear-gradient(to top,rgba(232,244,253,.96) 50%,rgba(232,244,253,0))"}}>
    <button className="btn-press" onClick={onClick} style={{
      width:"100%",borderRadius:16,padding:"16px",fontSize:15,fontWeight:700,
      cursor:"pointer",border:"none",color:"#fff",fontFamily:"inherit",
      background:"linear-gradient(150deg,#8B93FF,#6366F1)",
      boxShadow:"0 16px 36px rgba(99,102,241,.32)"}}>
      {label}
    </button>
  </div>
);

/* ── Calendar View ── */
function CalendarView({txns, onDayPress}) {
  const [calDate,setCalDate]=useState(()=>{const d=new Date();return new Date(d.getFullYear(),d.getMonth(),1);});
  const year=calDate.getFullYear(), month=calDate.getMonth();
  const today=new Date();
  const firstDay=calDate.getDay();
  const daysInMonth=new Date(year,month+1,0).getDate();

  const dayTotals={};
  txns.forEach(tx=>{
    if(!tx.date) return;
    const [mm,dd]=tx.date.split("/");
    if(parseInt(mm)===month+1){ const day=parseInt(dd); dayTotals[day]=(dayTotals[day]||0)+tx.amount; }
  });

  const hasTx=(day)=>!!dayTotals[day];
  const isToday=(day)=>day===today.getDate()&&month===today.getMonth()&&year===today.getFullYear();

  const cells=[];
  for(let i=0;i<firstDay;i++) cells.push(null);
  for(let i=1;i<=daysInMonth;i++) cells.push(i);

  const navBtn={background:"none",border:"none",cursor:"pointer",width:36,height:36,borderRadius:"50%",
    display:"flex",alignItems:"center",justifyContent:"center",color:"#64748B",fontSize:20,fontWeight:700};

  return (
    <div style={{padding:"0 20px 20px"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
        <button style={navBtn} onClick={()=>setCalDate(new Date(year,month-1,1))}>‹</button>
        <span style={{fontSize:16,fontWeight:700,color:"#1e1b4b"}}>{year}년 {month+1}월</span>
        <button style={navBtn} onClick={()=>setCalDate(new Date(year,month+1,1))}>›</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",textAlign:"center",marginBottom:6}}>
        {["일","월","화","수","목","금","토"].map((d,i)=>(
          <div key={d} style={{fontSize:11,color:i===0?"#EF4444":i===6?"#6366F1":"#94A3B8",padding:"4px 0",fontWeight:500}}>{d}</div>
        ))}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",rowGap:6}}>
        {cells.map((day,i)=>(
          <div key={i} style={{minHeight:52,textAlign:"center",cursor:day&&hasTx(day)?"pointer":"default"}}
            onClick={()=>day&&hasTx(day)&&onDayPress(`${String(month+1).padStart(2,"0")}/${String(day).padStart(2,"0")}`)}>
            {day&&(
              <>
                <div style={{
                  width:30,height:30,borderRadius:"50%",margin:"0 auto",
                  background:isToday(day)?"#6366F1":hasTx(day)?"#E0E7FF":"transparent",
                  display:"flex",alignItems:"center",justifyContent:"center",
                  color:isToday(day)?"#fff":hasTx(day)?"#4F46E5":i%7===0?"#EF4444":i%7===6?"#6366F1":"#1e1b4b",
                  fontSize:13,fontWeight:isToday(day)||hasTx(day)?700:400,
                }}>
                  {day}
                </div>
                <div style={{height:13,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"}}>
                  {hasTx(day)&&<span style={{fontSize:8,color:"#6366F1",fontWeight:600,whiteSpace:"nowrap"}}>₩{dayTotals[day].toLocaleString()}</span>}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Calendar Day Bottom Sheet ── */
function CalendarDaySheet({dateKey, txns, recs, onClose, onEdit}) {
  const dayTxns = txns.filter(tx=>tx.date===dateKey);
  const total = dayTxns.reduce((s,t)=>s+t.amount,0);
  return (
    <>
      <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(26,26,46,.38)",zIndex:200,backdropFilter:"blur(8px)"}}/>
      <div className="glass-panel" style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",
        width:"100%",maxWidth:430,background:"linear-gradient(180deg, rgba(255,255,255,.82), rgba(255,255,255,.70))",zIndex:201,
        borderRadius:"24px 24px 0 0",padding:"12px 20px",
        paddingBottom:"calc(20px + env(safe-area-inset-bottom, 0px))",
        animation:"slideUp .25s cubic-bezier(.22,1,.36,1)",boxShadow:"0 -20px 44px rgba(99,102,241,.14)"}}>
        <div style={{width:36,height:4,borderRadius:99,background:"#E2E8F0",margin:"0 auto 20px"}}/>
        <div style={{fontSize:17,fontWeight:700,color:"#1e1b4b",marginBottom:4}}>{formatDateHeader(dateKey)}</div>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:16,paddingBottom:12,borderBottom:"1px solid #F1F5F9"}}>
          <span style={{fontSize:13,color:"#94A3B8"}}>{dayTxns.length}건</span>
          <span style={{fontSize:13,fontWeight:700,color:"#1e1b4b"}}>₩{total.toLocaleString()}</span>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:0,marginBottom:20}}>
          {dayTxns.map((tx,i)=>(
            <button key={tx.id} onClick={()=>{onEdit(tx);onClose();}}
              style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                padding:"14px 0",borderBottom:i<dayTxns.length-1?"1px solid #F8F8FF":"none",
                background:"none",border:"none",cursor:"pointer",width:"100%",fontFamily:"inherit",
                borderRadius:0}}>
              <span style={{fontSize:14,fontWeight:500,color:"#1e1b4b"}}>{tx.merchant}</span>
              <span style={{fontSize:14,fontWeight:600,color:"#EF4444"}}>-₩{tx.amount.toLocaleString()}</span>
            </button>
          ))}
        </div>
        <button className="btn-press" onClick={onClose} style={{
          width:"100%",padding:"15px",borderRadius:16,border:"none",cursor:"pointer",
          background:"linear-gradient(150deg,#8B93FF,#6366F1)",color:"#fff",
          fontSize:15,fontWeight:700,fontFamily:"inherit",
          boxShadow:"0 16px 34px rgba(99,102,241,.28)"}}>
          확인
        </button>
      </div>
    </>
  );
}

/* ── Form Page (Receipt / Gallery / Manual / Edit) ── */
function FormPage({source, preview, ocrRes, form, setForm, onSubmit, onBack}) {
  const titleMap = {camera:"영수증 촬영", gallery:"사진 업로드", manual:"직접 등록", edit:"내역 수정"};
  const title = titleMap[source] || "입력";

  return (
    <div style={{position:"fixed",inset:0,background:"linear-gradient(160deg,#EEF0FF 0%,#E8F0FA 40%,#E8F4FD 100%)",
      zIndex:300,maxWidth:430,margin:"0 auto",overflowY:"auto",paddingBottom:100}}>
      <BackHeader title={title} onBack={onBack}/>

      {/* Photo area */}
      {(source==="camera"||source==="gallery"||source==="edit")&&(
        <div style={{margin:"0 20px 16px"}}>
          {preview?(
            <div style={{width:"100%",borderRadius:20,overflow:"hidden",maxHeight:260,boxShadow:"0 4px 20px rgba(0,0,0,.08)"}}>
              <img src={preview} alt="" style={{width:"100%",maxHeight:260,objectFit:"cover",display:"block"}}/>
            </div>
          ):(
            <div style={{width:"100%",height:180,borderRadius:20,background:"#F8F9FA",
              border:"1.5px dashed #CBD5E1",display:"flex",flexDirection:"column",
              alignItems:"center",justifyContent:"center",gap:10}}>
              <IcCamera color="#CBD5E1" size={36}/>
              <div style={{fontSize:13,color:"#94A3B8"}}>사진을 촬영하거나 업로드하세요</div>
            </div>
          )}
        </div>
      )}

      {/* OCR result */}
      {source==="camera"&&ocrRes?.amount&&(
        <div style={{margin:"0 20px 12px",background:"#F0FDF4",border:"1px solid #BBF7D0",borderRadius:14,padding:"12px 16px"}}>
          <div style={{fontSize:11,color:"#10B981",fontWeight:700,marginBottom:2}}>✓ 자동 인식 완료</div>
          <div style={{fontSize:20,fontWeight:800,color:"#1e1b4b"}}>{ocrRes.amount.toLocaleString()}원</div>
        </div>
      )}
      {source==="camera"&&ocrRes&&!ocrRes.amount&&(
        <div style={{margin:"0 20px 12px",background:"#FFF5F5",border:"1px solid #FED7D7",borderRadius:14,padding:"12px 16px",fontSize:13,color:"#EF4444"}}>
          인식 실패 — 아래에 직접 입력해주세요
        </div>
      )}

      {/* Form card */}
      <div className="glass-panel" style={{margin:"0 20px",background:"linear-gradient(180deg, rgba(255,255,255,.74), rgba(255,255,255,.58))",borderRadius:20,padding:"20px",boxShadow:"0 18px 38px rgba(99,102,241,.12)"}}>
        <FormInput label="결제 금액"
          value={form.amount ? parseInt(form.amount,10).toLocaleString() : ""}
          onChange={v=>setForm(f=>({...f,amount:v.replace(/[^0-9]/g,"")}))}
          placeholder="₩ 0"/>
        <FormInput label="사용 날짜"
          type="date"
          value={toYMD(form.date)}
          onChange={v=>setForm(f=>({...f,date:fromYMD(v)}))}/>
        <FormInput label="가맹점명"
          value={form.merchant}
          onChange={v=>setForm(f=>({...f,merchant:v}))}
          placeholder="가맹점 이름을 입력해 주세요."/>
      </div>

      <FixedConfirmBtn onClick={onSubmit}/>
    </div>
  );
}

/* ── Loading Screen ── */
const LoadingScreen = ({preview}) => (
  <div style={{position:"fixed",inset:0,background:"linear-gradient(160deg,#EEF0FF 0%,#E8F0FA 40%,#E8F4FD 100%)",
    zIndex:300,maxWidth:430,margin:"0 auto",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
    {preview&&(
      <div style={{width:"calc(100% - 40px)",borderRadius:20,overflow:"hidden",marginBottom:24,opacity:.7,boxShadow:"0 4px 20px rgba(0,0,0,.08)"}}>
        <img src={preview} alt="" style={{width:"100%",maxHeight:220,objectFit:"cover",display:"block"}}/>
      </div>
    )}
    <div style={{fontSize:36,marginBottom:12}}>✨</div>
    <div style={{color:"#94A3B8",fontSize:14,fontWeight:500}}>영수증 읽는 중...</div>
  </div>
);

/* ══ MAIN APP ══ */
export default function App() {
  const [txns,setTxns]=useState([]);
  const [recs,setRecs]=useState({});
  const [cfg,setCfg]=useState({email:"",threshold:50000,projectName:""});
  const [tab,setTab]=useState("home");
  const [homeView,setHomeView]=useState("list");
  const [overlay,setOv]=useState(null);          // null | "loading" | "form"
  const [overlaySource,setOvSrc]=useState(null); // "camera"|"gallery"|"manual"|"edit"
  const [editTarget,setEditTarget]=useState(null);
  const [fabOpen,setFab]=useState(false);
  const [preview,setPv]=useState(null);
  const [ocrRes,setOcr]=useState(null);
  const [form,setForm]=useState({amount:"",merchant:"",date:""});
  const [toast,setToast]=useState(null);
  const [user,setUser]=useState(null);
  const [galleryFilter,setGalleryFilter]=useState(0);
  const [openSection,setOpenSection]=useState(null);
  const [galleryBottomSheet,setGalleryBS]=useState(null); // tx
  const [calDaySheet,setCalDaySheet]=useState(null);      // "MM/DD"
  const camRef=useRef(); const galRef=useRef();

  useEffect(()=>{
    supabase.auth.getUser().then(({data:{user}})=>{
      setUser(user);
      if(user){
        Promise.all([GS.load(),US.load()]).then(([rows,settings])=>{
          if(rows.length){
            setTxns(rows.map(r=>({id:Number(r.id),amount:Number(r.amount),merchant:r.merchant,date:r.date,image_url:r.image_url||null})));
            const rd={};rows.forEach(r=>{if(r.image_url) rd[Number(r.id)]=r.image_url;});setRecs(rd);
          }
          if(settings) setCfg({projectName:settings.project_name||"",email:settings.email||"",threshold:settings.threshold||50000});
        });
      }
    });
    supabase.auth.onAuthStateChange((_,session)=>setUser(session?.user||null));
  },[]);

  useEffect(()=>{
    const onBack=()=>{if(tab!=="home") setTab("home");};
    window.addEventListener("popstate",onBack);
    return()=>window.removeEventListener("popstate",onBack);
  },[tab]);

  const ping=(msg,err=false)=>{setToast({msg,err});setTimeout(()=>setToast(null),2400);};

  // Derived data
  const filterLabel=monthLabel(galleryFilter);
  const filteredTxns=txns.filter(tx=>{
    if(!tx.date) return galleryFilter===0;
    const [mm]=tx.date.split("/");
    const d=new Date(); d.setMonth(d.getMonth()-galleryFilter);
    return parseInt(mm)===d.getMonth()+1;
  }).sort((a,b)=>{const[am,ad]=(a.date||"").split("/");const[bm,bd]=(b.date||"").split("/");return(parseInt(bm)*100+parseInt(bd))-(parseInt(am)*100+parseInt(ad));});

  const thisMonthTxns=txns.filter(t=>{const[mm]=(t.date||"").split("/");return parseInt(mm)===new Date().getMonth()+1;})
    .sort((a,b)=>{const[am,ad]=(a.date||"").split("/");const[bm,bd]=(b.date||"").split("/");return(parseInt(bm)*100+parseInt(bd))-(parseInt(am)*100+parseInt(ad));});
  const used=thisMonthTxns.reduce((s,t)=>s+t.amount,0);
  const remaining=LIMIT-used;
  const pct=Math.min(100,(used/LIMIT)*100);
  const pc=pctColor(pct);

  // Date-grouped for home list
  const groupedTxns={};
  thisMonthTxns.forEach(tx=>{const k=tx.date||"미상";if(!groupedTxns[k])groupedTxns[k]=[];groupedTxns[k].push(tx);});
  const sortedDateKeys=Object.keys(groupedTxns).sort((a,b)=>{const[am,ad]=a.split("/");const[bm,bd]=b.split("/");return(parseInt(bm)*100+parseInt(bd))-(parseInt(am)*100+parseInt(ad));});

  const getDailyBudget=()=>{
    const hd=new Holidays('KR');const today=new Date();
    const year=today.getFullYear(),month=today.getMonth();
    const lastDay=new Date(year,month+1,0).getDate();
    let wdl=0;
    for(let d=today.getDate();d<=lastDay;d++){const dt=new Date(year,month,d);const dow=dt.getDay();if(dow!==0&&dow!==6&&!hd.isHoliday(dt)) wdl++;}
    return wdl>0?Math.round(remaining/wdl):0;
  };

  const saveRecs=async n=>{setRecs(n);await S.set(`recs-${mKey()}`,n);};

  const closeOv=()=>{setOv(null);setPv(null);setOcr(null);setForm({amount:"",merchant:"",date:""});setOvSrc(null);setEditTarget(null);};

  const openEdit=(tx)=>{
    setEditTarget(tx);
    setForm({amount:String(tx.amount),merchant:tx.merchant||"",date:tx.date||""});
    setPv(recs[tx.id]||null);
    setOvSrc("edit");
    setOv("form");
    setCalDaySheet(null);
    setGalleryBS(null);
  };

  const handleFile=useCallback(async(file,src="camera")=>{
    if(!file) return; setFab(false);
    const reader=new FileReader();
    reader.onload=async e=>{
      const url=e.target.result; setPv(url); setOv("loading"); setOvSrc(src);
      try{
        const data=await ocr(url.split(",")[1],file.type||"image/jpeg"); setOcr(data);
        setForm({amount:data.amount?String(data.amount):"",merchant:data.merchant!=="알 수 없음"?data.merchant:"",date:data.date||todayMD()});
      }catch{setOcr({amount:null,merchant:"알 수 없음",date:null});setForm(f=>({...f,date:todayMD()}));}
      setOv("form");
    };
    reader.readAsDataURL(file);
  },[]);

  const handleSubmit=async()=>{
    const amt=parseInt(String(form.amount).replace(/,/g,""),10);
    if(!amt||amt<=0){ping("금액을 입력해주세요",true);return;}

    if(overlaySource==="edit"&&editTarget){
      await saveTx({...editTarget,amount:amt,merchant:form.merchant||editTarget.merchant,date:form.date||editTarget.date});
      closeOv();
    } else {
      const id=Date.now();
      const tx={id,amount:amt,merchant:form.merchant||"식당",date:form.date||todayMD(),image_url:null};
      setTxns(prev=>[tx,...prev]);
      if(preview&&overlaySource!=="manual"){
        const{data:{user:u}}=await supabase.auth.getUser();
        const c=await compress(preview); const url=await uploadReceipt(u.id,id,c);
        if(url){tx.image_url=url;setRecs(prev=>({...prev,[id]:url}));}
      }
      await GS.add(tx);
      ping(`${amt.toLocaleString()}원 추가됐어요`);
      closeOv();
    }
  };

  const saveTx=async updated=>{setTxns(prev=>prev.map(t=>t.id===updated.id?updated:t));await GS.update(updated);ping("수정됐어요");};
  const delTxn=async id=>{const nr={...recs};delete nr[id];setTxns(prev=>prev.filter(t=>t.id!==id));await GS.del(id);await saveRecs(nr);ping("삭제됐어요");};

  const dlRec=async id=>{
    const tx=txns.find(t=>t.id===id);
    try{const res=await fetch(recs[id]);const blob=await res.blob();const ext=blob.type.includes("png")?"png":"jpg";
      const url=URL.createObjectURL(blob);const a=document.createElement("a");
      a.href=url;a.download=`영수증_${tx?.merchant||id}.${ext}`;document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
    }catch{ping("다운로드 실패",true);}
  };
  const dlAll=async()=>{
    const targets=filteredTxns.filter(t=>recs[t.id]);
    if(!targets.length){ping("저장된 영수증이 없어요",true);return;}
    ping("ZIP 파일 생성 중...");
    const zip=new JSZip();
    for(const tx of targets){try{const res=await fetch(recs[tx.id]);const blob=await res.blob();const ext=blob.type.includes("png")?"png":"jpg";zip.file(`영수증_${tx.merchant||tx.id}_${tx.id}.${ext}`,blob);}catch{}}
    const blob=await zip.generateAsync({type:"blob"});const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;a.download=`영수증_${filterLabel}.zip`;document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
  };

  const bgStyle={minHeight:"100vh",background:"radial-gradient(circle at top left, rgba(255,255,255,.82), transparent 26%), linear-gradient(160deg,#EEF0FF 0%,#E8F0FA 40%,#E8F4FD 100%)",color:"#1e1b4b",fontFamily:"'Noto Sans KR',sans-serif",width:"100%",paddingBottom:120,position:"relative",overflowX:"hidden"};

  /* ── LOGIN ── */
  if(!user) return (
    <div style={{...bgStyle,display:"flex",flexDirection:"column",paddingBottom:0,minHeight:"100dvh"}}>
      <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"40px 20px 20px",textAlign:"center"}}>
        <CardSVG size={100}/>
        <div style={{fontSize:28,fontWeight:900,letterSpacing:"-1px",color:"#1e1b4b",marginTop:24,marginBottom:8}}>Welcome Back</div>
        <div style={{fontSize:14,color:"#94A3B8"}}>Sign in with your Google account</div>
      </div>
      <div style={{padding:"0 24px calc(40px + env(safe-area-inset-bottom,0px)) 24px"}}>
        <div className="glass-panel" style={{background:"linear-gradient(180deg, rgba(255,255,255,.74), rgba(255,255,255,.58))",backdropFilter:"blur(22px)",borderRadius:24,padding:"36px 28px",border:"1px solid rgba(255,255,255,0.95)",boxShadow:"0 20px 44px rgba(99,102,241,0.12)"}}>
        <div style={{fontSize:18,fontWeight:600,color:"#334155",marginBottom:24,textAlign:"center"}}>Sign in to get started</div>
        <button className="btn-press"
          onClick={()=>supabase.auth.signInWithOAuth({provider:"google",options:{redirectTo:window.location.origin}})}
          style={{display:"flex",alignItems:"center",gap:14,background:"linear-gradient(180deg, rgba(255,255,255,.92), rgba(255,255,255,.78))",color:"#1E293B",border:"1px solid rgba(255,255,255,.95)",borderRadius:16,padding:"15px 20px",fontSize:16,fontWeight:600,cursor:"pointer",boxShadow:"0 16px 30px rgba(148,163,184,.14)",width:"100%",justifyContent:"center",fontFamily:"inherit"}}>
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>
        </div>
      </div>
    </div>
  );

  /* ── HOME ── */
  const renderHome=()=>{
    const dailyBudget=getDailyBudget();
    return (
      <div style={{position:"relative",zIndex:1}}>
        <div style={{padding:"52px 20px 0"}}>
          {/* Hero Card */}
          <div className="glass-panel" style={{background:"linear-gradient(180deg, rgba(255,255,255,.78), rgba(255,255,255,.58))",borderRadius:24,padding:"22px",boxShadow:"0 18px 40px rgba(99,102,241,.12)",marginBottom:14}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12,color:"#94A3B8",marginBottom:4,fontWeight:500}}>이번 달 잔액</div>
                <div style={{fontSize:36,fontWeight:900,letterSpacing:"-1.5px",color:"#1e1b4b",lineHeight:1.1,marginBottom:6}}>
                  ₩{remaining.toLocaleString()}
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:6,marginTop:2}}>
                  <div style={{alignSelf:"flex-start",background:"#EEF2FF",borderRadius:20,padding:"5px 12px",fontSize:11,fontWeight:600,color:"#6366F1",whiteSpace:"nowrap"}}>
                    일일 사용 가능 금액 ₩{dailyBudget.toLocaleString()}
                  </div>
                  <div style={{alignSelf:"flex-start",background:pct>=90?"#FEF2F2":pct>=70?"#FFFBEB":"#F0FDF4",borderRadius:20,padding:"5px 12px",fontSize:11,fontWeight:600,color:pc}}>
                    사용률 {Math.round(pct)}%
                  </div>
                </div>
              </div>
              <CardSVG size={80}/>
            </div>
          </div>

          {/* Toggle */}
          <div className="glass-soft" style={{background:"rgba(255,255,255,.62)",borderRadius:14,padding:"4px",boxShadow:"0 12px 28px rgba(99,102,241,.10)",display:"flex",marginBottom:16}}>
            {[{id:"list",label:"리스트"},{id:"calendar",label:"달력"}].map(({id,label})=>(
              <button key={id} className="btn-press" onClick={()=>setHomeView(id)} style={{
                flex:1,padding:"10px",borderRadius:10,border:"none",cursor:"pointer",
                fontSize:14,fontWeight:homeView===id?700:500,
                background:homeView===id?"linear-gradient(150deg,#7C83FF,#6366F1)":"transparent",
                color:homeView===id?"#FFFFFF":"#64748B",transition:"all .2s",fontFamily:"inherit"}}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* List View */}
        {homeView==="list"&&(
          <div style={{padding:"0 20px 20px"}}>
            {thisMonthTxns.length===0&&(
              <div style={{textAlign:"center",padding:"56px 0"}}>
                <div style={{fontSize:40,marginBottom:12}}>🍽</div>
                <div style={{fontSize:14,fontWeight:600,color:"#64748B"}}>아직 기록이 없어요</div>
                <div style={{fontSize:12,color:"#94A3B8",marginTop:6}}>+ 버튼으로 추가해봐요</div>
              </div>
            )}
            {sortedDateKeys.map(dateKey=>{
              const group=groupedTxns[dateKey];
              const dayTotal=group.reduce((s,t)=>s+t.amount,0);
              return (
                <div key={dateKey} className="glass-soft" style={{background:"linear-gradient(180deg, rgba(255,255,255,.68), rgba(255,255,255,.52))",borderRadius:20,boxShadow:"0 14px 32px rgba(148,163,184,.12)",marginBottom:10,overflow:"hidden",border:"1px solid rgba(255,255,255,.86)"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 8px",background:"rgba(248,250,252,.72)"}}>
                    <span style={{fontSize:13,fontWeight:700,color:"#1A1A2E"}}>{formatDateHeader(dateKey)}</span>
                    <span style={{fontSize:13,color:"#EF4444"}}>₩{dayTotal.toLocaleString()}</span>
                  </div>
                  <div style={{padding:"0 16px"}}>
                    {group.map((tx,i)=>(
                      <div key={tx.id} className="tx-row fu" onClick={()=>openEdit(tx)} style={{
                        display:"flex",alignItems:"center",gap:10,padding:"13px 0",
                        borderBottom:i<group.length-1?"1px solid #F8F8FF":"none",cursor:"pointer",borderRadius:4}}>
                        <div style={{flex:1,minWidth:0,textAlign:"left"}}>
                          <div style={{fontSize:14,fontWeight:500,color:"#1e1b4b",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tx.merchant}</div>
                        </div>
                        <div style={{fontSize:14,fontWeight:600,color:"#1e1b4b",flexShrink:0}}>₩{tx.amount.toLocaleString()}</div>
                        <button onClick={e=>{e.stopPropagation();delTxn(tx.id);}} style={{
                          background:"none",border:"none",cursor:"pointer",color:"#CBD5E1",fontSize:18,lineHeight:1,padding:"2px 4px",flexShrink:0}}>×</button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Calendar View */}
        {homeView==="calendar"&&(
          <div style={{padding:"0 20px 20px"}}>
            <div className="glass-soft" style={{background:"linear-gradient(180deg, rgba(255,255,255,.68), rgba(255,255,255,.52))",borderRadius:20,boxShadow:"0 14px 32px rgba(148,163,184,.12)",padding:"16px 4px",border:"1px solid rgba(255,255,255,.86)"}}>
              <CalendarView txns={txns} onDayPress={(dateKey)=>setCalDaySheet(dateKey)}/>
            </div>
          </div>
        )}
      </div>
    );
  };

  /* ── GALLERY ── */
  const renderGallery=()=>{
    const galleryTxns=filteredTxns.filter(t=>recs[t.id]);
    const totalAmt=filteredTxns.reduce((s,t)=>s+t.amount,0);
    return (
      <div style={{position:"relative",zIndex:1,padding:"52px 20px 0"}}>
        {/* Month nav */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:2}}>
          <button className="btn-press" onClick={()=>setGalleryFilter(f=>f+1)} style={{
            background:"none",border:"none",cursor:"pointer",width:36,height:36,borderRadius:"50%",
            display:"flex",alignItems:"center",justifyContent:"center",color:"#64748B",fontSize:22,fontWeight:700}}>‹</button>
          <div style={{fontSize:20,fontWeight:800,color:"#1e1b4b",letterSpacing:"-0.5px"}}>{filterLabel}</div>
          <button className="btn-press" onClick={()=>setGalleryFilter(f=>Math.max(0,f-1))} style={{
            background:"none",border:"none",cursor:"pointer",width:36,height:36,borderRadius:"50%",
            display:"flex",alignItems:"center",justifyContent:"center",color:"#64748B",fontSize:22,fontWeight:700,
            opacity:galleryFilter===0?.3:1}}>›</button>
        </div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
          <div style={{fontSize:12,color:"#94A3B8"}}>이번 달 사용 금액 -₩{totalAmt.toLocaleString()}</div>
          {galleryTxns.length>0&&(
            <button onClick={dlAll} className="btn-press" style={{
              display:"flex",alignItems:"center",gap:5,padding:"6px 12px",borderRadius:99,
              background:"transparent",border:"1.5px solid #6366F1",color:"#6366F1",
              fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
              <IcDownload/>전체 다운로드
            </button>
          )}
        </div>

        {galleryTxns.length>0?(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            {galleryTxns.map(tx=>(
              <div key={tx.id} className="glass-soft" style={{background:"linear-gradient(180deg, rgba(255,255,255,.72), rgba(255,255,255,.56))",borderRadius:20,overflow:"hidden",position:"relative",boxShadow:"0 16px 34px rgba(148,163,184,.14)",border:"1px solid rgba(255,255,255,.86)"}}>
                <img src={recs[tx.id]} alt="" onClick={()=>dlRec(tx.id)}
                  style={{width:"100%",aspectRatio:"1",objectFit:"cover",display:"block",cursor:"pointer"}}/>
                <button onClick={e=>{e.stopPropagation();setGalleryBS(tx);}} style={{
                  position:"absolute",top:8,right:8,width:28,height:28,borderRadius:"50%",
                  background:"rgba(255,255,255,.82)",border:"1px solid rgba(255,255,255,.92)",
                  color:"#64748B",fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",
                  justifyContent:"center",fontWeight:700,letterSpacing:"1px",boxShadow:"0 12px 20px rgba(148,163,184,.14)"}}>···</button>
                <div style={{padding:"10px 12px"}}>
                  <div style={{fontSize:13,fontWeight:600,color:"#1e1b4b",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tx.merchant}</div>
                  <div style={{fontSize:12,color:"#6366F1",fontWeight:700,marginTop:2}}>₩{tx.amount.toLocaleString()}</div>
                  <div style={{fontSize:11,color:"#94A3B8",marginTop:1}}>{tx.date}</div>
                </div>
              </div>
            ))}
          </div>
        ):(
          <div style={{textAlign:"center",padding:"60px 0",color:"#94A3B8"}}>
            <div style={{fontSize:14,fontWeight:500}}>저장된 영수증이 없어요</div>
          </div>
        )}
      </div>
    );
  };

  /* ── SETTINGS ── */
  const renderSettings=()=>{
    const initial=(user?.email||"?")[0].toUpperCase();
    const name=user?.email?.split("@")[0]||"";
    const rowS={width:"100%",display:"flex",alignItems:"center",gap:14,padding:"14px 16px",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit"};
    const iconBox=(c)=>({width:36,height:36,borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",background:`${c}12`,border:`1px solid ${c}25`});
    return (
      <div style={{padding:"52px 20px 40px",position:"relative",zIndex:1}}>
        <div style={{fontSize:22,fontWeight:800,color:"#1e1b4b",marginBottom:20,textAlign:"left"}}>설정</div>
        <div className="glass-panel" style={{background:"linear-gradient(180deg, rgba(255,255,255,.74), rgba(255,255,255,.58))",borderRadius:24,padding:"20px",marginBottom:24,boxShadow:"0 18px 40px rgba(99,102,241,.12)",display:"flex",alignItems:"center",gap:16}}>
          <div style={{width:56,height:56,borderRadius:18,flexShrink:0,background:"linear-gradient(150deg,#818CF8,#6366F1)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 4px 16px rgba(99,102,241,.3)"}}>
            <span style={{fontSize:22,fontWeight:800,color:"#fff"}}>{initial}</span>
          </div>
          <div>
            <div style={{fontSize:16,fontWeight:700,color:"#1e1b4b"}}>{name}</div>
            <div style={{fontSize:12,color:"#94A3B8",marginTop:2}}>{user?.email}</div>
          </div>
        </div>

        <div style={{fontSize:11,fontWeight:600,color:"#94A3B8",letterSpacing:".6px",textTransform:"uppercase",marginBottom:8}}>프로젝트 설정</div>
        <div className="glass-soft" style={{background:"linear-gradient(180deg, rgba(255,255,255,.70), rgba(255,255,255,.56))",borderRadius:20,overflow:"hidden",marginBottom:20,boxShadow:"0 14px 32px rgba(148,163,184,.12)",border:"1px solid rgba(255,255,255,.88)"}}>
          <button onClick={()=>setOpenSection(openSection==="project"?null:"project")} style={{...rowS,borderBottom:openSection==="project"?"1px solid #F1F5F9":"none"}}>
            <div style={iconBox("#6366F1")}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3H8L2 7h20l-6-4z"/></svg></div>
            <div style={{flex:1,textAlign:"left"}}>
              <div style={{fontSize:14,fontWeight:500,color:"#1e1b4b"}}>프로젝트명</div>
              <div style={{fontSize:12,color:"#94A3B8",marginTop:1}}>{cfg.projectName||"미설정"}</div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
          </button>
          {openSection==="project"&&(
            <div style={{padding:"12px 16px 16px"}}>
              <FormInput value={cfg.projectName} onChange={v=>setCfg(c=>({...c,projectName:v}))} placeholder="우리 가계부"/>
              <div style={{display:"flex",gap:8,marginTop:4}}>
                <button className="btn-press" onClick={()=>setOpenSection(null)} style={{flex:1,padding:"11px",borderRadius:12,background:"#F1F5F9",border:"none",color:"#64748B",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>취소</button>
                <button className="btn-press" onClick={async()=>{const{data:{user:u}}=await supabase.auth.getUser();await US.save(cfg,u.id);setOpenSection(null);ping("저장됐어요");}} style={{flex:1,padding:"11px",borderRadius:12,background:"linear-gradient(150deg,#818CF8,#6366F1)",border:"none",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>저장</button>
              </div>
            </div>
          )}
        </div>

        <div style={{fontSize:11,fontWeight:600,color:"#94A3B8",letterSpacing:".6px",textTransform:"uppercase",marginBottom:8}}>데이터 관리</div>
        <div className="glass-soft" style={{background:"linear-gradient(180deg, rgba(255,255,255,.70), rgba(255,255,255,.56))",borderRadius:20,overflow:"hidden",marginBottom:20,boxShadow:"0 14px 32px rgba(148,163,184,.12)",border:"1px solid rgba(255,255,255,.88)"}}>
          <button onClick={()=>exportXlsx(txns,cfg.projectName)} style={rowS}>
            <div style={iconBox("#10B981")}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="11"/><polyline points="9 15 12 18 15 15"/></svg></div>
            <div style={{flex:1,textAlign:"left"}}><div style={{fontSize:14,fontWeight:500,color:"#1e1b4b"}}>액셀 다운로드</div></div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </div>

        <div style={{fontSize:11,fontWeight:600,color:"#94A3B8",letterSpacing:".6px",textTransform:"uppercase",marginBottom:8}}>계정</div>
        <div className="glass-soft" style={{background:"linear-gradient(180deg, rgba(255,255,255,.70), rgba(255,255,255,.56))",borderRadius:20,overflow:"hidden",marginBottom:20,boxShadow:"0 14px 32px rgba(148,163,184,.12)",border:"1px solid rgba(255,255,255,.88)"}}>
          <button onClick={()=>{supabase.auth.signOut();setUser(null);setTxns([]);}} style={rowS}>
            <div style={iconBox("#EF4444")}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg></div>
            <div style={{flex:1,textAlign:"left"}}><div style={{fontSize:14,fontWeight:500,color:"#EF4444"}}>로그아웃</div></div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </div>
        <div style={{textAlign:"center",marginTop:12}}><p style={{color:"#CBD5E1",fontSize:11}}>ExpenseFlow v1.0.0 · © 2026</p></div>
      </div>
    );
  };

  const changeTab=(t)=>{if(t!==tab) window.history.pushState({tab:t},"");setTab(t);setFab(false);};
  const fabRight=`max(20px, calc((100vw - 430px) / 2 + 20px))`;

  return (
    <div style={bgStyle}>
      <Toast toast={toast}/>

      {/* Calendar Day Sheet */}
      {calDaySheet&&(
        <CalendarDaySheet dateKey={calDaySheet} txns={txns} recs={recs} onClose={()=>setCalDaySheet(null)} onEdit={openEdit}/>
      )}

      {/* Gallery bottom sheet */}
      {galleryBottomSheet&&(
        <>
          <div onClick={()=>setGalleryBS(null)} style={{position:"fixed",inset:0,zIndex:300,background:"rgba(26,26,46,.35)",backdropFilter:"blur(8px)"}}/>
          <div className="glass-panel" style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:430,
            background:"linear-gradient(180deg, rgba(255,255,255,.82), rgba(255,255,255,.70))",borderRadius:"24px 24px 0 0",padding:"12px 20px",
            paddingBottom:"calc(20px + env(safe-area-inset-bottom, 0px))",
            zIndex:301,animation:"slideUp .22s ease",boxShadow:"0 -20px 44px rgba(99,102,241,.14)"}}>
            <div style={{width:36,height:4,borderRadius:99,background:"#E2E8F0",margin:"0 auto 16px"}}/>
            <div style={{fontSize:14,fontWeight:600,color:"#94A3B8",marginBottom:14,textAlign:"center"}}>{galleryBottomSheet.merchant}</div>
            <button onClick={()=>{openEdit(galleryBottomSheet);}} style={{width:"100%",padding:"15px",borderRadius:16,background:"#EEF2FF",border:"none",color:"#6366F1",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"inherit",marginBottom:10}}>수정</button>
            <button onClick={()=>{delTxn(galleryBottomSheet.id);setGalleryBS(null);}} style={{width:"100%",padding:"15px",borderRadius:16,background:"#FFF5F5",border:"none",color:"#EF4444",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>삭제</button>
          </div>
        </>
      )}

      {/* FAB menu overlay */}
      {fabOpen&&<div onClick={()=>setFab(false)} style={{position:"fixed",inset:0,zIndex:50,background:"rgba(26,26,46,.25)",backdropFilter:"blur(8px)"}}/>}

      {/* Overlay pages */}
      {overlay==="loading"&&<LoadingScreen preview={preview}/>}
      {overlay==="form"&&(
        <FormPage source={overlaySource} preview={preview} ocrRes={ocrRes} form={form} setForm={setForm} onSubmit={handleSubmit} onBack={closeOv}/>
      )}

      {!overlay&&tab==="home"&&renderHome()}
      {!overlay&&tab==="gallery"&&renderGallery()}
      {!overlay&&tab==="settings"&&renderSettings()}

      {/* FAB */}
      {!overlay&&tab!=="settings"&&(
        <>
          {fabOpen&&(
            <div style={{position:"fixed",bottom:180,right:fabRight,display:"flex",flexDirection:"column",gap:10,alignItems:"flex-end",zIndex:60}}>
              {[
                {Icon:IcCamera,label:"영수증 촬영",fn:()=>camRef.current?.click()},
                {Icon:IcImage,label:"사진 업로드",fn:()=>galRef.current?.click()},
                {Icon:IcPencil,label:"직접 등록",fn:()=>{setForm({amount:"",merchant:"",date:todayMD()});setOvSrc("manual");setOv("form");setFab(false);}},
              ].map((opt,i)=>(
                <button key={opt.label} onClick={()=>{opt.fn();setFab(false);}} className="btn-press glass-soft" style={{
                  display:"flex",alignItems:"center",gap:10,background:"linear-gradient(180deg, rgba(255,255,255,.88), rgba(255,255,255,.72))",
                  border:"1px solid rgba(255,255,255,.94)",borderRadius:99,padding:"10px 16px 10px 10px",
                  fontSize:13,fontWeight:600,color:"#1e1b4b",cursor:"pointer",
                  boxShadow:"0 18px 34px rgba(99,102,241,.14)",fontFamily:"inherit",
                  animation:"fabPop .18s ease both",animationDelay:`${i*.05}s`,whiteSpace:"nowrap"}}>
                  <div style={{width:34,height:34,borderRadius:"50%",background:"linear-gradient(150deg,#8B93FF,#6366F1)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:"0 10px 18px rgba(99,102,241,.22)"}}>
                    <opt.Icon/>
                  </div>
                  {opt.label}
                </button>
              ))}
            </div>
          )}
          <div style={{position:"fixed",bottom:108,right:fabRight,zIndex:80}}>
            <button className="btn-press" onClick={()=>setFab(p=>!p)} style={{
              width:56,height:56,borderRadius:"50%",background:"linear-gradient(150deg,#8B93FF,#6366F1)",
              border:"none",fontSize:26,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",
              boxShadow:"0 18px 38px rgba(99,102,241,.34)",transition:"transform .25s",
              transform:fabOpen?"rotate(45deg)":"rotate(0deg)",color:"#fff"}}>
              {fabOpen?"×":"+"}
            </button>
          </div>
        </>
      )}

      {!overlay&&<TabBar tab={tab} setTab={changeTab}/>}
      <input ref={camRef} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={e=>handleFile(e.target.files[0],"camera")}/>
      <input ref={galRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>handleFile(e.target.files[0],"gallery")}/>
    </div>
  );
}
