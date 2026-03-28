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
  l.href = "https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Noto+Sans+KR:wght@400;500;600;700&display=swap";
  document.head.appendChild(l);
}
if (!document.querySelector("#css3")) {
  const s = document.createElement("style"); s.id = "css3";
  s.textContent = `
    *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
    input,button{font-family:'Noto Sans KR',sans-serif}
    input[type=number]::-webkit-outer-spin-button,input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
    input[type=date]::-webkit-calendar-picker-indicator{opacity:0.4}
    @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
    @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
    @keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
    @keyframes toast{from{opacity:0;transform:translateX(-50%) translateY(10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
    @keyframes fabPop{from{opacity:0;transform:scale(.85) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}
    .fu{animation:fadeUp .35s cubic-bezier(.22,1,.36,1) both}
    .tx-row:active{background:#EEEEFF!important}
    .btn-press:active{transform:scale(.96)}
    @media(min-width:768px){#root>div{max-width:430px!important;margin:0 auto!important;box-shadow:0 0 60px rgba(99,102,241,.15)}}
  `;
  document.head.appendChild(s);
}

const LIMIT = 200_000;
const mKey = (offset=0) => { const d=new Date(); d.setMonth(d.getMonth()-offset); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; };
const monthLabel = (offset=0) => { const d=new Date(); d.setMonth(d.getMonth()-offset); return `${d.getFullYear()}년 ${d.getMonth()+1}월`; };
const todayMD = () => { const d=new Date(); return `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}`; };
const pctColor = p => p>=90?"#EF4444":p>=70?"#F59E0B":"#10B981";

const formatDateHeader = (dateStr) => {
  if (!dateStr) return dateStr;
  const [mm, dd] = dateStr.split("/");
  const yr = new Date().getFullYear();
  const d = new Date(yr, parseInt(mm)-1, parseInt(dd));
  const days = ["일","월","화","수","목","금","토"];
  return `${parseInt(mm)}월 ${parseInt(dd)}일 (${days[d.getDay()]})`;
};

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
    await supabase.from("transactions").insert({
      id:tx.id, user_id:user.id, amount:tx.amount,
      merchant:tx.merchant, date:tx.date, image_url:tx.image_url||null
    });
  },
  del: async id => { await supabase.from("transactions").delete().eq("id",id); },
  update: async tx => {
    await supabase.from("transactions").update({
      amount:tx.amount, merchant:tx.merchant, date:tx.date
    }).eq("id",tx.id);
  },
};
const US = {
  load: async () => {
    const { data:{ user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase.from("user_settings").select("*").eq("user_id",user.id).single();
    return data;
  },
  save: async (cfg, userId) => {
    await supabase.from("user_settings").upsert({
      user_id: userId,
      project_name: cfg.projectName||"",
      email: cfg.email||"",
      threshold: cfg.threshold||50000,
      updated_at: new Date().toISOString()
    });
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
    const base64 = dataUrl.split(",")[1];
    const mime = dataUrl.split(";")[0].split(":")[1];
    const ext = mime === "image/png" ? "png" : "jpg";
    const path = `${userId}/${txId}.${ext}`;
    const blob = await fetch(dataUrl).then(r=>r.blob());
    const { error } = await supabase.storage.from("receipts").upload(path, blob, {contentType:mime, upsert:true});
    if (error) return null;
    const { data } = supabase.storage.from("receipts").getPublicUrl(path);
    return data.publicUrl;
  } catch { return null; }
};

async function ocr(b64, mt) {
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages",{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "x-api-key":import.meta.env.VITE_ANTHROPIC_API_KEY,
        "anthropic-version":"2023-06-01",
        "anthropic-dangerous-direct-browser-access":"true",
      },
      body:JSON.stringify({
        model:"claude-haiku-4-5-20251001", max_tokens:200,
        system:`Receipt parser. Return ONLY valid JSON: {"amount":number_or_null,"merchant":"string","date":"MM/DD"}. amount=total KRW integer. merchant=Korean store name or "알 수 없음". date=MM/DD or null.`,
        messages:[{role:"user",content:[
          {type:"image",source:{type:"base64",media_type:mt,data:b64}},
          {type:"text",text:"총 결제금액, 가맹점명, 결제일자 추출"}
        ]}]
      })
    });
    const d=await r.json();
    const t=d.content?.find(b=>b.type==="text")?.text||"{}";
    return JSON.parse(t.replace(/```json|```/g,"").trim());
  } catch { return {amount:null,merchant:"알 수 없음",date:null}; }
}

function exportXlsx(txns, projectName) {
  const wb=XLSX.utils.book_new(); const ws={};
  const sc=(addr,v)=>{ ws[addr]={v,t:typeof v==="number"?"n":"s"}; };
  sc("A1","법인카드 지출 결의서");
  sc("A3","일자 :                                                                           성명 :  (인)");
  sc("A4","아래와 같이 지출 결의서를 제출하오니 확인 바랍니다.");
  sc("A5","=== 아     래 ==="); sc("A6","1. 개인 경비 및 지원금");
  sc("A7","프로젝트명"); sc("D7","항목"); sc("E7","일자"); sc("F7","금액"); sc("G7","비고");
  const proj=projectName||"";
  for(let i=0;i<22;i++){
    const row=8+i; sc(`A${row}`,proj); sc(`D${row}`,"식비");
    if(i<txns.length){ sc(`E${row}`,txns[i].date||""); ws[`F${row}`]={v:txns[i].amount,t:"n"}; }
  }
  sc("A30","소계"); ws["F30"]={f:"SUM(F8:F29)",t:"n"};
  const merges=[
    {s:{r:0,c:0},e:{r:1,c:6}},{s:{r:2,c:0},e:{r:2,c:6}},{s:{r:3,c:0},e:{r:3,c:6}},
    {s:{r:4,c:0},e:{r:4,c:6}},{s:{r:5,c:0},e:{r:5,c:6}},{s:{r:6,c:0},e:{r:6,c:2}},
  ];
  for(let i=0;i<22;i++) merges.push({s:{r:7+i,c:0},e:{r:7+i,c:2}});
  merges.push({s:{r:29,c:0},e:{r:29,c:2}});
  ws["!merges"]=merges; ws["!ref"]="A1:G30";
  ws["!cols"]=[{wch:8},{wch:8},{wch:8},{wch:8},{wch:12},{wch:12},{wch:12}];
  XLSX.utils.book_append_sheet(wb,ws,"수입지출계획");
  const d=new Date();
  XLSX.writeFile(wb,`${d.getMonth()+1}월_지출결의서_${proj||"식대"}.xlsx`);
}

