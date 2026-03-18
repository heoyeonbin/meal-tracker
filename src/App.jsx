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
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes toast{from{opacity:0;transform:translateX(-50%) translateY(-8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
    @keyframes fabPop{from{opacity:0;transform:scale(.85) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}
    @keyframes bgPulse{0%,100%{opacity:1}50%{opacity:.7}}
    .fu{animation:fadeUp .35s cubic-bezier(.22,1,.36,1) both}
    .glass{background:rgba(255,255,255,0.06);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border:1px solid rgba(255,255,255,0.12)}
    .glass-mid{background:rgba(255,255,255,0.09);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.14)}
    .tx-row:active{background:rgba(255,255,255,0.1)!important}
    .btn-press:active{transform:scale(.96)}
    @media(min-width:768px){#root>div{max-width:430px!important;margin:0 auto!important;box-shadow:0 0 80px rgba(0,0,0,0.6)}}
  `;
  document.head.appendChild(s);
}

/* ── Constants ── */
const LIMIT = 200_000;
const mKey = (offset = 0) => {
  const d = new Date();
  d.setMonth(d.getMonth() - offset);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
};
const monthLabel = (offset = 0) => {
  const d = new Date();
  d.setMonth(d.getMonth() - offset);
  return `${d.getFullYear()}년 ${d.getMonth()+1}월`;
};
const todayMD = () => {
  const d = new Date();
  return `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}`;
};
const todayFull = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};

/* ── Supabase storage ── */
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
    await supabase.from("transactions").insert({ id:tx.id, user_id:user.id, amount:tx.amount, merchant:tx.merchant, date:tx.date });
  },
  del: async id => { await supabase.from("transactions").delete().eq("id",id); },
  update: async tx => { await supabase.from("transactions").update({ amount:tx.amount, merchant:tx.merchant, date:tx.date }).eq("id",tx.id); },
};

/* ── Image compress ── */
const compress = (url,px=900) => new Promise(res => {
  const img=new Image(); img.onload=()=>{
    const sc=Math.min(1,px/Math.max(img.width,img.height));
    const c=document.createElement("canvas"); c.width=img.width*sc; c.height=img.height*sc;
    c.getContext("2d").drawImage(img,0,0,c.width,c.height); res(c.toDataURL("image/jpeg",.7));
  }; img.src=url;
});

/* ── OCR ── */
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

/* ── Excel export ── */
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

/* ── Color helpers ── */
const pctColor = p => p>=90?"#F87171":p>=70?"#FCD34D":"#4A9EFF";

/* ══ CHARACTER ══ */
const FlowerMascot = ({ size=100 }) => (
  <div style={{display:"inline-block",animation:"float 3.5s ease-in-out infinite",width:size,height:size,position:"relative"}}>
    <div style={{position:"absolute",top:-size*.08,left:-size*.15,width:size*.32,height:size*.32,borderRadius:"50%",background:"radial-gradient(circle,rgba(74,158,255,.9) 0%,rgba(74,158,255,.3) 50%,transparent 75%)",filter:`blur(${size*.04}px)`,animation:"float 2.8s ease-in-out infinite",animationDelay:".4s"}}/>
    <div style={{position:"absolute",top:size*.3,right:-size*.18,width:size*.26,height:size*.26,borderRadius:"50%",background:"radial-gradient(circle,rgba(100,180,255,.85) 0%,rgba(74,158,255,.25) 55%,transparent 75%)",filter:`blur(${size*.035}px)`,animation:"float 3.2s ease-in-out infinite",animationDelay:"1s"}}/>
    <div style={{position:"absolute",bottom:size*.02,left:-size*.1,width:size*.2,height:size*.2,borderRadius:"50%",background:"radial-gradient(circle,rgba(45,212,191,.7) 0%,rgba(74,158,255,.2) 55%,transparent 75%)",filter:`blur(${size*.03}px)`,animation:"float 3.8s ease-in-out infinite",animationDelay:".8s"}}/>
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none">
      <defs>
        <radialGradient id="mb1" cx="32%" cy="25%" r="72%">
          <stop offset="0%" stopColor="#A8D8FF"/>
          <stop offset="38%" stopColor="#5AAFF8"/>
          <stop offset="100%" stopColor="#2A82E0"/>
        </radialGradient>
        <radialGradient id="mg1" cx="38%" cy="28%" r="55%" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fff" stopOpacity=".82"/>
          <stop offset="50%" stopColor="#fff" stopOpacity=".18"/>
          <stop offset="100%" stopColor="#fff" stopOpacity="0"/>
        </radialGradient>
        <clipPath id="mc1"><path d="M100,38 C126,32 152,46 162,68 C174,94 168,124 148,142 C128,160 98,168 74,158 C50,148 32,124 30,98 C28,72 42,46 62,38 C74,32 88,36 100,38Z"/></clipPath>
      </defs>
      <ellipse cx="100" cy="108" rx="62" ry="56" fill="rgba(74,158,255,.18)"/>
      <path d="M100,38 C126,32 152,46 162,68 C174,94 168,124 148,142 C128,160 98,168 74,158 C50,148 32,124 30,98 C28,72 42,46 62,38 C74,32 88,36 100,38Z" fill="url(#mb1)"/>
      <g clipPath="url(#mc1)">
        <ellipse cx="82" cy="68" rx="28" ry="18" fill="url(#mg1)" transform="rotate(-22 82 68)"/>
        <ellipse cx="96" cy="52" rx="12" ry="6" fill="white" opacity=".62" transform="rotate(-16 96 52)"/>
      </g>
      <circle cx="86" cy="104" r="4.2" fill="#1A3A80" opacity=".65"/>
      <circle cx="84.6" cy="102.6" r="1.6" fill="white" opacity=".7"/>
      <circle cx="114" cy="104" r="4.2" fill="#1A3A80" opacity=".65"/>
      <circle cx="112.6" cy="102.6" r="1.6" fill="white" opacity=".7"/>
      <path d="M88 114 Q100 122 112 114" stroke="#1A3A80" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity=".65"/>
      <circle cx="76" cy="112" r="7" fill="#F9A8D4" opacity=".28"/>
      <circle cx="124" cy="112" r="7" fill="#F9A8D4" opacity=".28"/>
    </svg>
  </div>
);

const FlowerMascotSm = ({ size=60 }) => (
  <div style={{display:"inline-block",animation:"float 3.5s ease-in-out infinite",animationDelay:".5s",width:size,height:size,position:"relative"}}>
    <div style={{position:"absolute",top:-size*.1,left:-size*.18,width:size*.3,height:size*.3,borderRadius:"50%",background:"radial-gradient(circle,rgba(74,158,255,.8) 0%,transparent 70%)",filter:`blur(${size*.05}px)`}}/>
    <div style={{position:"absolute",top:size*.3,right:-size*.15,width:size*.25,height:size*.25,borderRadius:"50%",background:"radial-gradient(circle,rgba(45,212,191,.7) 0%,transparent 70%)",filter:`blur(${size*.04}px)`}}/>
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none">
      <defs>
        <radialGradient id="sb1" cx="32%" cy="25%" r="72%">
          <stop offset="0%" stopColor="#A8D8FF"/>
          <stop offset="100%" stopColor="#2A82E0"/>
        </radialGradient>
      </defs>
      <path d="M100,42 C122,36 148,50 158,72 C168,96 162,122 144,140 C126,158 98,164 76,154 C54,144 38,120 38,96 C38,72 52,48 72,42 C82,36 92,40 100,42Z" fill="url(#sb1)"/>
      <ellipse cx="84" cy="66" rx="22" ry="14" fill="white" opacity=".38" transform="rotate(-20 84 66)"/>
      <circle cx="88" cy="100" r="3.5" fill="#1A3A80" opacity=".6"/>
      <circle cx="112" cy="100" r="3.5" fill="#1A3A80" opacity=".6"/>
      <path d="M90 110 Q100 117 110 110" stroke="#1A3A80" strokeWidth="2.2" strokeLinecap="round" fill="none" opacity=".6"/>
    </svg>
  </div>
);

/* ── UI Primitives ── */
const Toast = ({toast}) => toast?(
  <div style={{position:"fixed",top:22,left:"50%",transform:"translateX(-50%)",zIndex:9999,
    background:toast.err?"rgba(248,113,113,.92)":"rgba(74,158,255,.92)",
    backdropFilter:"blur(12px)",color:"#fff",padding:"10px 22px",borderRadius:99,
    fontSize:13,fontWeight:700,whiteSpace:"nowrap",boxShadow:"0 8px 32px rgba(0,0,0,.4)",
    animation:"toast .25s ease both",border:"1px solid rgba(255,255,255,.2)"}}>
    {toast.msg}
  </div>
):null;

const GlassInput = ({label,value,onChange,type="text",placeholder,big,hint}) => (
  <div style={{marginBottom:14}}>
    {label&&<div style={{fontSize:10,color:"rgba(255,255,255,.4)",marginBottom:7,fontWeight:700,letterSpacing:".8px",textTransform:"uppercase"}}>{label}</div>}
    <input type={type} value={value} placeholder={placeholder}
      onChange={e=>onChange(e.target.value)}
      style={{width:"100%",background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.1)",
        borderRadius:14,padding:big?"15px 16px":"12px 16px",fontSize:big?22:14,fontWeight:big?800:400,
        color:"#fff",outline:"none",transition:"border-color .2s",colorScheme:"dark",fontFamily:"inherit"}}
      onFocus={e=>e.target.style.borderColor="rgba(74,158,255,.6)"}
      onBlur={e=>e.target.style.borderColor="rgba(255,255,255,.1)"}/>
    {hint&&<div style={{fontSize:11,color:"rgba(255,255,255,.35)",marginTop:5}}>{hint}</div>}
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
      border:"none",color:"#fff",
      boxShadow:"0 4px 20px rgba(74,158,255,.4)"
    })
  }}>{children}</button>
);

const SHead = ({children}) => (
  <div style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,.35)",letterSpacing:".8px",textTransform:"uppercase",marginBottom:10}}>{children}</div>
);

/* ── TxRow with edit ── */
function TxRow({tx,hasRec,onDl,onDel,onSave,delay=0}) {
  const [editing,setEditing]=useState(false);
  const [amt,setAmt]=useState(String(tx.amount));
  const [merch,setMerch]=useState(tx.merchant);
  const [date,setDate]=useState(tx.date||"");

  if(editing) return (
    <div className="fu glass" style={{borderRadius:18,padding:"16px",marginBottom:8,animationDelay:`${delay}s`}}>
      <div style={{fontSize:12,color:"#4A9EFF",fontWeight:700,marginBottom:10}}>내역 수정</div>
      <GlassInput label="금액 (원)" value={amt} onChange={setAmt} type="number" placeholder="13500" big/>
      <GlassInput label="가맹점명" value={merch} onChange={setMerch} placeholder="식당 이름"/>
      <GlassInput label="일자 (MM/DD)" value={date} onChange={setDate} placeholder="03/18"/>
      <div style={{display:"flex",gap:8}}>
        <PBtn small onClick={()=>{onSave({...tx,amount:parseInt(amt)||tx.amount,merchant:merch||tx.merchant,date:date||tx.date});setEditing(false);}}>저장</PBtn>
        <PBtn small secondary onClick={()=>setEditing(false)}>취소</PBtn>
      </div>
    </div>
  );

  return (
    <div className="tx-row fu glass" style={{display:"flex",alignItems:"center",gap:12,
      padding:"13px 14px",borderRadius:18,marginBottom:8,transition:"background .15s",animationDelay:`${delay}s`}}>
      <div style={{width:40,height:40,borderRadius:14,flexShrink:0,
        background:"rgba(74,158,255,.15)",border:"1px solid rgba(74,158,255,.25)",
        display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>🍽</div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:14,fontWeight:600,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tx.merchant}</div>
        <div style={{fontSize:11,color:"rgba(255,255,255,.4)",marginTop:2}}>{tx.date}</div>
      </div>
      {hasRec&&<button onClick={onDl} style={{background:"none",border:"none",cursor:"pointer",fontSize:14,color:"rgba(255,255,255,.4)"}}>↓</button>}
      <button onClick={()=>setEditing(true)} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,color:"rgba(255,255,255,.4)",fontFamily:"inherit"}}>✎</button>
      <div style={{fontSize:14,fontWeight:800,color:"#fff",flexShrink:0}}>−{tx.amount.toLocaleString()}원</div>
      <button onClick={onDel} style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:"rgba(255,255,255,.2)",lineHeight:1,marginLeft:2}}>×</button>
    </div>
  );
}

/* ── Tab Bar ── */
const TabBar = ({tab,setTab}) => {
  const tabs=[{id:"home",label:"홈"},{id:"gallery",label:"갤러리"},{id:"settings",label:"설정"}];
  const icons = {home:"⌂",gallery:"⊞",settings:"⊙"};
  return (
    <div className="glass" style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",
      width:"100%",maxWidth:430,display:"flex",zIndex:100,
      paddingBottom:"env(safe-area-inset-bottom,8px)",borderRadius:"24px 24px 0 0",borderBottom:"none"}}>
      {tabs.map(t=>(
        <button key={t.id} className="btn-press" onClick={()=>setTab(t.id)} style={{
          flex:1,background:"none",border:"none",cursor:"pointer",
          padding:"12px 0 8px",display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
          <span style={{fontSize:20,color:tab===t.id?"#4A9EFF":"rgba(255,255,255,.3)",transition:"color .2s"}}>{icons[t.id]}</span>
          <span style={{fontSize:10,fontWeight:tab===t.id?700:400,color:tab===t.id?"#4A9EFF":"rgba(255,255,255,.3)",transition:"color .2s"}}>{t.label}</span>
        </button>
      ))}
    </div>
  );
};

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
  const [galleryFilter,setGalleryFilter]=useState(0); // 0=이번달, 1=지난달, 2=2달전
  const camRef=useRef(); const galRef=useRef();

  useEffect(()=>{
    supabase.auth.getUser().then(({data:{user}})=>{
      setUser(user);
      if(user){
        Promise.all([GS.load(),S.get("cfg"),S.get(`recs-${mKey()}`)]).then(([rows,c,r])=>{
          if(rows.length) setTxns(rows.map(row=>({id:Number(row.id),amount:Number(row.amount),merchant:row.merchant,date:row.date})));
          if(c) setCfg(c);
          if(r) setRecs(r);
        });
      }
    });
    supabase.auth.onAuthStateChange((_,session)=>setUser(session?.user||null));
  },[]);

  const ping=(msg,err=false)=>{setToast({msg,err});setTimeout(()=>setToast(null),2400);};

  // Filter txns by selected month
  const filterKey = mKey(galleryFilter);
  const filterLabel = monthLabel(galleryFilter);
  const filteredTxns = txns.filter(tx => {
    if(!tx.date) return galleryFilter===0;
    const [mm] = tx.date.split("/");
    const d = new Date();
    d.setMonth(d.getMonth()-galleryFilter);
    return parseInt(mm)===d.getMonth()+1;
  });

  const used=txns.filter(tx=>{
    if(!tx.date) return true;
    const [mm]=tx.date.split("/");
    return parseInt(mm)===new Date().getMonth()+1;
  }).reduce((s,t)=>s+t.amount,0);
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
    const tx={id,amount:amt,merchant:form.merchant||"식당",date:form.date||todayMD()};
    const next=[tx,...txns];
    setTxns(next);
    await GS.add(tx);
    if(preview){const c=await compress(preview);await saveRecs({...recs,[id]:c});}
    tryNotify(LIMIT-next.filter(t=>{const[mm]=(t.date||"").split("/");return parseInt(mm)===new Date().getMonth()+1;}).reduce((s,t)=>s+t.amount,0));
    ping(`${amt.toLocaleString()}원 추가됐어요`);
    closeOv();
  };

  const saveTx=async updated=>{setTxns(txns.map(t=>t.id===updated.id?updated:t));await GS.update(updated);ping("수정됐어요");};
  const delTxn=async id=>{
    const nr={...recs};delete nr[id];
    setTxns(txns.filter(t=>t.id!==id));await GS.del(id);await saveRecs(nr);ping("삭제됐어요");
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

  /* BG */
  const bgStyle={
    minHeight:"100vh",
    background:"linear-gradient(160deg,#0d0d14 0%,#111827 50%,#0d1f3a 100%)",
    color:"#fff",fontFamily:"'Noto Sans KR',sans-serif",
    width:"100%",paddingBottom:84,position:"relative",
  };

  /* ── LOGIN ── */
  if(!user) return (
    <div style={{...bgStyle,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",paddingBottom:0}}>
      <div style={{position:"absolute",top:"15%",left:"50%",transform:"translateX(-50%)"}}>
        <FlowerMascot size={120}/>
      </div>
      <div style={{textAlign:"center",marginTop:180}}>
        <div style={{fontSize:28,fontWeight:900,letterSpacing:"-1px",marginBottom:6}}>ExpenseFlow</div>
        <div style={{fontSize:14,color:"rgba(255,255,255,.5)",marginBottom:48}}>법인카드 식대를 스마트하게</div>
        <button className="btn-press" onClick={()=>supabase.auth.signInWithOAuth({provider:"google",options:{redirectTo:window.location.origin}})} style={{
          display:"flex",alignItems:"center",gap:12,background:"#fff",color:"#1a1a2e",border:"none",
          borderRadius:18,padding:"15px 32px",fontSize:15,fontWeight:700,cursor:"pointer",
          boxShadow:"0 8px 32px rgba(0,0,0,.3)",margin:"0 auto",fontFamily:"inherit"
        }}>
          <span style={{fontSize:20}}>🔑</span> Google로 시작하기
        </button>
      </div>
    </div>
  );

  /* ── OVERLAY ── */
  const renderOverlay = () => (
    <div style={{position:"fixed",inset:0,background:"linear-gradient(160deg,#0d0d14,#111827,#0d1f3a)",
      zIndex:200,maxWidth:430,margin:"0 auto",overflowY:"auto"}}>
      {/* Header */}
      <div style={{padding:"52px 20px 16px",display:"flex",alignItems:"center",gap:12,
        background:"linear-gradient(to bottom,rgba(13,13,20,.95),transparent)",
        backdropFilter:"blur(12px)"}}>
        <button onClick={closeOv} className="btn-press" style={{
          width:36,height:36,borderRadius:"50%",background:"rgba(255,255,255,.06)",
          border:"1px solid rgba(255,255,255,.12)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
          <span style={{fontSize:18,color:"#fff"}}>‹</span>
        </button>
        <div style={{fontSize:17,fontWeight:700}}>{overlay==="confirm"?"영수증 확인":overlay==="manual"?"직접 입력":"인식 중..."}</div>
      </div>

      {overlay==="loading"&&(
        <div style={{textAlign:"center",paddingTop:40,paddingBottom:20,padding:"40px 24px"}}>
          {preview&&<img src={preview} alt="" style={{width:"100%",maxHeight:220,objectFit:"cover",borderRadius:20,marginBottom:28,opacity:.6}}/>}
          <FlowerMascot size={80}/>
          <div style={{marginTop:16,color:"rgba(255,255,255,.6)",fontSize:14}}>영수증 읽는 중...</div>
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
                <div style={{fontSize:10,color:"#4A9EFF",fontWeight:700,marginBottom:4,letterSpacing:".5px"}}>✓ 자동 인식 완료</div>
                <div style={{fontSize:30,fontWeight:900,color:"#fff"}}>{ocrRes.amount.toLocaleString()}원</div>
                {ocrRes.date&&<div style={{fontSize:12,color:"rgba(255,255,255,.5)",marginTop:3}}>{ocrRes.date}</div>}
              </div>
              :<div style={{background:"rgba(248,113,113,.15)",border:"1px solid rgba(248,113,113,.3)",borderRadius:16,padding:"13px 18px",marginBottom:16,fontSize:13,color:"#F87171"}}>
                인식 실패 — 아래에 직접 입력해주세요
              </div>
          )}
          <GlassInput label="결제 금액 (원)" value={form.amount} onChange={v=>setForm(f=>({...f,amount:v}))} type="number" placeholder="13500" big hint="단체 식사 시 실제 부담 금액으로 수정하세요"/>
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
  const renderHome = () => (
    <div style={{position:"relative",zIndex:1}}>
      {/* Header */}
      <div style={{padding:"52px 20px 0",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div>
          <div style={{fontSize:11,color:"rgba(255,255,255,.35)",letterSpacing:".8px",textTransform:"uppercase",marginBottom:4}}>{monthLabel()} 식대</div>
          <div style={{fontSize:22,fontWeight:800,letterSpacing:"-0.5px"}}>ExpenseFlow</div>
        </div>
      </div>

      {/* Hero balance card */}
      <div style={{padding:"16px 20px 0"}}>
        <div className="glass" style={{borderRadius:24,padding:"20px 22px",
          background:"linear-gradient(135deg,rgba(74,158,255,.1) 0%,rgba(45,212,191,.07) 100%)",
          border:"1px solid rgba(74,158,255,.2)"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div>
              <div style={{fontSize:12,color:"rgba(255,255,255,.5)",marginBottom:8}}>남은 잔액</div>
              <div style={{fontSize:44,fontWeight:900,letterSpacing:"-2px",color:pc,lineHeight:1}}>
                {remaining.toLocaleString()}<span style={{fontSize:18,marginLeft:4,fontWeight:600}}>원</span>
              </div>
              <div style={{fontSize:12,color:"rgba(255,255,255,.4)",marginTop:8}}>{used.toLocaleString()}원 사용 · 한도 200,000원</div>
            </div>
            <FlowerMascot size={90}/>
          </div>
          <div style={{marginTop:16}}>
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
      </div>

      {/* Stats */}
      <div style={{display:"flex",gap:8,padding:"10px 20px 0"}}>
        {[
          {l:"사용 건수",v:`${txns.filter(t=>{const[mm]=(t.date||"").split("/");return parseInt(mm)===new Date().getMonth()+1;}).length}건`},
          {l:"평균 1회",v:used&&txns.length?`${Math.round(used/txns.filter(t=>{const[mm]=(t.date||"").split("/");return parseInt(mm)===new Date().getMonth()+1;}).length).toLocaleString()}원`:"-"},
          {l:"잔여율",v:`${Math.round(100-pct)}%`},
        ].map(s=>(
          <div key={s.l} className="glass" style={{flex:1,borderRadius:16,padding:"13px 8px",textAlign:"center"}}>
            <div style={{fontSize:15,fontWeight:800,color:"#fff"}}>{s.v}</div>
            <div style={{fontSize:10,color:"rgba(255,255,255,.4)",marginTop:3}}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Excel btn */}
      {txns.length>0&&(
        <div style={{padding:"10px 20px 0"}}>
          <button className="btn-press glass" onClick={()=>exportXlsx(txns,cfg.projectName)} style={{
            width:"100%",borderRadius:14,padding:"12px",fontSize:13,fontWeight:600,color:"rgba(255,255,255,.8)",
            cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,transition:"transform .15s"}}>
            <span>📊</span><span>지출결의서 엑셀 다운로드</span>
          </button>
        </div>
      )}

      {/* Tx list */}
      <div style={{padding:"16px 20px 0"}}>
        <SHead>이번 달 내역</SHead>
        {txns.filter(t=>{const[mm]=(t.date||"").split("/");return parseInt(mm)===new Date().getMonth()+1;}).length===0&&(
          <div style={{textAlign:"center",padding:"48px 0",color:"rgba(255,255,255,.5)"}}>
            <FlowerMascotSm size={56}/>
            <div style={{fontSize:14,fontWeight:600,marginTop:12}}>아직 기록이 없어요</div>
            <div style={{fontSize:12,color:"rgba(255,255,255,.3)",marginTop:6}}>우측 하단 + 버튼으로 추가해봐요</div>
          </div>
        )}
        {txns.filter(t=>{const[mm]=(t.date||"").split("/");return parseInt(mm)===new Date().getMonth()+1;})
          .slice(0,5).map((tx,i)=>(
          <TxRow key={tx.id} tx={tx} hasRec={!!recs[tx.id]} onDl={()=>dlRec(tx.id)} onDel={()=>delTxn(tx.id)} onSave={saveTx} delay={i*.05}/>
        ))}
        {txns.filter(t=>{const[mm]=(t.date||"").split("/");return parseInt(mm)===new Date().getMonth()+1;}).length>5&&(
          <button onClick={()=>setTab("gallery")} style={{width:"100%",background:"none",border:"none",color:"rgba(255,255,255,.4)",fontSize:13,cursor:"pointer",padding:"10px",fontFamily:"inherit"}}>
            더보기 →
          </button>
        )}
      </div>
    </div>
  );

  /* ── GALLERY ── */
  const renderGallery = () => (
    <div style={{padding:"52px 20px 0",position:"relative",zIndex:1}}>
      {/* Header */}
      <div style={{marginBottom:16}}>
        <div style={{fontSize:11,color:"rgba(255,255,255,.35)",letterSpacing:".8px",textTransform:"uppercase",marginBottom:4}}>영수증 보관함</div>
        <div style={{fontSize:22,fontWeight:800,letterSpacing:"-0.5px"}}>갤러리</div>
      </div>

      {/* Month filter */}
      <div style={{display:"flex",gap:8,marginBottom:16,overflowX:"auto",paddingBottom:4}}>
        {[{label:"이번 달",offset:0},{label:"지난 달",offset:1},{label:"2달 전",offset:2}].map(f=>(
          <button key={f.offset} className="btn-press" onClick={()=>setGalleryFilter(f.offset)} style={{
            padding:"8px 16px",borderRadius:99,whiteSpace:"nowrap",fontSize:12,fontWeight:600,cursor:"pointer",
            transition:"all .2s",fontFamily:"inherit",
            ...(galleryFilter===f.offset?{
              background:"linear-gradient(135deg,#4A9EFF,#2DD4BF)",color:"#fff",border:"none",
              boxShadow:"0 2px 12px rgba(74,158,255,.4)"
            }:{
              background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.12)",color:"rgba(255,255,255,.5)"
            })
          }}>{f.label}</button>
        ))}
      </div>

      {/* Month summary */}
      <div className="glass" style={{borderRadius:20,padding:"16px 18px",marginBottom:16,
        background:"linear-gradient(135deg,rgba(74,158,255,.1),rgba(45,212,191,.07))",
        border:"1px solid rgba(74,158,255,.2)"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <div style={{fontSize:12,color:"rgba(255,255,255,.5)",marginBottom:4}}>{filterLabel} 합계</div>
            <div style={{fontSize:26,fontWeight:800,letterSpacing:"-1px"}}>
              {filteredTxns.reduce((s,t)=>s+t.amount,0).toLocaleString()}원
            </div>
            <div style={{fontSize:11,color:"rgba(255,255,255,.4)",marginTop:3}}>{filteredTxns.length}건</div>
          </div>
          <FlowerMascotSm size={56}/>
        </div>
      </div>

      {/* Receipt image grid */}
      {Object.keys(recs).length>0&&(
        <>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <SHead>영수증 이미지</SHead>
            <button onClick={dlAll} style={{background:"none",border:"none",color:"#4A9EFF",fontSize:12,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>
              전체 다운로드 ↓
            </button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
            {txns.filter(t=>recs[t.id]).map(tx=>(
              <div key={tx.id} className="glass" onClick={()=>dlRec(tx.id)} style={{borderRadius:18,overflow:"hidden",cursor:"pointer"}}>
                <img src={recs[tx.id]} alt="" style={{width:"100%",height:110,objectFit:"cover",display:"block"}}/>
                <div style={{padding:"9px 11px"}}>
                  <div style={{fontSize:13,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tx.merchant}</div>
                  <div style={{fontSize:12,color:"#4A9EFF",fontWeight:700,marginTop:2}}>{tx.amount.toLocaleString()}원</div>
                  <div style={{fontSize:11,color:"rgba(255,255,255,.4)",marginTop:1}}>{tx.date}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Full tx list for selected month */}
      <SHead>내역</SHead>
      {filteredTxns.length===0&&<div style={{textAlign:"center",padding:"32px 0",color:"rgba(255,255,255,.4)",fontSize:14}}>기록이 없어요</div>}
      {filteredTxns.map((tx,i)=>(
        <TxRow key={tx.id} tx={tx} hasRec={!!recs[tx.id]} onDl={()=>dlRec(tx.id)} onDel={()=>delTxn(tx.id)} onSave={saveTx} delay={i*.04}/>
      ))}
    </div>
  );

  /* ── SETTINGS ── */
  const renderSettings = () => (
    <div style={{padding:"52px 20px 40px",position:"relative",zIndex:1}}>
      <div style={{textAlign:"center",marginBottom:20}}><FlowerMascotSm size={64}/></div>
      <div style={{fontSize:22,fontWeight:800,letterSpacing:"-0.5px",textAlign:"center",marginBottom:24}}>설정</div>

      {/* Account info */}
      <div className="glass" style={{borderRadius:20,padding:"16px 18px",marginBottom:6,
        background:"linear-gradient(135deg,rgba(74,158,255,.1),rgba(45,212,191,.07))",border:"1px solid rgba(74,158,255,.2)"}}>
        <div style={{fontSize:10,color:"rgba(255,255,255,.4)",marginBottom:4,letterSpacing:".5px"}}>로그인 계정</div>
        <div style={{fontSize:14,fontWeight:600,color:"#fff"}}>{user?.email}</div>
      </div>
      <div style={{marginBottom:20}}>
        <PBtn secondary small onClick={()=>{supabase.auth.signOut();setUser(null);setTxns([]);}}>로그아웃</PBtn>
      </div>

      <SHead>프로젝트 정보</SHead>
      <div className="glass" style={{borderRadius:20,padding:"18px",marginBottom:20}}>
        <GlassInput label="프로젝트명" value={cfg.projectName} onChange={v=>setCfg(c=>({...c,projectName:v}))} placeholder="예: 2025 마케팅팀" hint="엑셀 지출결의서 프로젝트명 칸에 자동 입력"/>
      </div>

      <SHead>잔액 알림</SHead>
      <div className="glass" style={{borderRadius:20,padding:"18px",marginBottom:20}}>
        <GlassInput label="알림 받을 이메일" value={cfg.email} onChange={v=>setCfg(c=>({...c,email:v}))} placeholder="me@company.com"/>
        <div style={{fontSize:11,color:"rgba(255,255,255,.35)",marginBottom:10}}>알림 기준 잔액</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
          {[30000,50000,70000,100000].map(v=>(
            <button key={v} className="btn-press" onClick={()=>setCfg(c=>({...c,threshold:v}))} style={{
              padding:"8px 14px",borderRadius:99,fontFamily:"inherit",cursor:"pointer",transition:"all .15s",
              border:`1.5px solid ${cfg.threshold===v?"rgba(74,158,255,.8)":"rgba(255,255,255,.12)"}`,
              background:cfg.threshold===v?"rgba(74,158,255,.2)":"rgba(255,255,255,.05)",
              color:cfg.threshold===v?"#4A9EFF":"rgba(255,255,255,.5)",
              fontSize:12,fontWeight:cfg.threshold===v?700:400}}>
              {v.toLocaleString()}원
            </button>
          ))}
        </div>
        <GlassInput label="직접 입력 (원)" value={String(cfg.threshold)} onChange={v=>setCfg(c=>({...c,threshold:parseInt(v)||0}))} type="number" placeholder="50000"/>
        <div style={{fontSize:11,color:"rgba(255,255,255,.3)",lineHeight:1.6}}>잔액 기준 이하 도달 시 이메일 앱이 자동으로 열려요</div>
      </div>

      <SHead>엑셀 내보내기</SHead>
      <div className="glass" style={{borderRadius:20,padding:"18px",marginBottom:20}}>
        <PBtn onClick={()=>exportXlsx(txns,cfg.projectName)}>📊 지출결의서 다운로드</PBtn>
        <div style={{fontSize:11,color:"rgba(255,255,255,.3)",marginTop:10}}>A열 프로젝트명 / E열 일자 / F열 금액 자동 입력</div>
      </div>

      <PBtn onClick={()=>{S.set("cfg",cfg);setNtf(false);ping("저장됐어요");}}>전체 설정 저장</PBtn>
    </div>
  );

  return (
    <div style={bgStyle}>
      {/* Ambient blobs */}
      <div style={{position:"absolute",top:-60,right:-40,width:240,height:240,borderRadius:"50%",background:"rgba(74,158,255,.08)",filter:"blur(60px)",pointerEvents:"none",zIndex:0}}/>
      <div style={{position:"absolute",top:"40%",left:-60,width:200,height:200,borderRadius:"50%",background:"rgba(45,212,191,.06)",filter:"blur(50px)",pointerEvents:"none",zIndex:0}}/>

      <Toast toast={toast}/>
      {fabOpen&&<div onClick={()=>setFab(false)} style={{position:"fixed",inset:0,zIndex:40,background:"rgba(0,0,0,.4)",backdropFilter:"blur(3px)"}}/>}
      {overlay&&renderOverlay()}

      {!overlay&&tab==="home"&&renderHome()}
      {!overlay&&tab==="gallery"&&renderGallery()}
      {!overlay&&tab==="settings"&&renderSettings()}

      {/* FAB - bottom right */}
      {!overlay&&tab!=="settings"&&(
        <>
          {fabOpen&&(
            <div style={{position:"fixed",bottom:150,right:20,display:"flex",flexDirection:"column",gap:8,alignItems:"flex-end",zIndex:60}}>
              {[
                {icon:"📷",label:"카메라로 찍기",fn:()=>camRef.current?.click()},
                {icon:"🖼",label:"갤러리에서 불러오기",fn:()=>galRef.current?.click()},
                {icon:"✏️",label:"직접 입력",fn:()=>{setForm({amount:"",merchant:"",date:todayMD()});setOv("manual");setFab(false);}},
              ].map((opt,i)=>(
                <button key={opt.label} onClick={()=>{opt.fn();setFab(false);}} className="btn-press" style={{
                  display:"flex",alignItems:"center",gap:10,
                  background:"rgba(13,13,20,.9)",border:"1px solid rgba(255,255,255,.15)",
                  borderRadius:99,padding:"10px 16px 10px 14px",fontSize:13,fontWeight:600,color:"#fff",
                  cursor:"pointer",boxShadow:"0 8px 32px rgba(0,0,0,.4)",backdropFilter:"blur(20px)",
                  animation:"fabPop .2s ease both",animationDelay:`${i*.06}s`,fontFamily:"inherit",
                  whiteSpace:"nowrap",transition:"transform .15s"}}>
                  <span style={{fontSize:18}}>{opt.icon}</span><span>{opt.label}</span>
                </button>
              ))}
            </div>
          )}
          <div style={{position:"fixed",bottom:90,right:20,zIndex:80}}>
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