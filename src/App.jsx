import { useState, useEffect, useRef, useCallback } from "react";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import "./App.css";
import blobCharacterImg from "./assets/blob-character.png";
import { supabase, GS, US, compress, uploadReceipt } from "./services/supabase";
import { ocr } from "./services/ocr";
import { LIMIT, getTxnSortTime, mKey, monthLabel, normalizeTxnDate, parseTxnDate, todayYMD } from "./utils/date";
import Toast from "./components/Toast";
import FormPage from "./components/FormPage";
import HomeScreen, { CalendarDaySheet } from "./screens/HomeScreen";
import GalleryScreen, { GalleryBottomSheet } from "./screens/GalleryScreen";
import SettingsScreen from "./screens/SettingsScreen";
import { appBackground, brandGradient, glassPanelStrongBackground, textPrimary, textMuted } from "./styles/theme";

if (false && !document.querySelector("#gf3")) {
  const l = document.createElement("link"); l.id = "gf3";
  l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700;800;900&display=swap";
  document.head.appendChild(l);
}
if (false && !document.querySelector("#css3")) {
  const s = document.createElement("style"); s.id = "css3";
  s.textContent = `
    *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
    html,body,#root{
      background:
        radial-gradient(circle at top left, rgba(255,255,255,.78), transparent 26%),
        linear-gradient(160deg,#EEF0FF 0%,#E8F0FA 40%,#E8F4FD 100%);
    }
    body{color:#1E1B4B}
    input,button,textarea{font-family:'Noto Sans KR',sans-serif}
    button{transition:transform .18s ease, box-shadow .22s ease, background-color .22s ease, border-color .22s ease}
    input[type=number]::-webkit-outer-spin-button,input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
    input[type=date]{
      appearance:none;
      -webkit-appearance:none;
      -moz-appearance:textfield;
      color-scheme:light;
      background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='%2394A3B8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='4' width='18' height='18' rx='2'/%3E%3Cpath d='M16 2v4'/%3E%3Cpath d='M8 2v4'/%3E%3Cpath d='M3 10h18'/%3E%3C/svg%3E");
      background-repeat:no-repeat;
      background-position:right 14px center;
      background-size:18px;
      padding-right:44px!important;
    }
    input[type=date]::-webkit-inner-spin-button{display:none}
    input[type=date]::-webkit-clear-button{display:none}
    input[type=date]::-webkit-calendar-picker-indicator{
      opacity:0;
      cursor:pointer;
      position:absolute;
      right:14px;
      width:18px;
      height:18px;
      margin:0;
    }
    input[type=date]::-ms-expand{display:none}
    @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
    @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
    @keyframes slideUp{from{transform:translateX(-50%) translateY(100%)}to{transform:translateX(-50%) translateY(0)}}
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
/* ── Storage & DB ── */
const S = {
  get: async k => { try { const v=localStorage.getItem(k); return v?JSON.parse(v):null; } catch { return null; } },
  set: async (k,v) => { try { localStorage.setItem(k,JSON.stringify(v)); } catch {} },
};

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

const CardSVG = ({size=80,width=size,height=size,style}) => (
  <img
    src={blobCharacterImg}
    alt=""
    style={{width,height,objectFit:"contain",display:"block",animation:"float 3.5s ease-in-out infinite",flexShrink:0,...style}}
  />
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
  const [homeMonthOffset,setHomeMonthOffset]=useState(0);
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
            const normalizedRows = rows.map(r=>({
              id:Number(r.id),
              amount:Number(r.amount),
              merchant:r.merchant,
              date:normalizeTxnDate(r.date,currentServerMonthDate) || r.date,
              image_url:r.image_url||null
            }));
            setTxns(normalizedRows);
            const rd={};rows.forEach(r=>{if(r.image_url) rd[Number(r.id)]=r.image_url;});setRecs(rd);
            GS.migrateDates(rows).catch(()=>{});
          }
          if(settings) setCfg({projectName:settings.project_name||"",email:settings.email||"",threshold:settings.threshold||50000});
        });
      }
    });
    const { data: authListener } = supabase.auth.onAuthStateChange((_,session)=>setUser(session?.user||null));
    return ()=>authListener?.subscription?.unsubscribe();
  },[]);

  useEffect(()=>{
    window.history.replaceState({tab},"");
    const onBack=()=>{
      if(overlay){
        closeOv();
        return;
      }
      if(tab!=="home") setTab("home");
    };
    window.addEventListener("popstate",onBack);
    return()=>window.removeEventListener("popstate",onBack);
  },[overlay,tab]);

  useEffect(()=>{
    setCalDaySheet(null);
  },[homeMonthOffset]);

  const ping=(msg,err=false)=>{setToast({msg,err});setTimeout(()=>setToast(null),2400);};

  // Derived data
  const currentServerDate=new Date();
  const currentServerMonthDate=new Date(currentServerDate.getFullYear(),currentServerDate.getMonth(),1);
  const getDisplayMonthDate=(offset=0)=>new Date(currentServerMonthDate.getFullYear(),currentServerMonthDate.getMonth()-offset,1);
  const toWindowedDate=(dateStr)=>parseTxnDate(dateStr,currentServerMonthDate);
  const filterLabel=monthLabel(galleryFilter);
  const homeMonthDate=getDisplayMonthDate(homeMonthOffset);
  const homeMonthLabel=`${homeMonthDate.getFullYear()}년 ${homeMonthDate.getMonth()+1}월`;
  const canGoPrevHomeMonth=homeMonthOffset<2;
  const canGoNextHomeMonth=homeMonthOffset>0;
  const canGoPrevGalleryMonth=galleryFilter<2;
  const canGoNextGalleryMonth=galleryFilter>0;
  const filteredMonthDate=getDisplayMonthDate(galleryFilter);
  const filteredTxns=txns.filter(tx=>{
    const txDate=toWindowedDate(tx.date);
    return txDate && txDate.getFullYear()===filteredMonthDate.getFullYear() && txDate.getMonth()===filteredMonthDate.getMonth();
  }).sort((a,b)=>getTxnSortTime(b.date,currentServerMonthDate)-getTxnSortTime(a.date,currentServerMonthDate));

  const thisMonthTxns=txns.filter(t=>{
    const txDate=toWindowedDate(t.date);
    return txDate && txDate.getFullYear()===currentServerMonthDate.getFullYear() && txDate.getMonth()===currentServerMonthDate.getMonth();
  }).sort((a,b)=>getTxnSortTime(b.date,currentServerMonthDate)-getTxnSortTime(a.date,currentServerMonthDate));
  const homeMonthTxns=txns.filter(tx=>{
    const txDate=toWindowedDate(tx.date);
    return txDate && txDate.getFullYear()===homeMonthDate.getFullYear() && txDate.getMonth()===homeMonthDate.getMonth();
  }).sort((a,b)=>(toWindowedDate(b.date)?.getTime()||0)-(toWindowedDate(a.date)?.getTime()||0));
  const used=thisMonthTxns.reduce((s,t)=>s+t.amount,0);
  const remaining=LIMIT-used;

  // Date-grouped for home list
  const groupedTxns={};
  homeMonthTxns.forEach(tx=>{
    const k=normalizeTxnDate(tx.date,currentServerMonthDate)||"미상";
    if(!groupedTxns[k])groupedTxns[k]=[];
    groupedTxns[k].push(tx);
  });
  const sortedDateKeys=Object.keys(groupedTxns).sort((a,b)=>(toWindowedDate(b)?.getTime()||0)-(toWindowedDate(a)?.getTime()||0));

  const saveRecs=async n=>{setRecs(n);await S.set(`recs-${mKey()}`,n);};

  const closeOv=()=>{
    if(window.history.state?.overlayOpen){
      window.history.replaceState({tab},"");
    }
    setOv(null);setPv(null);setOcr(null);setForm({amount:"",merchant:"",date:""});setOvSrc(null);setEditTarget(null);
  };
  const pushOverlayHistory=()=>window.history.pushState({tab,overlayOpen:true},"");

  const openEdit=(tx)=>{
    pushOverlayHistory();
    setEditTarget(tx);
    setForm({amount:String(tx.amount),merchant:tx.merchant||"",date:normalizeTxnDate(tx.date,currentServerMonthDate)||todayYMD()});
    setPv(recs[tx.id]||null);
    setOvSrc("edit");
    setOv("form");
    setCalDaySheet(null);
    setGalleryBS(null);
  };

  const handleFile=useCallback(async(file,src="camera")=>{
    if(!file) return; setFab(false);
    pushOverlayHistory();
    const reader=new FileReader();
    reader.onload=async e=>{
      const url=e.target.result; setPv(url); setOv("loading"); setOvSrc(src);
      try{
        const data=await ocr(url.split(",")[1],file.type||"image/jpeg"); setOcr(data);
        setForm({amount:data.amount?String(data.amount):"",merchant:data.merchant!=="알 수 없음"?data.merchant:"",date:normalizeTxnDate(data.date,currentServerMonthDate)||todayYMD()});
      }catch{setOcr({amount:null,merchant:"알 수 없음",date:null});setForm(f=>({...f,date:todayYMD()}));}
      setOv("form");
    };
    reader.readAsDataURL(file);
  },[]);

  const handleSubmit=async()=>{
    const amt=parseInt(String(form.amount).replace(/,/g,""),10);
    if(!amt||amt<=0){ping("금액을 입력해주세요",true);return;}

    if(overlaySource==="edit"&&editTarget){
      await saveTx({...editTarget,amount:amt,merchant:form.merchant||editTarget.merchant,date:normalizeTxnDate(form.date,currentServerMonthDate)||normalizeTxnDate(editTarget.date,currentServerMonthDate)||todayYMD()});
      closeOv();
    } else {
      const id=Date.now();
      const tx={id,amount:amt,merchant:form.merchant||"식당",date:normalizeTxnDate(form.date,currentServerMonthDate)||todayYMD(),image_url:null};
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

  const bgStyle={minHeight:"100vh",background:appBackground,color:textPrimary,fontFamily:"'Noto Sans KR',sans-serif",width:"100%",paddingBottom:120,position:"relative",overflowX:"hidden"};

  /* ── LOGIN ── */
  if(!user) return (
    <div style={{...bgStyle,display:"flex",flexDirection:"column",paddingBottom:0,minHeight:"100dvh"}}>
      <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"36px 20px 18px",textAlign:"center"}}>
        <CardSVG width={132} height={124}/>
        <div style={{fontSize:28,fontWeight:900,letterSpacing:"-1px",color:textPrimary,marginTop:18,marginBottom:8}}>Welcome Back</div>
        <div style={{fontSize:14,color:textMuted}}>Sign in with your Google account</div>
      </div>
      <div style={{padding:"0 24px calc(40px + env(safe-area-inset-bottom,0px)) 24px"}}>
        <div className="glass-panel" style={{background:glassPanelStrongBackground,backdropFilter:"blur(22px)",borderRadius:24,padding:"36px 28px",border:"1px solid rgba(255,255,255,0.95)",boxShadow:"0 20px 44px rgba(99,102,241,0.12)"}}>
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

  const saveProject = async()=>{
    const{data:{user:u}}=await supabase.auth.getUser();
    await US.save(cfg,u.id);
    setOpenSection(null);
    ping("저장됐어요");
  };
  const logout = async()=>{
    await supabase.auth.signOut();
    setUser(null);
    setTxns([]);
  };

  const changeTab=(t)=>{if(t!==tab) window.history.pushState({tab:t},"");setTab(t);setFab(false);};
  const fabRight=`max(20px, calc((100vw - 430px) / 2 + 20px))`;

  return (
    <div style={bgStyle}>
      <Toast toast={toast}/>

      {/* Calendar Day Sheet */}
      {calDaySheet&&(
        <CalendarDaySheet dateKey={calDaySheet} txns={homeMonthTxns} onClose={()=>setCalDaySheet(null)} onEdit={openEdit}/>
      )}

      {/* Gallery bottom sheet */}
      {galleryBottomSheet&&(
        <GalleryBottomSheet
          tx={galleryBottomSheet}
          onClose={()=>setGalleryBS(null)}
          onEdit={()=>openEdit(galleryBottomSheet)}
          onDelete={()=>{delTxn(galleryBottomSheet.id);setGalleryBS(null);}}
        />
      )}

      {/* FAB menu overlay */}
      {fabOpen&&<div onClick={()=>setFab(false)} style={{position:"fixed",inset:0,zIndex:50,background:"rgba(26,26,46,.25)",backdropFilter:"blur(8px)"}}/>}

      {/* Overlay pages */}
      {overlay==="loading"&&<LoadingScreen preview={preview}/>}
      {overlay==="form"&&(
        <FormPage source={overlaySource} preview={preview} ocrRes={ocrRes} form={form} setForm={setForm} onSubmit={handleSubmit}/>
      )}

      {!overlay&&tab==="home"&&(
        <HomeScreen
          txns={txns}
          remaining={remaining}
          used={used}
          limit={LIMIT}
          homeView={homeView}
          setHomeView={setHomeView}
          homeMonthLabel={homeMonthLabel}
          canGoPrevHomeMonth={canGoPrevHomeMonth}
          canGoNextHomeMonth={canGoNextHomeMonth}
          onPrevMonth={()=>canGoPrevHomeMonth&&setHomeMonthOffset(v=>Math.min(2,v+1))}
          onNextMonth={()=>canGoNextHomeMonth&&setHomeMonthOffset(v=>Math.max(0,v-1))}
          homeMonthTxns={homeMonthTxns}
          groupedTxns={groupedTxns}
          sortedDateKeys={sortedDateKeys}
          openEdit={openEdit}
          delTxn={delTxn}
          calDaySheet={calDaySheet}
          setCalDaySheet={setCalDaySheet}
          homeMonthDate={homeMonthDate}
          HeroGraphic={<CardSVG width={102} height={95}/>}
        />
      )}
      {!overlay&&tab==="gallery"&&(
        <GalleryScreen
          filteredTxns={filteredTxns}
          recs={recs}
          canGoPrevGalleryMonth={canGoPrevGalleryMonth}
          canGoNextGalleryMonth={canGoNextGalleryMonth}
          onPrevMonth={()=>canGoPrevGalleryMonth&&setGalleryFilter(f=>Math.min(2,f+1))}
          onNextMonth={()=>canGoNextGalleryMonth&&setGalleryFilter(f=>Math.max(0,f-1))}
          filterLabel={filterLabel}
          onDownloadAll={dlAll}
          onDownloadReceipt={dlRec}
          onOpenItemMenu={setGalleryBS}
          currentServerMonthDate={currentServerMonthDate}
          DownloadIcon={IcDownload}
        />
      )}
      {!overlay&&tab==="settings"&&(
        <SettingsScreen
          user={user}
          cfg={cfg}
          setCfg={setCfg}
          openSection={openSection}
          setOpenSection={setOpenSection}
          onSaveProject={saveProject}
          onExportXlsx={()=>exportXlsx(txns,cfg.projectName)}
          onLogout={logout}
        />
      )}

      {/* FAB */}
      {!overlay&&tab!=="settings"&&(
        <>
          {fabOpen&&(
            <div style={{position:"fixed",bottom:180,right:fabRight,display:"flex",flexDirection:"column",gap:10,alignItems:"flex-end",zIndex:60}}>
              {[
                {Icon:IcCamera,label:"영수증 촬영",fn:()=>camRef.current?.click()},
                {Icon:IcImage,label:"사진 업로드",fn:()=>galRef.current?.click()},
                {Icon:IcPencil,label:"직접 등록",fn:()=>{pushOverlayHistory();setForm({amount:"",merchant:"",date:todayYMD()});setOvSrc("manual");setOv("form");setFab(false);}},
              ].map((opt,i)=>(
                <button key={opt.label} onClick={()=>{opt.fn();setFab(false);}} className="btn-press glass-soft" style={{
                  display:"flex",alignItems:"center",gap:10,background:"linear-gradient(180deg, rgba(255,255,255,.88), rgba(255,255,255,.72))",
                  border:"1px solid rgba(255,255,255,.94)",borderRadius:99,padding:"10px 16px 10px 10px",
                  fontSize:13,fontWeight:600,color:textPrimary,cursor:"pointer",
                  boxShadow:"0 18px 34px rgba(99,102,241,.14)",fontFamily:"inherit",
                  animation:"fabPop .18s ease both",animationDelay:`${i*.05}s`,whiteSpace:"nowrap"}}>
                  <div style={{width:34,height:34,borderRadius:"50%",background:brandGradient,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:"0 10px 18px rgba(99,102,241,.22)"}}>
                    <opt.Icon/>
                  </div>
                  {opt.label}
                </button>
              ))}
            </div>
          )}
          <div style={{position:"fixed",bottom:108,right:fabRight,zIndex:80}}>
            <button className="btn-press" onClick={()=>setFab(p=>!p)} style={{
              width:56,height:56,borderRadius:"50%",background:brandGradient,
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