/* ── SVG Icons ── */
const IcCamera = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/>
  </svg>
);
const IcImage = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>
  </svg>
);
const IcPencil = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);
const IcDownload = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3v13M5 13l7 7 7-7"/><path d="M3 20h18"/>
  </svg>
);
const IcChevronUp = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="4 15 12 7 20 15"/>
  </svg>
);
const IcChevronDown = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="4 9 12 17 20 9"/>
  </svg>
);

const IconHome = ({active}) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active?"#6366F1":"#94A3B8"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/><path d="M9 21V12h6v9"/>
  </svg>
);
const IconGallery = ({active}) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active?"#6366F1":"#94A3B8"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>
  </svg>
);
const IconSettings = ({active}) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active?"#6366F1":"#94A3B8"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
  </svg>
);

/* ── Credit Card SVG (indigo) ── */
const CardSVG = ({size=72}) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" style={{animation:"float 3.5s ease-in-out infinite"}}>
    <defs>
      <linearGradient id="cardG1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#818CF8"/>
        <stop offset="100%" stopColor="#6366F1"/>
      </linearGradient>
      <radialGradient id="cardG2" cx="30%" cy="20%" r="60%">
        <stop offset="0%" stopColor="white" stopOpacity=".5"/>
        <stop offset="100%" stopColor="white" stopOpacity="0"/>
      </radialGradient>
      <filter id="cardF1" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="8" stdDeviation="10" floodColor="#6366F1" floodOpacity=".4"/>
      </filter>
    </defs>
    <g transform="rotate(-12 50 50)" filter="url(#cardF1)">
      <rect x="8" y="20" width="84" height="56" rx="10" fill="url(#cardG1)"/>
      <ellipse cx="36" cy="32" rx="24" ry="11" fill="url(#cardG2)" transform="rotate(-8 36 32)"/>
      <rect x="8" y="20" width="84" height="56" rx="10" fill="none" stroke="rgba(255,255,255,.3)" strokeWidth="1.2"/>
      <rect x="16" y="30" width="15" height="11" rx="3" fill="#E8C96A" opacity=".95"/>
      {[0,1,2,3].map(g=>([0,1,2,3].map(d=>(<circle key={`${g}${d}`} cx={16+g*15+d*3} cy={54} r="1.1" fill="white" opacity=".65"/>))))}
      <circle cx="70" cy="62" r="6" fill="#C7D2FE" opacity=".9"/>
      <circle cx="78" cy="62" r="6" fill="#A5B4FC" opacity=".9"/>
    </g>
  </svg>
);

/* ── Toast ── */
const Toast = ({toast}) => toast?(
  <div style={{
    position:"fixed", bottom:100, left:"50%", transform:"translateX(-50%)",
    zIndex:9999,
    background:toast.err?"rgba(239,68,68,.92)":"rgba(99,102,241,.92)",
    backdropFilter:"blur(12px)",color:"#fff",padding:"10px 22px",
    borderRadius:99,fontSize:13,fontWeight:700,whiteSpace:"nowrap",
    boxShadow:"0 8px 32px rgba(99,102,241,.3)",animation:"toast .25s ease both",
    border:"1px solid rgba(255,255,255,.2)"}}>
    {toast.msg}
  </div>
):null;

/* ── Light Input ── */
const GlassInput = ({label,value,onChange,type="text",placeholder,big,hint}) => (
  <div style={{marginBottom:14}}>
    {label&&<div style={{fontSize:12,color:"#64748B",marginBottom:6,fontWeight:500,textAlign:"left"}}>{label}</div>}
    <input type={type} value={value} placeholder={placeholder}
      onChange={e=>onChange(e.target.value)}
      style={{
        width:"100%",
        background:"#FFFFFF",
        border:"1px solid #E2E8F0",
        borderRadius:12,
        padding:big?"14px 16px":"12px 16px",
        fontSize:big?22:14,
        fontWeight:big?700:400,
        color:"#1e1b4b",
        outline:"none",
        transition:"border-color .2s",
        fontFamily:"inherit",
      }}
      onFocus={e=>e.target.style.borderColor="#6366F1"}
      onBlur={e=>e.target.style.borderColor="#E2E8F0"}/>
    {hint&&<div style={{fontSize:11,color:"#94A3B8",marginTop:4,textAlign:"left"}}>{hint}</div>}
  </div>
);

/* ── Primary Button ── */
const PBtn = ({onClick,children,secondary,small,danger}) => (
  <button className="btn-press" onClick={onClick} style={{
    width:"100%",borderRadius:14,padding:small?"11px":"15px",
    fontSize:small?13:14,fontWeight:700,cursor:"pointer",transition:"transform .15s",
    fontFamily:"'Noto Sans KR',sans-serif",
    ...(danger?{
      background:"rgba(239,68,68,.08)",border:"1px solid rgba(239,68,68,.2)",color:"#EF4444"
    }:secondary?{
      background:"#F1F5F9",border:"1px solid #E2E8F0",color:"#64748B"
    }:{
      background:"linear-gradient(150deg,#818CF8,#6366F1)",
      border:"none",color:"#fff",
      boxShadow:"0 4px 20px rgba(99,102,241,.35)"
    })
  }}>{children}</button>
);

/* ── Section Header ── */
const SHead = ({children}) => (
  <div style={{fontSize:12,fontWeight:600,color:"#94A3B8",letterSpacing:".6px",
    textTransform:"uppercase",marginBottom:8,textAlign:"left"}}>{children}</div>
);

