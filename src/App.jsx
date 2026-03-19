import { useState, useEffect, useRef, useCallback } from "react";
import * as XLSX from "xlsx";
import { createClient } from '@supabase/supabase-js';

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
    input[type=date]::-webkit-calendar-picker-indicator{filter:invert(1);opacity:0.5}
    @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
    @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
    @keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
    @keyframes toast{from{opacity:0;transform:translateX(-50%) translateY(10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
    @keyframes fabPop{from{opacity:0;transform:scale(.85) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}
    .fu{animation:fadeUp .35s cubic-bezier(.22,1,.36,1) both}
    .glass{background:rgba(255,255,255,0.06);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border:1px solid rgba(255,255,255,0.12)}
    .tx-row:active{background:rgba(255,255,255,0.1)!important}
    .btn-press:active{transform:scale(.96)}
    @media(min-width:768px){#root>div{max-width:430px!important;margin:0 auto!important;box-shadow:0 0 80px rgba(0,0,0,0.6)}}
  `;
  document.head.appendChild(s);
}

const LIMIT = 200_000;
const mKey = (offset=0) => { const d=new Date(); d.setMonth(d.getMonth()-offset); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; };
const monthLabel = (offset=0) => { const d=new Date(); d.setMonth(d.getMonth()-offset); return `${d.getFullYear()}년 ${d.getMonth()+1}월`; };
const todayMD = () => { const d=new Date(); return `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}`; };
const pctColor = p => p>=90?"#F87171":p>=70?"#FCD34D":"#4A9EFF";

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

/* ── SVG Line Icons ── */
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

/* ── 다운로드 아이콘 (갤러리 전체 다운로드용) ── */
const IcDownload = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3v13M5 13l7 7 7-7"/>
    <path d="M3 20h18"/>
  </svg>
);

/* ── Chevron 아이콘 (접기/더보기 토글용) ── */
const IcChevronUp = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="4 15 12 7 20 15"/>
  </svg>
);
const IcChevronDown = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="4 9 12 17 20 9"/>
  </svg>
);

const IconHome = ({active}) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active?"#4A9EFF":"rgba(255,255,255,.4)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/><path d="M9 21V12h6v9"/>
  </svg>
);
const IconGallery = ({active}) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active?"#4A9EFF":"rgba(255,255,255,.4)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>
  </svg>
);
const IconSettings = ({active}) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active?"#4A9EFF":"rgba(255,255,255,.4)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
  </svg>
);

/* ── UI Primitives ── */
const Toast = ({toast}) => toast?(
  <div style={{
    position:"fixed", bottom:96, left:"50%", transform:"translateX(-50%)",
    zIndex:9999,
    background:toast.err?"rgba(248,113,113,.92)":"rgba(74,158,255,.92)",
    backdropFilter:"blur(12px)",color:"#fff",padding:"10px 22px",
    borderRadius:99,fontSize:13,fontWeight:700,whiteSpace:"nowrap",
    boxShadow:"0 8px 32px rgba(0,0,0,.4)",animation:"toast .25s ease both",
    border:"1px solid rgba(255,255,255,.2)"}}>
    {toast.msg}
  </div>
):null;

const GlassInput = ({label,value,onChange,type="text",placeholder,big,hint}) => (
  <div style={{marginBottom:14}}>
   {label&&<div style={{fontSize:10,color:"rgba(255,255,255,.4)",marginBottom:7,fontWeight:700,letterSpacing:".8px",textTransform:"uppercase",textAlign:"left"}}>{label}</div>}
    <input type={type} value={value} placeholder={placeholder}
      onChange={e=>onChange(e.target.value)}
      style={{width:"100%",background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.1)",
        borderRadius:14,padding:big?"15px 16px":"12px 16px",fontSize:big?22:14,fontWeight:big?800:400,
        color:"#fff",outline:"none",transition:"border-color .2s",colorScheme:"dark",fontFamily:"inherit"}}
      onFocus={e=>e.target.style.borderColor="rgba(74,158,255,.6)"}
      onBlur={e=>e.target.style.borderColor="rgba(255,255,255,.1)"}/>
    {hint&&<div style={{fontSize:11,color:"rgba(255,255,255,.35)",marginTop:5,textAlign:"left"}}>{hint}</div>}
  </div>
);

const PBtn = ({onClick,children,secondary,small,color}) => (
  <button className="btn-press" onClick={onClick} style={{
    width:"100%",borderRadius:16,padding:small?"11px":"15px",
    fontSize:small?13:14,fontWeight:700,cursor:"pointer",transition:"transform .15s",
    fontFamily:"'Noto Sans KR',sans-serif",
    ...(secondary?{
      background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.15)",color:"rgba(255,255,255,.8)"
    }:{
      background:color||"linear-gradient(135deg,#4A9EFF,#2DD4BF)",
      border:"none",color:"#fff",boxShadow:"0 4px 20px rgba(74,158,255,.4)"
    })
  }}>{children}</button>
);

const SHead = ({children}) => (
  <div style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,.35)",letterSpacing:".8px",
    textTransform:"uppercase",marginBottom:8,textAlign:"left"}}>{children}</div>
);

/* ── 금액 포맷 유틸 ── */
const formatAmt = raw => {
  const n = parseInt(raw.replace(/[^0-9]/g,""), 10);
  return isNaN(n) ? "" : n.toLocaleString();
};
const stripAmt = formatted => formatted.replace(/[^0-9]/g,"");

/* ── TxRow (버튼 순서: [취소][저장]) ── */
function TxRow({tx,onDel,onSave,delay=0}) {
  const [editing,setEditing]=useState(false);
  const [amt,setAmt]=useState(String(tx.amount)); // raw 숫자 문자열
  const [merch,setMerch]=useState(tx.merchant);
  const [date,setDate]=useState(tx.date||"");

  if(editing) return (
    <div className="fu glass" style={{borderRadius:18,padding:"16px",marginBottom:8,animationDelay:`${delay}s`}}>
      <div style={{fontSize:12,color:"#4A9EFF",fontWeight:700,marginBottom:10}}>내역 수정</div>
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
    <div className="tx-row fu glass" onClick={()=>setEditing(true)} style={{display:"flex",alignItems:"center",gap:12,
      padding:"13px 14px",borderRadius:18,marginBottom:8,transition:"background .15s",
      animationDelay:`${delay}s`,cursor:"pointer"}}>
      <div style={{flex:1,minWidth:0,textAlign:"left"}}>
        <div style={{fontSize:14,fontWeight:600,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tx.merchant}</div>
        <div style={{fontSize:11,color:"rgba(255,255,255,.4)",marginTop:2}}>{tx.date}</div>
      </div>
      <div style={{fontSize:14,fontWeight:800,color:"#fff",flexShrink:0}}>−{tx.amount.toLocaleString()}원</div>
      <button onClick={e=>{e.stopPropagation();onDel();}} style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:"rgba(255,255,255,.2)",lineHeight:1,marginLeft:2}}>×</button>
    </div>
  );
}

/* ── Tab Bar (피그마 스타일 활성 탭) ── */
const TabBar = ({tab,setTab}) => (
  <div className="glass" style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",
    width:"100%",maxWidth:430,display:"flex",zIndex:100,
    paddingBottom:"env(safe-area-inset-bottom,8px)",borderRadius:"24px 24px 0 0",borderBottom:"none",
    padding:"8px 8px 0"}}>
    {[
      {id:"home",label:"홈",Icon:IconHome},
      {id:"gallery",label:"갤러리",Icon:IconGallery},
      {id:"settings",label:"설정",Icon:IconSettings},
    ].map(({id,label,Icon})=>(
      <button key={id} className="btn-press" onClick={()=>setTab(id)} style={{
        flex:1,background:"none",border:"none",cursor:"pointer",
        padding:"8px 0 10px",display:"flex",flexDirection:"column",alignItems:"center",gap:3,
        position:"relative",borderRadius:16,transition:"background .2s",
        background:tab===id?"rgba(74,158,255,.12)":"none",
      }}>
        <Icon active={tab===id}/>
        <span style={{fontSize:10,fontWeight:tab===id?700:400,
          color:tab===id?"#4A9EFF":"rgba(255,255,255,.4)",transition:"color .2s"}}>{label}</span>
      </button>
    ))}
  </div>
);

/* ── Gallery Edit Overlay ── */
function GalleryEditOverlay({tx, recs, onSave, onClose}) {
  const [amt,setAmt]=useState(String(tx.amount)); // raw 숫자 문자열
  const [merch,setMerch]=useState(tx.merchant);
  const [date,setDate]=useState(tx.date||"");

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.7)",backdropFilter:"blur(8px)",zIndex:400,
      display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
      <div style={{width:"100%",maxWidth:430,background:"linear-gradient(160deg,#0d0d14,#111827)",
        borderRadius:"24px 24px 0 0",padding:"24px 20px 48px",animation:"slideUp .25s ease"}}>
        <div style={{width:36,height:4,borderRadius:99,background:"rgba(255,255,255,.2)",margin:"0 auto 20px"}}/>
        <div style={{fontSize:16,fontWeight:700,marginBottom:16}}>내역 수정</div>
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

/* ══ MAIN APP ══ */
export default function App() {
  const [txns,setTxns]=useState([]);
  const [recs,setRecs]=useState({});
  const [cfg,setCfg]=useState({email:"",threshold:50000,projectName:""});
  const [tab,setTab]=useState("home");
  const [overlay,setOv]=useState(null);
  const [fabOpen,setFab]=useState(false);
  const [preview,setPv]=useState(null);
  const [ocrRes,setOcr]=useState(null);
  const [form,setForm]=useState({amount:"",merchant:"",date:""});
  const [toast,setToast]=useState(null);
  const [notified,setNtf]=useState(false);
  const [user,setUser]=useState(null);
  const [galleryFilter,setGalleryFilter]=useState(0);
  const [openSection,setOpenSection]=useState(null);
  const [showAllTxns,setShowAllTxns]=useState(false);
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

  const ping=(msg,err=false)=>{setToast({msg,err});setTimeout(()=>setToast(null),2400);};
  const filterLabel=monthLabel(galleryFilter);
  cconst filteredTxns=txns.filter(tx=>{
    if(!tx.date) return galleryFilter===0;
    const [mm]=tx.date.split("/");
    const d=new Date(); d.setMonth(d.getMonth()-galleryFilter);
    return parseInt(mm)===d.getMonth()+1;
  }).sort((a,b)=>b.id-a.id);
  const thisMonthTxns=txns.filter(t=>{const[mm]=(t.date||"").split("/");return parseInt(mm)===new Date().getMonth()+1;}).sort((a,b)=>b.id-a.id);
  const used=thisMonthTxns.reduce((s,t)=>s+t.amount,0);
  const remaining=LIMIT-used;
  const pct=Math.min(100,(used/LIMIT)*100);
  const pc=pctColor(pct);

  const saveRecs=async n=>{setRecs(n);await S.set(`recs-${mKey()}`,n);};
  const closeOv=()=>{setOv(null);setPv(null);setOcr(null);setForm({amount:"",merchant:"",date:""});};

  const tryNotify=rem=>{
    if(!cfg.email||rem>cfg.threshold||notified) return;
    setNtf(true);
    window.open(`mailto:${cfg.email}?subject=${encodeURIComponent(`[ExpenseFlow] 식대 잔액 ${rem.toLocaleString()}원`)}&body=${encodeURIComponent(`남은 금액: ${rem.toLocaleString()}원`)}`);
  };

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
      if(url){
        tx.image_url=url;
        setRecs(prev=>({...prev,[id]:url}));
      }
    }
  
    await GS.add(tx);
    tryNotify(LIMIT-next.filter(t=>{const[mm]=(t.date||"").split("/");return parseInt(mm)===new Date().getMonth()+1;}).reduce((s,t)=>s+t.amount,0));
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

  const dlRec=id=>{
    const tx=txns.find(t=>t.id===id);
    const a=document.createElement("a");a.href=recs[id];a.download=`영수증_${tx?.merchant||id}.jpg`;a.click();
  };
  const dlAll=async()=>{
    const ids=Object.keys(recs);
    if(!ids.length){ping("저장된 영수증이 없어요",true);return;}
    for(const id of ids){dlRec(parseInt(id));await new Promise(r=>setTimeout(r,350));}
  };

  const bgStyle={
    minHeight:"100vh",
    background:"linear-gradient(160deg,#0d0d14 0%,#111827 50%,#0d1f3a 100%)",
    color:"#fff",fontFamily:"'Noto Sans KR',sans-serif",
    width:"100%",paddingBottom:90,position:"relative",overflowX:"hidden",
  };

  /* ── LOGIN ── */
  if(!user) return (
    <div style={{...bgStyle,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",paddingBottom:0}}>
      <div style={{textAlign:"center",padding:"0 32px"}}>
        <div style={{width:100,height:100,margin:"0 auto 28px",position:"relative",animation:"float 3.5s ease-in-out infinite"}}>
          <svg width="100" height="100" viewBox="0 0 100 100" fill="none">
            <defs>
              <radialGradient id="cg1" cx="35%" cy="25%" r="70%"><stop offset="0%" stopColor="#A8E0FF"/><stop offset="50%" stopColor="#5BB8F5"/><stop offset="100%" stopColor="#2A8EE0"/></radialGradient>
              <radialGradient id="cg2" cx="30%" cy="20%" r="60%"><stop offset="0%" stopColor="white" stopOpacity=".9"/><stop offset="60%" stopColor="white" stopOpacity=".2"/><stop offset="100%" stopColor="white" stopOpacity="0"/></radialGradient>
              <filter id="cf1" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="8" stdDeviation="10" floodColor="#2A8EE0" floodOpacity=".45"/></filter>
            </defs>
            <g transform="rotate(-12 50 50)" filter="url(#cf1)">
              <rect x="10" y="22" width="80" height="52" rx="10" fill="url(#cg1)"/>
              <ellipse cx="36" cy="34" rx="22" ry="10" fill="url(#cg2)" transform="rotate(-8 36 34)"/>
              <rect x="10" y="22" width="80" height="52" rx="10" fill="none" stroke="rgba(255,255,255,.45)" strokeWidth="1.2"/>
              <rect x="18" y="32" width="16" height="12" rx="3" fill="#E8C96A" opacity=".95"/>
              {[0,1,2,3].map(g=>([0,1,2,3].map(d=>(<circle key={`${g}${d}`} cx={18+g*16+d*3.2} cy={54} r="1.2" fill="white" opacity=".7"/>))))}
              <circle cx="70" cy="62" r="7" fill="#FF6B6B" opacity=".8"/>
              <circle cx="78" cy="62" r="7" fill="#FFB347" opacity=".8"/>
            </g>
            <ellipse cx="46" cy="28" rx="18" ry="6" fill="white" opacity=".18" transform="rotate(-12 46 28)"/>
          </svg>
        </div>
        <div style={{fontSize:28,fontWeight:900,letterSpacing:"-1px",marginBottom:8}}>ExpenseFlow</div>
        <div style={{fontSize:14,color:"rgba(255,255,255,.5)",marginBottom:48}}>식대 사용 현황</div>
        <button className="btn-press" onClick={()=>supabase.auth.signInWithOAuth({provider:"google",options:{redirectTo:window.location.origin}})} style={{
          display:"flex",alignItems:"center",gap:12,background:"#fff",color:"#1a1a2e",border:"none",
          borderRadius:18,padding:"15px 32px",fontSize:15,fontWeight:700,cursor:"pointer",
          boxShadow:"0 8px 32px rgba(0,0,0,.3)",margin:"0 auto",fontFamily:"inherit"}}>
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Google 로그인
        </button>
      </div>
    </div>
  );

  /* ── OVERLAY (영수증 추가) ── */
  const renderOverlay=()=>(
    <div style={{position:"fixed",inset:0,background:"linear-gradient(160deg,#0d0d14,#111827,#0d1f3a)",
      zIndex:200,maxWidth:430,margin:"0 auto",overflowY:"auto"}}>
      <div style={{padding:"52px 20px 16px",display:"flex",alignItems:"center",gap:12,
        background:"linear-gradient(to bottom,rgba(13,13,20,.95),transparent)",backdropFilter:"blur(12px)"}}>
        <button onClick={closeOv} className="btn-press" style={{
          width:36,height:36,borderRadius:"50%",background:"rgba(255,255,255,.06)",
          border:"1px solid rgba(255,255,255,.12)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
          <span style={{fontSize:18,color:"#fff"}}>‹</span>
        </button>
        <div style={{fontSize:17,fontWeight:700}}>{overlay==="confirm"?"영수증 확인":overlay==="manual"?"직접 입력":"인식 중..."}</div>
      </div>
      {overlay==="loading"&&(
        <div style={{textAlign:"center",padding:"60px 24px"}}>
          {preview&&<img src={preview} alt="" style={{width:"100%",maxHeight:220,objectFit:"cover",borderRadius:20,marginBottom:28,opacity:.6}}/>}
          <div style={{fontSize:40,marginBottom:16}}>✨</div>
          <div style={{color:"rgba(255,255,255,.6)",fontSize:14}}>영수증 읽는 중...</div>
        </div>
      )}
      {(overlay==="confirm"||overlay==="manual")&&(
        <div className="fu" style={{padding:"0 20px 120px"}}>
          {overlay==="confirm"&&preview&&(
            <div style={{width:"100%",height:200,borderRadius:20,overflow:"hidden",marginBottom:16,boxShadow:"0 8px 32px rgba(0,0,0,.3)"}}>
              <img src={preview} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
            </div>
          )}
          {overlay==="confirm"&&(
            ocrRes?.amount
              ?<div className="glass" style={{borderRadius:16,padding:"14px 18px",marginBottom:16}}>
                <div style={{fontSize:10,color:"#4A9EFF",fontWeight:700,marginBottom:4}}>✓ 자동 인식 완료</div>
                <div style={{fontSize:30,fontWeight:900}}>{ocrRes.amount.toLocaleString()}원</div>
                {ocrRes.date&&<div style={{fontSize:12,color:"rgba(255,255,255,.5)",marginTop:3}}>{ocrRes.date}</div>}
              </div>
              :<div style={{background:"rgba(248,113,113,.15)",border:"1px solid rgba(248,113,113,.3)",borderRadius:16,padding:"13px 18px",marginBottom:16,fontSize:13,color:"#F87171"}}>
                인식 실패 — 아래에 직접 입력해주세요
              </div>
          )}
          {/* ✅ 변경 1: 천단위 콤마 포맷 + hint 제거 */}
          <GlassInput
            label="결제 금액 (원)"
            value={form.amount ? parseInt(form.amount, 10).toLocaleString() : ""}
            onChange={v => {
              const raw = v.replace(/[^0-9]/g, "");
              setForm(f => ({ ...f, amount: raw }));
            }}
            type="text"
            placeholder="13,500"
            big
          />
          <GlassInput label="일자 (MM/DD)" value={form.date} onChange={v=>setForm(f=>({...f,date:v}))} placeholder="03/18"/>
          <GlassInput label="가맹점명" value={form.merchant} onChange={v=>setForm(f=>({...f,merchant:v}))} placeholder="식당 이름"/>
          <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:430,padding:"16px 20px 36px",background:"linear-gradient(to top,rgba(13,13,20,1) 60%,transparent)"}}>
            <PBtn onClick={addTxn}>추가하기</PBtn>
          </div>
        </div>
      )}
    </div>
  );

  /* ── HOME ── */
  const renderHome=()=>(
    <div style={{position:"relative",zIndex:1,width:"100%",overflowX:"hidden"}}>
      <div style={{padding:"52px 20px 0",textAlign:"left"}}>
        <div style={{fontSize:11,color:"rgba(255,255,255,.35)",letterSpacing:".8px",textTransform:"uppercase",marginBottom:4}}>{monthLabel()} 식대</div>
        <div style={{fontSize:22,fontWeight:800,letterSpacing:"-0.5px"}}>ExpenseFlow</div>
      </div>

      {/* Hero */}
      <div style={{padding:"16px 20px 0"}}>
        <div className="glass" style={{borderRadius:24,padding:"24px",
          background:"linear-gradient(135deg,rgba(74,158,255,.1) 0%,rgba(45,212,191,.07) 100%)",
          border:"1px solid rgba(74,158,255,.2)"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:12,color:"rgba(255,255,255,.5)",marginBottom:8}}>남은 잔액</div>
              <div style={{fontSize:42,fontWeight:900,letterSpacing:"-2px",color:pc,lineHeight:1,marginBottom:4}}>
                {remaining.toLocaleString()}<span style={{fontSize:18,marginLeft:4,fontWeight:600}}>원</span>
              </div>
              <div style={{fontSize:12,color:"rgba(255,255,255,.4)"}}>{used.toLocaleString()}원 사용 · 한도 200,000원</div>
            </div>
            <div style={{flexShrink:0,marginLeft:12,animation:"float 3.5s ease-in-out infinite"}}>
              <svg width="72" height="72" viewBox="0 0 100 100" fill="none">
                <defs>
                  <radialGradient id="hcg1" cx="35%" cy="25%" r="70%"><stop offset="0%" stopColor="#A8E0FF"/><stop offset="50%" stopColor="#5BB8F5"/><stop offset="100%" stopColor="#2A8EE0"/></radialGradient>
                  <radialGradient id="hcg2" cx="30%" cy="20%" r="60%"><stop offset="0%" stopColor="white" stopOpacity=".85"/><stop offset="60%" stopColor="white" stopOpacity=".2"/><stop offset="100%" stopColor="white" stopOpacity="0"/></radialGradient>
                  <filter id="hcf1" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="6" stdDeviation="8" floodColor="#2A8EE0" floodOpacity=".4"/></filter>
                </defs>
                <g transform="rotate(-12 50 50)" filter="url(#hcf1)">
                  <rect x="8" y="20" width="84" height="56" rx="10" fill="url(#hcg1)"/>
                  <ellipse cx="36" cy="32" rx="24" ry="11" fill="url(#hcg2)" transform="rotate(-8 36 32)"/>
                  <rect x="8" y="20" width="84" height="56" rx="10" fill="none" stroke="rgba(255,255,255,.4)" strokeWidth="1.2"/>
                  <rect x="16" y="30" width="15" height="11" rx="3" fill="#E8C96A" opacity=".95"/>
                  {[0,1,2,3].map(g=>([0,1,2,3].map(d=>(<circle key={`${g}${d}`} cx={16+g*15+d*3} cy={54} r="1.1" fill="white" opacity=".65"/>))))}
                  <circle cx="70" cy="62" r="6" fill="#FF6B6B" opacity=".8"/>
                  <circle cx="78" cy="62" r="6" fill="#FFB347" opacity=".8"/>
                </g>
              </svg>
            </div>
          </div>
          <div style={{background:"rgba(255,255,255,.08)",borderRadius:99,height:6,overflow:"hidden"}}>
            <div style={{width:`${pct}%`,height:"100%",borderRadius:99,
              background:`linear-gradient(90deg,${pc},#2DD4BF)`,
              boxShadow:`0 0 12px ${pc}66`,transition:"width .8s ease"}}/>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:5,fontSize:11,color:"rgba(255,255,255,.3)"}}>
            <span>0원</span><span>200,000원</span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{display:"flex",gap:8,padding:"10px 20px 0"}}>
        {[
          {l:"사용 건수",v:`${thisMonthTxns.length}건`},
          {l:"평균 1회",v:thisMonthTxns.length?`${Math.round(used/thisMonthTxns.length).toLocaleString()}원`:"-"},
          {l:"잔여율",v:`${Math.round(100-pct)}%`},
        ].map(s=>(
          <div key={s.l} className="glass" style={{flex:1,borderRadius:16,padding:"13px 8px",textAlign:"center"}}>
            <div style={{fontSize:15,fontWeight:800,color:"#fff"}}>{s.v}</div>
            <div style={{fontSize:10,color:"rgba(255,255,255,.4)",marginTop:3}}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Tx list */}
      <div style={{padding:"16px 20px 0"}}>
        <SHead>이번 달 내역</SHead>
        {thisMonthTxns.length===0&&(
          <div style={{textAlign:"center",padding:"48px 0",color:"rgba(255,255,255,.5)"}}>
            <div style={{fontSize:40,marginBottom:12}}>🍽</div>
            <div style={{fontSize:14,fontWeight:600}}>아직 기록이 없어요</div>
            <div style={{fontSize:12,color:"rgba(255,255,255,.3)",marginTop:6}}>우측 하단 + 버튼으로 추가해봐요</div>
          </div>
        )}
        {(showAllTxns?thisMonthTxns:thisMonthTxns.slice(0,5)).map((tx,i)=>(
          <TxRow key={tx.id} tx={tx} onDel={()=>delTxn(tx.id)} onSave={saveTx} delay={i*.05}/>
        ))}
        {thisMonthTxns.length>5&&(
          <button onClick={()=>setShowAllTxns(p=>!p)} style={{
            width:"100%",background:"none",border:"none",color:"rgba(255,255,255,.4)",
            fontSize:13,cursor:"pointer",padding:"12px",fontFamily:"inherit",fontWeight:600,
            display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
            {showAllTxns
              ? <><IcChevronUp/><span>접기</span></>
              : <><IcChevronDown/><span>더보기 ({thisMonthTxns.length-5}건)</span></>
            }
          </button>
        )}
      </div>
    </div>
  );

  /* ── GALLERY ── */
  const renderGallery=()=>(
    <div style={{padding:"52px 20px 0",position:"relative",zIndex:1}}>
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:16}}>
        <div style={{textAlign:"left"}}>
          <div style={{fontSize:11,color:"rgba(255,255,255,.35)",letterSpacing:".8px",textTransform:"uppercase",marginBottom:4}}>ALL RECORDS</div>
          <div style={{fontSize:22,fontWeight:800,letterSpacing:"-0.5px"}}>갤러리</div>
        </div>
      </div>

      <div className="glass" style={{borderRadius:20,padding:"16px 18px",marginBottom:16,
        background:"linear-gradient(135deg,rgba(74,158,255,.1),rgba(45,212,191,.07))",
        border:"1px solid rgba(74,158,255,.2)"}}>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <div style={{width:48,height:48,borderRadius:16,flexShrink:0,
            background:"linear-gradient(135deg,#4A9EFF,#2DD4BF)",
            display:"flex",alignItems:"center",justifyContent:"center",
            boxShadow:"0 4px 16px rgba(74,158,255,.4)"}}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>
            </svg>
          </div>
          <div style={{flex:1}}>
          <div style={{fontSize:12,color:"rgba(255,255,255,.5)",marginBottom:3,textAlign:"left"}}>{filterLabel} 합계</div>
            <div style={{fontSize:24,fontWeight:800,letterSpacing:"-1px",color:"#4A9EFF",textAlign:"left"}}>
               ₩{filteredTxns.reduce((s,t)=>s+t.amount,0).toLocaleString()}
            </div>
            <div style={{fontSize:11,color:"rgba(255,255,255,.4)",marginTop:2,textAlign:"left"}}>
              {filteredTxns.filter(t=>recs[t.id]).length}장 업로드됨
            </div>
          </div>
        </div>
      </div>

      {/* 필터 칩 */}
      <div style={{display:"flex",gap:8,marginBottom:16,overflowX:"auto",paddingBottom:2}}>
        {[{label:"이번 달",offset:0},{label:"지난 달",offset:1},{label:"2달 전",offset:2}].map(f=>(
          <button key={f.offset} className="btn-press" onClick={()=>setGalleryFilter(f.offset)} style={{
            padding:"7px 16px",borderRadius:99,whiteSpace:"nowrap",fontSize:12,fontWeight:600,cursor:"pointer",
            transition:"all .2s",fontFamily:"inherit",flexShrink:0,
            ...(galleryFilter===f.offset?{
              background:"linear-gradient(135deg,#4A9EFF,#2DD4BF)",color:"#fff",border:"none",
              boxShadow:"0 2px 12px rgba(74,158,255,.4)"
            }:{
              background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.12)",color:"rgba(255,255,255,.5)"
            })
          }}>{f.label}</button>
        ))}
        {/* ✅ 변경 2: 전체 다운로드 버튼 (아이콘 포함) */}
        {Object.keys(recs).length>0&&(
          <button onClick={dlAll} className="btn-press" style={{
            marginLeft:"auto",
            display:"flex",alignItems:"center",gap:5,
            padding:"7px 14px",borderRadius:99,
            background:"rgba(74,158,255,.15)",
            border:"1px solid rgba(74,158,255,.35)",
            color:"#4A9EFF",fontSize:12,fontWeight:700,
            cursor:"pointer",fontFamily:"inherit",
            flexShrink:0,whiteSpace:"nowrap",
            transition:"all .2s",
          }}>
            <IcDownload/>
            전체 다운로드
          </button>
        )}
      </div>

      {/* 이미지 그리드 */}
      {filteredTxns.filter(t=>recs[t.id]).length>0?(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {filteredTxns.filter(t=>recs[t.id]).map(tx=>(
            <div key={tx.id} className="glass" style={{borderRadius:18,overflow:"hidden",position:"relative"}}>
              <img src={recs[tx.id]} alt="" onClick={()=>dlRec(tx.id)}
                style={{width:"100%",height:150,objectFit:"cover",display:"block",cursor:"pointer"}}/>
              <button onClick={e=>{e.stopPropagation();setBottomSheet({tx});}} style={{
                position:"absolute",top:8,right:8,width:28,height:28,borderRadius:"50%",
                background:"rgba(0,0,0,.6)",backdropFilter:"blur(8px)",
                border:"1px solid rgba(255,255,255,.25)",color:"#fff",fontSize:16,cursor:"pointer",
                display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,
                letterSpacing:"1px",lineHeight:1}}>···</button>
              <div style={{padding:"9px 12px"}}>
                <div style={{fontSize:13,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tx.merchant}</div>
                <div style={{fontSize:12,color:"#4A9EFF",fontWeight:700,marginTop:2}}>{tx.amount.toLocaleString()}원</div>
                <div style={{fontSize:11,color:"rgba(255,255,255,.4)",marginTop:1}}>{tx.date}</div>
              </div>
            </div>
          ))}
        </div>
      ):(
        <div style={{textAlign:"center",padding:"48px 0",color:"rgba(255,255,255,.4)",fontSize:14}}>
          저장된 영수증 이미지가 없어요
        </div>
      )}
    </div>
  );

  /* ── SETTINGS ── */
  const renderSettings=()=>(
    <div style={{padding:"52px 20px 40px",position:"relative",zIndex:1}}>
      <div style={{fontSize:22,fontWeight:800,letterSpacing:"-0.5px",marginBottom:20,textAlign:"left"}}>설정</div>

      <div className="glass" style={{borderRadius:24,padding:"20px",marginBottom:24,
        background:"linear-gradient(135deg,rgba(74,158,255,.1),rgba(45,212,191,.07))",
        border:"1px solid rgba(74,158,255,.2)"}}>
        <div style={{display:"flex",alignItems:"center",gap:16}}>
          <div style={{width:56,height:56,borderRadius:18,flexShrink:0,
            background:"linear-gradient(135deg,#4A9EFF,#2DD4BF)",
            display:"flex",alignItems:"center",justifyContent:"center",
            boxShadow:"0 4px 16px rgba(74,158,255,.4)"}}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
          <div>
            <div style={{fontSize:16,fontWeight:700}}>{user?.email?.split("@")[0]}</div>
            <div style={{fontSize:12,color:"rgba(255,255,255,.5)",marginTop:2}}>{user?.email}</div>
          </div>
        </div>
      </div>

      <SHead>Workspace</SHead>
      <div className="glass" style={{borderRadius:20,overflow:"hidden",marginBottom:20}}>
        <button onClick={()=>setOpenSection(openSection==="project"?null:"project")} style={{
          width:"100%",display:"flex",alignItems:"center",gap:14,padding:"14px 16px",
          background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",
          borderBottom:openSection==="project"?"1px solid rgba(255,255,255,.06)":"none"}}>
          <div style={{width:36,height:36,borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",
            background:"rgba(74,158,255,.15)",border:"1px solid rgba(74,158,255,.25)"}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4A9EFF" strokeWidth="2">
              <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3H8L2 7h20l-6-4z"/>
            </svg>
          </div>
          <div style={{flex:1,textAlign:"left"}}>
            <div style={{fontSize:14,fontWeight:500,color:"#fff"}}>프로젝트명</div>
            <div style={{fontSize:12,color:"rgba(255,255,255,.4)",marginTop:2}}>{cfg.projectName||"미설정"}</div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
        </button>
        {openSection==="project"&&(
          <div style={{padding:"12px 16px 16px"}}>
            <GlassInput value={cfg.projectName} onChange={v=>setCfg(c=>({...c,projectName:v}))} placeholder="예: 2025 마케팅팀" hint="엑셀 지출결의서에 자동 입력"/>
            <PBtn small onClick={async()=>{const{data:{user:u}}=await supabase.auth.getUser();await US.save(cfg,u.id);setOpenSection(null);ping("저장됐어요");}}>저장</PBtn>
          </div>
        )}
      </div>

      <SHead>Notifications</SHead>
      <div className="glass" style={{borderRadius:20,overflow:"hidden",marginBottom:20}}>
        <button onClick={()=>setOpenSection(openSection==="alert"?null:"alert")} style={{
          width:"100%",display:"flex",alignItems:"center",gap:14,padding:"14px 16px",
          background:"none",border:"none",cursor:"pointer",fontFamily:"inherit"}}>
          <div style={{width:36,height:36,borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",
            background:"rgba(45,212,191,.15)",border:"1px solid rgba(45,212,191,.25)"}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2DD4BF" strokeWidth="2">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/>
            </svg>
          </div>
          <div style={{flex:1,textAlign:"left"}}>
            <div style={{fontSize:14,fontWeight:500,color:"#fff"}}>잔액 알림</div>
            <div style={{fontSize:12,color:"rgba(255,255,255,.4)",marginTop:2}}>
              {cfg.email?`${cfg.email} · ${cfg.threshold.toLocaleString()}원 이하`:"미설정"}
          </div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
        </button>
        {openSection==="alert"&&(
          <div style={{padding:"12px 16px 16px",borderTop:"1px solid rgba(255,255,255,.06)"}}>
            <GlassInput label="알림 이메일" value={cfg.email} onChange={v=>setCfg(c=>({...c,email:v}))} placeholder="me@company.com"/>
            <div style={{fontSize:11,color:"rgba(255,255,255,.35)",marginBottom:8,textAlign:"left"}}>알림 기준 잔액</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
              {[30000,50000,70000,100000].map(v=>(
                <button key={v} className="btn-press" onClick={()=>setCfg(c=>({...c,threshold:v}))} style={{
                  padding:"7px 12px",borderRadius:99,fontFamily:"inherit",cursor:"pointer",
                  border:`1.5px solid ${cfg.threshold===v?"rgba(74,158,255,.8)":"rgba(255,255,255,.12)"}`,
                  background:cfg.threshold===v?"rgba(74,158,255,.2)":"rgba(255,255,255,.05)",
                  color:cfg.threshold===v?"#4A9EFF":"rgba(255,255,255,.5)",
                  fontSize:11,fontWeight:cfg.threshold===v?700:400}}>
                  {v.toLocaleString()}원
                </button>
              ))}
            </div>
            <GlassInput label="직접 입력 (원)" value={String(cfg.threshold)} onChange={v=>setCfg(c=>({...c,threshold:parseInt(v)||0}))} type="number" placeholder="50000"/>
            <PBtn small onClick={async()=>{
  if(!cfg.email){ping("이메일을 먼저 입력해주세요",true);return;}
  const{data:{user:u}}=await supabase.auth.getUser();
  await US.save(cfg,u.id);setNtf(false);setOpenSection(null);ping("저장됐어요");
}}>저장</PBtn>
          </div>
        )}
      </div>

      <SHead>Data</SHead>
      <div className="glass" style={{borderRadius:20,overflow:"hidden",marginBottom:20}}>
        <button onClick={()=>exportXlsx(txns,cfg.projectName)} style={{
          width:"100%",display:"flex",alignItems:"center",gap:14,padding:"14px 16px",
          background:"none",border:"none",cursor:"pointer",fontFamily:"inherit"}}>
          <div style={{width:36,height:36,borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",
            background:"rgba(45,212,191,.15)",border:"1px solid rgba(45,212,191,.25)"}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2DD4BF" strokeWidth="2">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
              <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
          </div>
          <div style={{flex:1,textAlign:"left"}}>
            <div style={{fontSize:14,fontWeight:500,color:"#fff"}}>엑셀 지출결의서 다운로드</div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>

      <SHead>Account</SHead>
      <div className="glass" style={{borderRadius:20,overflow:"hidden",marginBottom:20}}>
        <button onClick={()=>{supabase.auth.signOut();setUser(null);setTxns([]);}} style={{
          width:"100%",display:"flex",alignItems:"center",gap:14,padding:"14px 16px",
          background:"none",border:"none",cursor:"pointer",fontFamily:"inherit"}}>
          <div style={{width:36,height:36,borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",
            background:"rgba(248,113,113,.15)",border:"1px solid rgba(248,113,113,.25)"}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F87171" strokeWidth="2">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
            </svg>
          </div>
          <div style={{flex:1,textAlign:"left"}}>
            <div style={{fontSize:14,fontWeight:500,color:"#F87171"}}>로그아웃</div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F87171" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>

      <div style={{textAlign:"center",marginTop:8}}>
        <p style={{color:"rgba(255,255,255,.2)",fontSize:11}}>ExpenseFlow v1.0.0 · © 2026</p>
      </div>
    </div>
  );

  const fabRight=`max(20px, calc((100vw - 430px) / 2 + 20px))`;

  return (
    <div style={bgStyle}>
      <div style={{position:"absolute",top:-60,right:-40,width:240,height:240,borderRadius:"50%",background:"rgba(74,158,255,.08)",filter:"blur(60px)",pointerEvents:"none",zIndex:0}}/>
      <div style={{position:"absolute",top:"40%",left:-60,width:200,height:200,borderRadius:"50%",background:"rgba(45,212,191,.06)",filter:"blur(50px)",pointerEvents:"none",zIndex:0}}/>

      <Toast toast={toast}/>

      {bottomSheet&&(
        <>
          <div onClick={()=>setBottomSheet(null)} style={{position:"fixed",inset:0,zIndex:300,background:"rgba(0,0,0,.5)",backdropFilter:"blur(4px)"}}/>
          <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",
            width:"100%",maxWidth:430,background:"#141828",borderRadius:"24px 24px 0 0",
            padding:"8px 20px 48px",zIndex:301,animation:"slideUp .22s ease"}}>
            <div style={{width:36,height:4,borderRadius:99,background:"rgba(255,255,255,.2)",margin:"0 auto 20px"}}/>
            <div style={{fontSize:14,fontWeight:600,color:"rgba(255,255,255,.5)",marginBottom:12,textAlign:"center"}}>
              {bottomSheet.tx.merchant}
            </div>
            <button onClick={()=>{setGalleryEdit(bottomSheet.tx);setBottomSheet(null);}} style={{
              width:"100%",padding:"15px",borderRadius:16,background:"rgba(74,158,255,.15)",
              border:"1px solid rgba(74,158,255,.3)",color:"#4A9EFF",fontSize:15,fontWeight:700,
              cursor:"pointer",fontFamily:"inherit",marginBottom:10}}>
              수정
            </button>
            <button onClick={()=>{delTxn(bottomSheet.tx.id);setBottomSheet(null);}} style={{
              width:"100%",padding:"15px",borderRadius:16,background:"rgba(248,113,113,.12)",
              border:"1px solid rgba(248,113,113,.25)",color:"#F87171",fontSize:15,fontWeight:700,
              cursor:"pointer",fontFamily:"inherit"}}>
              삭제
            </button>
          </div>
        </>
      )}

      {galleryEdit&&(
        <GalleryEditOverlay
          tx={galleryEdit}
          recs={recs}
          onSave={saveTx}
          onClose={()=>setGalleryEdit(null)}/>
      )}

      {fabOpen&&<div onClick={()=>setFab(false)} style={{position:"fixed",inset:0,zIndex:40,background:"rgba(0,0,0,.4)",backdropFilter:"blur(3px)"}}/>}
      {overlay&&renderOverlay()}

      {!overlay&&tab==="home"&&renderHome()}
      {!overlay&&tab==="gallery"&&renderGallery()}
      {!overlay&&tab==="settings"&&renderSettings()}

      {/* FAB */}
      {!overlay&&tab!=="settings"&&(
        <>
          {fabOpen&&(
            <div style={{position:"fixed",bottom:150,right:fabRight,display:"flex",flexDirection:"column",gap:8,alignItems:"flex-end",zIndex:60}}>
              {[
                {Icon:IcCamera,label:"카메라로 찍기",fn:()=>camRef.current?.click()},
                {Icon:IcImage,label:"갤러리에서 불러오기",fn:()=>galRef.current?.click()},
                {Icon:IcPencil,label:"직접 입력",fn:()=>{setForm({amount:"",merchant:"",date:todayMD()});setOv("manual");setFab(false);}},
              ].map((opt,i)=>(
                <button key={opt.label} onClick={()=>{opt.fn();setFab(false);}} className="btn-press" style={{
                  display:"flex",alignItems:"center",gap:10,
                  background:"rgba(13,13,20,.9)",border:"1px solid rgba(255,255,255,.15)",
                  borderRadius:99,padding:"10px 16px 10px 14px",fontSize:13,fontWeight:600,color:"#fff",
                  cursor:"pointer",boxShadow:"0 8px 32px rgba(0,0,0,.4)",backdropFilter:"blur(20px)",
                  animation:"fabPop .2s ease both",animationDelay:`${i*.06}s`,fontFamily:"inherit",
                  whiteSpace:"nowrap",transition:"transform .15s"}}>
                  <div style={{width:32,height:32,borderRadius:"50%",background:"linear-gradient(135deg,#4A9EFF,#2DD4BF)",
                    display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
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
              background:"linear-gradient(135deg,#4A9EFF,#2DD4BF)",
              border:"none",fontSize:24,cursor:"pointer",
              display:"flex",alignItems:"center",justifyContent:"center",
              boxShadow:"0 8px 28px rgba(74,158,255,.5)",
              transition:"transform .25s",transform:fabOpen?"rotate(45deg)":"rotate(0deg)",color:"#fff"}}>
              +
            </button>
          </div>
        </>
      )}

      {!overlay&&<TabBar tab={tab} setTab={t=>{setTab(t);setFab(false);}}/>}
      <input ref={camRef} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={e=>handleFile(e.target.files[0])}/>
      <input ref={galRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>handleFile(e.target.files[0])}/>
    </div>
  );
}