/* ── TxRow ── */
function TxRow({tx,onDel,onSave,delay=0,last=false}) {
  const [editing,setEditing]=useState(false);
  const [amt,setAmt]=useState(String(tx.amount));
  const [merch,setMerch]=useState(tx.merchant);
  const [date,setDate]=useState(tx.date||"");

  if(editing) return (
    <div className="fu" style={{
      background:"#F8F8FF",borderRadius:16,padding:"16px",marginBottom:8,
      animationDelay:`${delay}s`,border:"1px solid #E0E0FF"
    }}>
      <div style={{fontSize:12,color:"#6366F1",fontWeight:700,marginBottom:10}}>내역 수정</div>
      <GlassInput
        label="금액 (원)"
        value={amt ? parseInt(amt,10).toLocaleString() : ""}
        onChange={v => setAmt(v.replace(/[^0-9]/g,""))}
        type="text"
        placeholder="13,500"
        big
      />
      <GlassInput label="가맹점명" value={merch} onChange={setMerch} placeholder="식당 이름"/>
      <GlassInput label="일자 (MM/DD)" value={date} onChange={setDate} placeholder="03/18"/>
      <div style={{display:"flex",gap:8}}>
        <PBtn small secondary onClick={()=>setEditing(false)}>취소</PBtn>
        <PBtn small onClick={()=>{onSave({...tx,amount:parseInt(amt)||tx.amount,merchant:merch||tx.merchant,date:date||tx.date});setEditing(false);}}>저장</PBtn>
      </div>
    </div>
  );

  return (
    <div className="tx-row fu" onClick={()=>setEditing(true)} style={{
      display:"flex",alignItems:"center",gap:12,
      padding:"13px 0",
      borderBottom:last?"none":"1px solid #F1F5F9",
      transition:"background .15s",
      animationDelay:`${delay}s`,cursor:"pointer",
    }}>
      <div style={{flex:1,minWidth:0,textAlign:"left"}}>
        <div style={{fontSize:14,fontWeight:500,color:"#1e1b4b",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tx.merchant}</div>
      </div>
      <div style={{fontSize:14,fontWeight:600,color:"#1e1b4b",flexShrink:0}}>
        ₩{tx.amount.toLocaleString()}
      </div>
      <button onClick={e=>{e.stopPropagation();onDel();}} style={{
        background:"none",border:"none",cursor:"pointer",fontSize:16,
        color:"#CBD5E1",lineHeight:1,marginLeft:2,
        width:24,height:24,display:"flex",alignItems:"center",justifyContent:"center",
        borderRadius:6,flexShrink:0
      }}>×</button>
    </div>
  );
}

/* ── Bottom Tab Bar ── */
const TabBar = ({tab,setTab}) => (
  <div style={{
    position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",
    width:"100%",maxWidth:430,display:"flex",zIndex:100,
    background:"#FFFFFF",
    borderTop:"1px solid #F1F5F9",
    paddingBottom:"env(safe-area-inset-bottom,8px)",
    padding:"10px 8px env(safe-area-inset-bottom,10px)",
  }}>
    {[
      {id:"home",label:"홈",Icon:IconHome},
      {id:"gallery",label:"앨범",Icon:IconGallery},
      {id:"settings",label:"설정",Icon:IconSettings},
    ].map(({id,label,Icon})=>(
      <button key={id} className="btn-press" onClick={()=>setTab(id)} style={{
        flex:1,background:"none",border:"none",cursor:"pointer",
        padding:"6px 0 4px",display:"flex",flexDirection:"column",alignItems:"center",gap:3,
        borderRadius:12,transition:"background .2s",
      }}>
        <Icon active={tab===id}/>
        <span style={{
          fontSize:10,fontWeight:tab===id?700:400,
          color:tab===id?"#6366F1":"#94A3B8",
          transition:"color .2s"
        }}>{label}</span>
      </button>
    ))}
  </div>
);

/* ── Gallery Edit Overlay ── */
function GalleryEditOverlay({tx, recs, onSave, onClose}) {
  const [amt,setAmt]=useState(String(tx.amount));
  const [merch,setMerch]=useState(tx.merchant);
  const [date,setDate]=useState(tx.date||"");

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(30,27,75,.4)",backdropFilter:"blur(8px)",zIndex:400,
      display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
      <div style={{width:"100%",maxWidth:430,background:"#FFFFFF",
        borderRadius:"24px 24px 0 0",padding:"24px 20px 48px",animation:"slideUp .25s ease"}}>
        <div style={{width:36,height:4,borderRadius:99,background:"#E2E8F0",margin:"0 auto 20px"}}/>
        <div style={{fontSize:16,fontWeight:700,color:"#1e1b4b",marginBottom:16}}>내역 수정</div>
        {recs[tx.id]&&(
          <div style={{width:"100%",height:140,borderRadius:16,overflow:"hidden",marginBottom:16}}>
            <img src={recs[tx.id]} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
          </div>
        )}
        <GlassInput
          label="금액 (원)"
          value={amt ? parseInt(amt,10).toLocaleString() : ""}
          onChange={v => setAmt(v.replace(/[^0-9]/g,""))}
          type="text"
          placeholder="13,500"
          big
        />
        <GlassInput label="가맹점명" value={merch} onChange={setMerch} placeholder="식당 이름"/>
        <GlassInput label="일자 (MM/DD)" value={date} onChange={setDate} placeholder="03/18"/>
        <div style={{display:"flex",gap:8}}>
          <PBtn small secondary onClick={onClose}>취소</PBtn>
          <PBtn small onClick={()=>{onSave({...tx,amount:parseInt(amt)||tx.amount,merchant:merch||tx.merchant,date:date||tx.date});onClose();}}>저장</PBtn>
        </div>
      </div>
    </div>
  );
}

/* ── Calendar View ── */
function CalendarView({txns}) {
  const [calDate,setCalDate]=useState(()=>{const d=new Date();return new Date(d.getFullYear(),d.getMonth(),1);});
  const year=calDate.getFullYear(), month=calDate.getMonth();
  const today=new Date();
  const firstDay=calDate.getDay();
  const daysInMonth=new Date(year,month+1,0).getDate();

  const dayTotals={};
  txns.forEach(tx=>{
    if(!tx.date) return;
    const [mm,dd]=tx.date.split("/");
    if(parseInt(mm)===month+1) {
      const day=parseInt(dd);
      dayTotals[day]=(dayTotals[day]||0)+tx.amount;
    }
  });

  const cells=[];
  for(let i=0;i<firstDay;i++) cells.push(null);
  for(let i=1;i<=daysInMonth;i++) cells.push(i);

  const isToday=(day)=>day===today.getDate()&&month===today.getMonth()&&year===today.getFullYear();

  const navBtn = {
    background:"none",border:"none",cursor:"pointer",
    width:32,height:32,borderRadius:"50%",
    display:"flex",alignItems:"center",justifyContent:"center",
    color:"#64748B",fontSize:18,fontWeight:700,
  };

  return (
    <div style={{padding:"0 20px 20px"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
        <button style={navBtn} onClick={()=>setCalDate(new Date(year,month-1,1))}>‹</button>
        <span style={{fontSize:16,fontWeight:700,color:"#1e1b4b"}}>{year}년 {month+1}월</span>
        <button style={navBtn} onClick={()=>setCalDate(new Date(year,month+1,1))}>›</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",textAlign:"center",marginBottom:8}}>
        {["일","월","화","수","목","금","토"].map((d,i)=>(
          <div key={d} style={{fontSize:11,color:i===0?"#EF4444":i===6?"#6366F1":"#94A3B8",padding:"4px 0",fontWeight:500}}>{d}</div>
        ))}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",rowGap:4}}>
        {cells.map((day,i)=>(
          <div key={i} style={{minHeight:48,padding:"2px 0",textAlign:"center"}}>
            {day&&(
              <>
                <div style={{
                  width:28,height:28,borderRadius:"50%",
                  background:isToday(day)?"#6366F1":"transparent",
                  color:isToday(day)?"#fff":i%7===0?"#EF4444":i%7===6?"#6366F1":"#1e1b4b",
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:13,fontWeight:isToday(day)?700:400,
                  margin:"0 auto",
                }}>{day}</div>
                {dayTotals[day]&&(
                  <div style={{fontSize:9,color:"#6366F1",fontWeight:600,marginTop:1,lineHeight:1.2}}>
                    {dayTotals[day]>=10000
                      ?`${(dayTotals[day]/1000).toFixed(0)}k`
                      :`${dayTotals[day].toLocaleString()}`}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ══ MAIN APP ══ */
export default function App() {
  const [txns,setTxns]=useState([]);
  const [recs,setRecs]=useState({});
  const [cfg,setCfg]=useState({email:"",threshold:50000,projectName:""});
  const [tab,setTab]=useState("home");
  const [homeView,setHomeView]=useState("list");
  const [overlay,setOv]=useState(null);
  const [fabOpen,setFab]=useState(false);
  const [preview,setPv]=useState(null);
  const [ocrRes,setOcr]=useState(null);
  const [form,setForm]=useState({amount:"",merchant:"",date:""});
  const [toast,setToast]=useState(null);
  const [user,setUser]=useState(null);
  const [galleryFilter,setGalleryFilter]=useState(0);
  const [openSection,setOpenSection]=useState(null);
  const [bottomSheet,setBottomSheet]=useState(null);
  const [galleryEdit,setGalleryEdit]=useState(null);
  const camRef=useRef(); const galRef=useRef();

  useEffect(()=>{
    supabase.auth.getUser().then(({data:{user}})=>{
      setUser(user);
      if(user){
        Promise.all([GS.load(), US.load()]).then(([rows, settings])=>{
          if(rows.length) {
            setTxns(rows.map(row=>({
              id:Number(row.id),amount:Number(row.amount),
              merchant:row.merchant,date:row.date,
              image_url:row.image_url||null
            })));
            const recsFromDb = {};
            rows.forEach(row=>{ if(row.image_url) recsFromDb[Number(row.id)]=row.image_url; });
            setRecs(recsFromDb);
          }
          if(settings) setCfg({
            projectName: settings.project_name||"",
            email: settings.email||"",
            threshold: settings.threshold||50000,
          });
        });
      }
    });
    supabase.auth.onAuthStateChange((_,session)=>setUser(session?.user||null));
  },[]);

  useEffect(()=>{
    const onBack=()=>{ if(tab!=="home") setTab("home"); };
    window.addEventListener("popstate",onBack);
    return ()=>window.removeEventListener("popstate",onBack);
  },[tab]);

  const ping=(msg,err=false)=>{setToast({msg,err});setTimeout(()=>setToast(null),2400);};
  const filterLabel=monthLabel(galleryFilter);
  const filteredTxns=txns.filter(tx=>{
    if(!tx.date) return galleryFilter===0;
    const [mm]=tx.date.split("/");
    const d=new Date(); d.setMonth(d.getMonth()-galleryFilter);
    return parseInt(mm)===d.getMonth()+1;
  }).sort((a,b)=>{const[am,ad]=(a.date||"").split("/");const[bm,bd]=(b.date||"").split("/");return (parseInt(bm)*100+parseInt(bd))-(parseInt(am)*100+parseInt(ad));});

  const thisMonthTxns=txns.filter(t=>{const[mm]=(t.date||"").split("/");return parseInt(mm)===new Date().getMonth()+1;}).sort((a,b)=>{const[am,ad]=(a.date||"").split("/");const[bm,bd]=(b.date||"").split("/");return (parseInt(bm)*100+parseInt(bd))-(parseInt(am)*100+parseInt(ad));});
  const used=thisMonthTxns.reduce((s,t)=>s+t.amount,0);
  const remaining=LIMIT-used;
  const pct=Math.min(100,(used/LIMIT)*100);
  const pc=pctColor(pct);

  // Date-grouped transactions for list view
  const groupedTxns = {};
  thisMonthTxns.forEach(tx=>{
    const key=tx.date||"미상";
    if(!groupedTxns[key]) groupedTxns[key]=[];
    groupedTxns[key].push(tx);
  });
  const sortedDateKeys=Object.keys(groupedTxns).sort((a,b)=>{
    const[am,ad]=a.split("/"); const[bm,bd]=b.split("/");
    return (parseInt(bm)*100+parseInt(bd))-(parseInt(am)*100+parseInt(ad));
  });

  // Daily budget calc
  const getDailyBudget=()=>{
    const hd=new Holidays('KR');
    const today=new Date();
    const year=today.getFullYear(), month=today.getMonth();
    const lastDay=new Date(year,month+1,0).getDate();
    let workingDaysLeft=0;
    for(let d=today.getDate();d<=lastDay;d++){
      const date=new Date(year,month,d);
      const dow=date.getDay();
      if(dow!==0&&dow!==6&&!hd.isHoliday(date)) workingDaysLeft++;
    }
    return workingDaysLeft>0?Math.round(remaining/workingDaysLeft):0;
  };

  const saveRecs=async n=>{setRecs(n);await S.set(`recs-${mKey()}`,n);};
  const closeOv=()=>{setOv(null);setPv(null);setOcr(null);setForm({amount:"",merchant:"",date:""});};

  const handleFile=useCallback(async file=>{
    if(!file) return; setFab(false);
    const reader=new FileReader();
    reader.onload=async e=>{
      const url=e.target.result; setPv(url); setOv("loading");
      try{
        const data=await ocr(url.split(",")[1],file.type||"image/jpeg");
        setOcr(data);
        setForm({amount:data.amount?String(data.amount):"",merchant:data.merchant!=="알 수 없음"?data.merchant:"",date:data.date||todayMD()});
      }catch{setOcr({amount:null,merchant:"알 수 없음",date:null});setForm(f=>({...f,date:todayMD()}));}
      setOv("confirm");
    };
    reader.readAsDataURL(file);
  },[]);

  const addTxn=async()=>{
    const amt=parseInt(form.amount.replace(/,/g,""),10);
    if(!amt||amt<=0){ping("금액을 입력해주세요",true);return;}
    const id=Date.now();
    const tx={id,amount:amt,merchant:form.merchant||"식당",date:form.date||todayMD(),image_url:null};
    const next=[tx,...txns];
    setTxns(next);
    if(preview){
      const { data:{ user:u } } = await supabase.auth.getUser();
      const c = await compress(preview);
      const url = await uploadReceipt(u.id, id, c);
      if(url){ tx.image_url=url; setRecs(prev=>({...prev,[id]:url})); }
    }
    await GS.add(tx);
    ping(`${amt.toLocaleString()}원 추가됐어요`);
    closeOv();
  };

  const saveTx=async updated=>{
    setTxns(prev=>prev.map(t=>t.id===updated.id?updated:t));
    await GS.update(updated);
    ping("수정됐어요");
  };

  const delTxn=async id=>{
    const nr={...recs};delete nr[id];
    setTxns(prev=>prev.filter(t=>t.id!==id));
    await GS.del(id);
    await saveRecs(nr);
    ping("삭제됐어요");
  };

  const dlRec=async id=>{
    const tx=txns.find(t=>t.id===id);
    try{
      const res=await fetch(recs[id]);
      const blob=await res.blob();
      const ext=blob.type.includes("png")?"png":"jpg";
      const url=URL.createObjectURL(blob);
      const a=document.createElement("a");
      a.href=url;a.download=`영수증_${tx?.merchant||id}.${ext}`;
      document.body.appendChild(a);a.click();
      document.body.removeChild(a);URL.revokeObjectURL(url);
    }catch{ping("다운로드 실패",true);}
  };
  const dlAll=async()=>{
    const targets=filteredTxns.filter(t=>recs[t.id]);
    if(!targets.length){ping("저장된 영수증이 없어요",true);return;}
    ping("ZIP 파일 생성 중...");
    const zip=new JSZip();
    for(const tx of targets){
      try{
        const res=await fetch(recs[tx.id]);
        const blob=await res.blob();
        const ext=blob.type.includes("png")?"png":"jpg";
        zip.file(`영수증_${tx.merchant||tx.id}_${tx.id}.${ext}`,blob);
      }catch{}
    }
    const blob=await zip.generateAsync({type:"blob"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;a.download=`영수증_${filterLabel}.zip`;
    document.body.appendChild(a);a.click();
    document.body.removeChild(a);URL.revokeObjectURL(url);
  };

  const bgStyle={
    minHeight:"100vh",
    background:"linear-gradient(160deg,#EEF0FF 0%,#E8F0FA 40%,#E8F4FD 100%)",
    color:"#1e1b4b",
    fontFamily:"'Noto Sans KR',sans-serif",
    width:"100%",paddingBottom:90,position:"relative",overflowX:"hidden",
  };

  /* ── LOGIN ── */
  if(!user) return (
    <div style={{...bgStyle,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"space-between",paddingBottom:0,minHeight:"100vh"}}>
      <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"40px 32px 20px",textAlign:"center"}}>
        <CardSVG size={110}/>
        <div style={{fontSize:28,fontWeight:900,letterSpacing:"-1px",marginBottom:8,color:"#1e1b4b",marginTop:28}}>
          Welcome Back
        </div>
        <div style={{fontSize:14,color:"#94A3B8"}}>Sign in with your Google account</div>
      </div>

      <div style={{width:"100%",background:"#FFFFFF",borderRadius:"28px 28px 0 0",
        padding:"32px 24px 48px",boxShadow:"0 -4px 40px rgba(99,102,241,.12)"}}>
        <div style={{fontSize:15,fontWeight:600,color:"#64748B",marginBottom:16,textAlign:"center"}}>
          Sign in to get started
        </div>
        <button className="btn-press"
          onClick={()=>supabase.auth.signInWithOAuth({provider:"google",options:{redirectTo:window.location.origin}})}
          style={{
            display:"flex",alignItems:"center",gap:12,
            background:"#FFFFFF",color:"#1e1b4b",
            border:"1.5px solid #E2E8F0",
            borderRadius:16,padding:"14px 24px",fontSize:15,fontWeight:600,
            cursor:"pointer",boxShadow:"0 2px 12px rgba(0,0,0,.06)",
            margin:"0 auto",fontFamily:"inherit",width:"100%",justifyContent:"center",
          }}>
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
  );

  /* ── OVERLAY (영수증/직접입력) ── */
  const renderOverlay=()=>(
    <div style={{
      position:"fixed",inset:0,
      background:"linear-gradient(160deg,#EEF0FF 0%,#E8F0FA 40%,#E8F4FD 100%)",
      zIndex:200,maxWidth:430,margin:"0 auto",overflowY:"auto",
    }}>
      {/* Header */}
      <div style={{padding:"52px 20px 16px",display:"flex",alignItems:"center",gap:12}}>
        <button onClick={closeOv} className="btn-press" style={{
          width:36,height:36,borderRadius:"50%",
          background:"#FFFFFF",border:"1.5px solid #E2E8F0",
          display:"flex",alignItems:"center",justifyContent:"center",
          cursor:"pointer",boxShadow:"0 2px 8px rgba(0,0,0,.06)",
        }}>
          <span style={{fontSize:18,color:"#64748B",lineHeight:1}}>‹</span>
        </button>
        <div style={{fontSize:17,fontWeight:700,color:"#1e1b4b"}}>
          {overlay==="confirm"?"영수증 촬영":overlay==="manual"?"직접 입력":"인식 중..."}
        </div>
      </div>

      {overlay==="loading"&&(
        <div style={{textAlign:"center",padding:"60px 24px"}}>
          {preview&&(
            <div style={{borderRadius:20,overflow:"hidden",marginBottom:24,boxShadow:"0 4px 20px rgba(0,0,0,.08)"}}>
              <img src={preview} alt="" style={{width:"100%",maxHeight:220,objectFit:"cover",display:"block"}}/>
            </div>
          )}
          <div style={{fontSize:36,marginBottom:12}}>✨</div>
          <div style={{color:"#94A3B8",fontSize:14}}>영수증 읽는 중...</div>
        </div>
      )}

      {(overlay==="confirm"||overlay==="manual")&&(
        <div className="fu" style={{padding:"0 20px 120px"}}>
          {overlay==="confirm"&&preview&&(
            <div style={{
              width:"100%",minHeight:180,borderRadius:20,overflow:"hidden",
              marginBottom:16,
              background:"#F8F9FA",
              border:"1.5px dashed #CBD5E1",
              display:"flex",alignItems:"center",justifyContent:"center",
            }}>
              <img src={preview} alt="" style={{width:"100%",maxHeight:220,objectFit:"cover",display:"block"}}/>
            </div>
          )}
          {overlay==="confirm"&&!preview&&(
            <div style={{
              width:"100%",minHeight:180,borderRadius:20,
              background:"#F8F9FA",border:"1.5px dashed #CBD5E1",
              display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
              marginBottom:16,gap:10,
            }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.5">
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/>
              </svg>
              <div style={{fontSize:13,color:"#94A3B8"}}>사진을 촬영하거나 업로드하세요</div>
            </div>
          )}
          {overlay==="confirm"&&(
            ocrRes?.amount
              ?<div style={{borderRadius:16,padding:"14px 18px",marginBottom:16,background:"#F0FDF4",border:"1px solid #BBF7D0"}}>
                <div style={{fontSize:11,color:"#10B981",fontWeight:700,marginBottom:4}}>✓ 자동 인식 완료</div>
                <div style={{fontSize:28,fontWeight:900,color:"#1e1b4b"}}>{ocrRes.amount.toLocaleString()}원</div>
                {ocrRes.date&&<div style={{fontSize:12,color:"#64748B",marginTop:3}}>{ocrRes.date}</div>}
              </div>
              :<div style={{background:"#FFF5F5",border:"1px solid #FED7D7",borderRadius:16,padding:"13px 18px",marginBottom:16,fontSize:13,color:"#EF4444"}}>
                인식 실패 — 아래에 직접 입력해주세요
              </div>
          )}

          <div style={{background:"#FFFFFF",borderRadius:20,padding:"20px",boxShadow:"0 2px 20px rgba(99,102,241,.08)",marginBottom:16}}>
            <GlassInput
              label="결제 금액"
              value={form.amount ? parseInt(form.amount, 10).toLocaleString() : ""}
              onChange={v => { const raw = v.replace(/[^0-9]/g, ""); setForm(f => ({ ...f, amount: raw })); }}
              type="text"
              placeholder="₩ 0"
              big
            />
            <GlassInput label="사용 날짜" value={form.date} onChange={v=>setForm(f=>({...f,date:v}))} type="date" placeholder="YYYY-MM-DD"/>
            <GlassInput label="가맹점명" value={form.merchant} onChange={v=>setForm(f=>({...f,merchant:v}))} placeholder="가맹점 이름을 입력해 주세요."/>
          </div>

          <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:430,padding:"16px 20px 36px",background:"linear-gradient(to top,#E8F4FD 60%,transparent)"}}>
            <PBtn onClick={addTxn}>확인</PBtn>
          </div>
        </div>
      )}
    </div>
  );

  /* ── HOME ── */
  const renderHome=()=>{
    const dailyBudget=getDailyBudget();
    return (
      <div style={{position:"relative",zIndex:1,width:"100%"}}>
        <div style={{padding:"52px 20px 0"}}>
          {/* Hero Card */}
          <div style={{
            background:"#FFFFFF",borderRadius:24,padding:"20px 20px 20px",
            boxShadow:"0 2px 20px rgba(99,102,241,.10)",marginBottom:16,
          }}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{flex:1}}>
                <div style={{fontSize:12,color:"#94A3B8",marginBottom:6,fontWeight:500}}>이번 달 잔액</div>
                <div style={{fontSize:38,fontWeight:900,letterSpacing:"-2px",color:"#1e1b4b",lineHeight:1.1,marginBottom:8}}>
                  ₩{remaining.toLocaleString()}
                </div>
                <div style={{fontSize:12,color:"#64748B",marginBottom:4}}>
                  일일 사용 가능 금액 ₩{dailyBudget.toLocaleString()}
                </div>
                <div style={{fontSize:12,color:pc,fontWeight:600}}>
                  사용률 {Math.round(pct)}%
                </div>
              </div>
              <div style={{flexShrink:0,marginLeft:8}}>
                <CardSVG size={80}/>
              </div>
            </div>
          </div>

          {/* List / Calendar Toggle */}
          <div style={{
            background:"#FFFFFF",borderRadius:14,padding:"4px",
            boxShadow:"0 2px 12px rgba(99,102,241,.08)",
            display:"flex",gap:0,marginBottom:16,
          }}>
            {[{id:"list",label:"리스트"},{id:"calendar",label:"달력"}].map(({id,label})=>(
              <button key={id} className="btn-press" onClick={()=>setHomeView(id)} style={{
                flex:1,padding:"10px",borderRadius:10,border:"none",cursor:"pointer",
                fontSize:14,fontWeight:homeView===id?700:500,
                background:homeView===id?"#6366F1":"transparent",
                color:homeView===id?"#FFFFFF":"#64748B",
                transition:"all .2s",fontFamily:"inherit",
              }}>{label}</button>
            ))}
          </div>
        </div>

        {/* List View */}
        {homeView==="list"&&(
          <div style={{padding:"0 20px 20px"}}>
            {thisMonthTxns.length===0&&(
              <div style={{textAlign:"center",padding:"48px 0",color:"#94A3B8"}}>
                <div style={{fontSize:40,marginBottom:12}}>🍽</div>
                <div style={{fontSize:14,fontWeight:600,color:"#64748B"}}>아직 기록이 없어요</div>
                <div style={{fontSize:12,color:"#94A3B8",marginTop:6}}>우측 하단 + 버튼으로 추가해봐요</div>
              </div>
            )}
            {sortedDateKeys.map(dateKey=>{
              const group=groupedTxns[dateKey];
              const dayTotal=group.reduce((s,t)=>s+t.amount,0);
              return (
                <div key={dateKey} style={{
                  background:"#FFFFFF",borderRadius:20,
                  boxShadow:"0 2px 16px rgba(99,102,241,.07)",
                  marginBottom:12,overflow:"hidden",
                }}>
                  {/* Date header */}
                  <div style={{
                    display:"flex",alignItems:"center",justifyContent:"space-between",
                    padding:"14px 16px 0",
                    borderBottom:"1px solid #F8F8FF",paddingBottom:10,
                  }}>
                    <span style={{fontSize:13,fontWeight:600,color:"#64748B"}}>
                      {formatDateHeader(dateKey)}
                    </span>
                    <span style={{fontSize:13,fontWeight:700,color:"#EF4444"}}>
                      ₩{dayTotal.toLocaleString()}
                    </span>
                  </div>
                  {/* Tx rows */}
                  <div style={{padding:"0 16px"}}>
                    {group.map((tx,i)=>(
                      <TxRow
                        key={tx.id} tx={tx}
                        onDel={()=>delTxn(tx.id)}
                        onSave={saveTx}
                        delay={i*.04}
                        last={i===group.length-1}
                      />
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
            <div style={{
              background:"#FFFFFF",borderRadius:20,
              boxShadow:"0 2px 16px rgba(99,102,241,.07)",
              overflow:"hidden",padding:"16px 4px",
            }}>
              <CalendarView txns={txns}/>
            </div>
          </div>
        )}
      </div>
    );
  };

  /* ── GALLERY ── */
  const renderGallery=()=>(
    <div style={{padding:"52px 20px 0",position:"relative",zIndex:1}}>
      {/* Month nav */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
        <button className="btn-press" onClick={()=>setGalleryFilter(f=>f+1)} style={{
          background:"none",border:"none",cursor:"pointer",fontSize:20,color:"#64748B",
          width:36,height:36,display:"flex",alignItems:"center",justifyContent:"center",
          borderRadius:"50%",
        }}>‹</button>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:20,fontWeight:800,color:"#1e1b4b",letterSpacing:"-0.5px"}}>{filterLabel}</div>
        </div>
        <button className="btn-press" onClick={()=>setGalleryFilter(f=>Math.max(0,f-1))} style={{
          background:"none",border:"none",cursor:"pointer",fontSize:20,color:"#64748B",
          width:36,height:36,display:"flex",alignItems:"center",justifyContent:"center",
          borderRadius:"50%",opacity:galleryFilter===0?0.3:1,
        }}>›</button>
      </div>

      {/* Total + Download */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
        <div style={{fontSize:13,color:"#94A3B8"}}>
          이번 달 사용 금액 -₩{filteredTxns.reduce((s,t)=>s+t.amount,0).toLocaleString()}
        </div>
        {Object.keys(recs).length>0&&(
          <button onClick={dlAll} className="btn-press" style={{
            display:"flex",alignItems:"center",gap:5,
            padding:"7px 14px",borderRadius:99,
            background:"transparent",
            border:"1.5px solid #6366F1",
            color:"#6366F1",fontSize:12,fontWeight:700,
            cursor:"pointer",fontFamily:"inherit",
            whiteSpace:"nowrap",transition:"all .2s",
          }}>
            <IcDownload/>
            전체 다운로드
          </button>
        )}
      </div>

      {/* Image grid */}
      {filteredTxns.filter(t=>recs[t.id]).length>0?(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          {filteredTxns.filter(t=>recs[t.id]).map(tx=>(
            <div key={tx.id} style={{
              background:"#FFFFFF",borderRadius:20,overflow:"hidden",
              position:"relative",boxShadow:"0 2px 16px rgba(99,102,241,.08)",
            }}>
              <img src={recs[tx.id]} alt="" onClick={()=>dlRec(tx.id)}
                style={{width:"100%",height:150,objectFit:"cover",display:"block",cursor:"pointer"}}/>
              <button onClick={e=>{e.stopPropagation();setBottomSheet({tx});}} style={{
                position:"absolute",top:8,right:8,width:28,height:28,borderRadius:"50%",
                background:"rgba(255,255,255,.9)",backdropFilter:"blur(8px)",
                border:"1px solid #E2E8F0",color:"#64748B",fontSize:14,cursor:"pointer",
                display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,
              }}>···</button>
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
          <div style={{fontSize:40,marginBottom:12}}>📷</div>
          <div style={{fontSize:14,fontWeight:500}}>저장된 영수증 이미지가 없어요</div>
        </div>
      )}
    </div>
  );

  /* ── SETTINGS ── */
  const renderSettings=()=>{
    const initial=(user?.email||"?")[0].toUpperCase();
    const name=user?.email?.split("@")[0]||"";
    const rowStyle={
      width:"100%",display:"flex",alignItems:"center",gap:14,padding:"14px 16px",
      background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",
    };
    const iconBox=(color,lightColor)=>({
      width:36,height:36,borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",
      background:`${lightColor}18`,border:`1px solid ${lightColor}30`,
    });
    return (
      <div style={{padding:"52px 20px 40px",position:"relative",zIndex:1}}>
        <div style={{fontSize:22,fontWeight:800,letterSpacing:"-0.5px",marginBottom:20,textAlign:"left",color:"#1e1b4b"}}>설정</div>

        {/* User card */}
        <div style={{
          background:"#FFFFFF",borderRadius:24,padding:"20px",marginBottom:24,
          boxShadow:"0 2px 20px rgba(99,102,241,.08)",
          display:"flex",alignItems:"center",gap:16,
        }}>
          <div style={{
            width:56,height:56,borderRadius:18,flexShrink:0,
            background:"linear-gradient(150deg,#818CF8,#6366F1)",
            display:"flex",alignItems:"center",justifyContent:"center",
            boxShadow:"0 4px 16px rgba(99,102,241,.3)",
          }}>
            <span style={{fontSize:22,fontWeight:800,color:"#fff"}}>{initial}</span>
          </div>
          <div>
            <div style={{fontSize:16,fontWeight:700,color:"#1e1b4b"}}>{name}</div>
            <div style={{fontSize:12,color:"#94A3B8",marginTop:2}}>{user?.email}</div>
          </div>
        </div>

        <SHead>프로젝트 설정</SHead>
        <div style={{background:"#FFFFFF",borderRadius:20,overflow:"hidden",marginBottom:20,boxShadow:"0 2px 16px rgba(99,102,241,.07)"}}>
          <button onClick={()=>setOpenSection(openSection==="project"?null:"project")} style={{...rowStyle,borderBottom:openSection==="project"?"1px solid #F1F5F9":"none"}}>
            <div style={iconBox("#6366F1","#6366F1")}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2">
                <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3H8L2 7h20l-6-4z"/>
              </svg>
            </div>
            <div style={{flex:1,textAlign:"left"}}>
              <div style={{fontSize:14,fontWeight:500,color:"#1e1b4b"}}>프로젝트명</div>
              <div style={{fontSize:12,color:"#94A3B8",marginTop:2}}>{cfg.projectName||"미설정"}</div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="2">
              <path d="M9 18l6-6-6-6"/>
            </svg>
          </button>
          {openSection==="project"&&(
            <div style={{padding:"12px 16px 16px"}}>
              <GlassInput value={cfg.projectName} onChange={v=>setCfg(c=>({...c,projectName:v}))} placeholder="우리 가계부" hint="엑셀 지출결의서에 자동 입력"/>
              <div style={{display:"flex",gap:8}}>
                <PBtn small secondary onClick={()=>setOpenSection(null)}>취소</PBtn>
                <PBtn small onClick={async()=>{const{data:{user:u}}=await supabase.auth.getUser();await US.save(cfg,u.id);setOpenSection(null);ping("저장됐어요");}}>저장</PBtn>
              </div>
            </div>
          )}
        </div>

        <SHead>데이터 관리</SHead>
        <div style={{background:"#FFFFFF",borderRadius:20,overflow:"hidden",marginBottom:20,boxShadow:"0 2px 16px rgba(99,102,241,.07)"}}>
          <button onClick={()=>exportXlsx(txns,cfg.projectName)} style={rowStyle}>
            <div style={iconBox("#10B981","#10B981")}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                <polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="11"/><polyline points="9 15 12 18 15 15"/>
              </svg>
            </div>
            <div style={{flex:1,textAlign:"left"}}>
              <div style={{fontSize:14,fontWeight:500,color:"#1e1b4b"}}>액셀 다운로드</div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </div>

        <SHead>계정</SHead>
        <div style={{background:"#FFFFFF",borderRadius:20,overflow:"hidden",marginBottom:20,boxShadow:"0 2px 16px rgba(99,102,241,.07)"}}>
          <button onClick={()=>{supabase.auth.signOut();setUser(null);setTxns([]);}} style={rowStyle}>
            <div style={iconBox("#EF4444","#EF4444")}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
              </svg>
            </div>
            <div style={{flex:1,textAlign:"left"}}>
              <div style={{fontSize:14,fontWeight:500,color:"#EF4444"}}>로그아웃</div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </div>

        <div style={{textAlign:"center",marginTop:8}}>
          <p style={{color:"#CBD5E1",fontSize:11}}>ExpenseFlow v1.0.0 · © 2026</p>
        </div>
      </div>
    );
  };

  const changeTab=(newTab)=>{
    if(newTab!==tab) window.history.pushState({tab:newTab},"");
    setTab(newTab);
    setFab(false);
  };

  const fabRight=`max(20px, calc((100vw - 430px) / 2 + 20px))`;

  return (
    <div style={bgStyle}>
      <Toast toast={toast}/>

      {/* Bottom sheet */}
      {bottomSheet&&(
        <>
          <div onClick={()=>setBottomSheet(null)} style={{position:"fixed",inset:0,zIndex:300,background:"rgba(30,27,75,.3)",backdropFilter:"blur(4px)"}}/>
          <div style={{
            position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",
            width:"100%",maxWidth:430,background:"#FFFFFF",
            borderRadius:"24px 24px 0 0",padding:"12px 20px 48px",
            zIndex:301,animation:"slideUp .22s ease",
            boxShadow:"0 -4px 40px rgba(99,102,241,.12)",
          }}>
            <div style={{width:36,height:4,borderRadius:99,background:"#E2E8F0",margin:"0 auto 20px"}}/>
            <div style={{fontSize:14,fontWeight:600,color:"#94A3B8",marginBottom:12,textAlign:"center"}}>
              {bottomSheet.tx.merchant}
            </div>
            <button onClick={()=>{setGalleryEdit(bottomSheet.tx);setBottomSheet(null);}} style={{
              width:"100%",padding:"15px",borderRadius:16,
              background:"#EEF2FF",border:"none",
              color:"#6366F1",fontSize:15,fontWeight:700,
              cursor:"pointer",fontFamily:"inherit",marginBottom:10
            }}>수정</button>
            <button onClick={()=>{delTxn(bottomSheet.tx.id);setBottomSheet(null);}} style={{
              width:"100%",padding:"15px",borderRadius:16,
              background:"#FFF5F5",border:"none",
              color:"#EF4444",fontSize:15,fontWeight:700,
              cursor:"pointer",fontFamily:"inherit"
            }}>삭제</button>
          </div>
        </>
      )}

      {galleryEdit&&(
        <GalleryEditOverlay tx={galleryEdit} recs={recs} onSave={saveTx} onClose={()=>setGalleryEdit(null)}/>
      )}

      {fabOpen&&<div onClick={()=>setFab(false)} style={{position:"fixed",inset:0,zIndex:40,background:"rgba(30,27,75,.2)",backdropFilter:"blur(2px)"}}/>}
      {overlay&&renderOverlay()}

      {!overlay&&tab==="home"&&renderHome()}
      {!overlay&&tab==="gallery"&&renderGallery()}
      {!overlay&&tab==="settings"&&renderSettings()}

      {/* FAB */}
      {!overlay&&tab!=="settings"&&(
        <>
          {fabOpen&&(
            <div style={{position:"fixed",bottom:110,right:fabRight,display:"flex",flexDirection:"column",gap:10,alignItems:"flex-end",zIndex:60}}>
              {[
                {Icon:IcCamera,label:"카메라로 찍기",fn:()=>camRef.current?.click()},
                {Icon:IcImage,label:"갤러리에서 불러오기",fn:()=>galRef.current?.click()},
                {Icon:IcPencil,label:"직접 입력",fn:()=>{setForm({amount:"",merchant:"",date:todayMD()});setOv("manual");setFab(false);}},
              ].map((opt,i)=>(
                <button key={opt.label} onClick={()=>{opt.fn();setFab(false);}} className="btn-press" style={{
                  display:"flex",alignItems:"center",gap:10,
                  background:"#FFFFFF",
                  border:"1.5px solid #E8E8F0",
                  borderRadius:99,padding:"10px 16px 10px 10px",
                  fontSize:13,fontWeight:600,color:"#1e1b4b",
                  cursor:"pointer",
                  boxShadow:"0 4px 20px rgba(99,102,241,.15)",
                  animation:"fabPop .2s ease both",animationDelay:`${i*.06}s`,
                  fontFamily:"inherit",whiteSpace:"nowrap",transition:"transform .15s",
                }}>
                  <div style={{
                    width:32,height:32,borderRadius:"50%",
                    background:"linear-gradient(150deg,#818CF8,#6366F1)",
                    display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,
                  }}>
                    <opt.Icon/>
                  </div>
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          )}
          <div style={{position:"fixed",bottom:90,right:fabRight,zIndex:80}}>
            <button className="btn-press" onClick={()=>setFab(p=>!p)} style={{
              width:56,height:56,borderRadius:"50%",
              background:"linear-gradient(150deg,#818CF8,#6366F1)",
              border:"none",fontSize:26,cursor:"pointer",
              display:"flex",alignItems:"center",justifyContent:"center",
              boxShadow:"0 8px 28px rgba(99,102,241,.45)",
              transition:"transform .25s",
              transform:fabOpen?"rotate(45deg)":"rotate(0deg)",
              color:"#fff",
            }}>+</button>
          </div>
        </>
      )}

      {!overlay&&<TabBar tab={tab} setTab={changeTab}/>}
      <input ref={camRef} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={e=>handleFile(e.target.files[0])}/>
      <input ref={galRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>handleFile(e.target.files[0])}/>
    </div>
  );
}
