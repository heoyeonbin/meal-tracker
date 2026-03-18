import { useState, useEffect, useRef, useCallback } from "react";
import * as XLSX from "xlsx";

const LIMIT = 200_000;
const C = {
  bg:"#F5F1EB", surface:"#FFFFFF", overlay:"#FAF8F4",
  ink:"#1C1814", inkMid:"#6B6560", inkFaint:"#C2BDB7",
  green:"#1A5C3A", greenLight:"#EAF4EE", greenMid:"#2E7D52",
  amber:"#C8860A", amberLight:"#FDF3E0",
  red:"#C0392B", redLight:"#FDECEA",
  shadow:"0 2px 16px rgba(28,24,20,.08)",
  shadowMd:"0 6px 32px rgba(28,24,20,.13)",
};

if (!document.querySelector("#gfont-meal")) {
  const l = document.createElement("link"); l.id="gfont-meal";
  l.rel="stylesheet"; l.href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Noto+Sans+KR:wght@400;500;600;700&display=swap";
  document.head.appendChild(l);
}
if (!document.querySelector("#css-meal")) {
  const s = document.createElement("style"); s.id="css-meal";
  s.textContent=`
    *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
    input,button{font-family:'Noto Sans KR',sans-serif}
    input[type=number]::-webkit-outer-spin-button,input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
    @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(-8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
    @keyframes fabPop{from{opacity:0;transform:scale(.88) translateY(6px)}to{opacity:1;transform:scale(1) translateY(0)}}
    .fu{animation:fadeUp .35s cubic-bezier(.22,1,.36,1) both}
    .tx-row:hover{background:#FDFAF6!important}
    .icon-btn:active{opacity:.5}
    .nav-btn:active,.primary-btn:active{transform:scale(.95)}
  `;
  document.head.appendChild(s);
}

const mKey = () => { const d=new Date(); return `meal-${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; };
const S = {
  get: async k => {
    const v = localStorage.getItem(k);
    return v ? JSON.parse(v) : null;
  },
  set: async (k,v) => { localStorage.setItem(k, JSON.stringify(v)); },
};
const compress = (url,px=900) => new Promise(res => {
  const img=new Image(); img.onload=()=>{
    const s=Math.min(1,px/Math.max(img.width,img.height));
    const c=document.createElement("canvas"); c.width=img.width*s; c.height=img.height*s;
    c.getContext("2d").drawImage(img,0,0,c.width,c.height); res(c.toDataURL("image/jpeg",.7));
  }; img.src=url;
});

async function ocr(b64, mt) {
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages",{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "x-api-key": import.meta.env.VITE_ANTHROPIC_API_KEY,
        "anthropic-version":"2023-06-01",
        "anthropic-dangerous-direct-browser-access":"true",
      },
      body:JSON.stringify({
        model:"claude-sonnet-4-20250514", max_tokens:200,
        system:`Receipt parser. Return ONLY valid JSON:
{"amount":number_or_null,"merchant":"string","date":"MM/DD"}
- amount: total KRW integer
- merchant: store name in Korean or "알 수 없음"
- date: receipt date as MM/DD. If not found, return null.`,
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

const todayMD = () => { const d=new Date(); return `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}`; };
const pctColor = p => p>=90?C.red:p>=70?C.amber:C.green;
const monthLabel = () => { const d=new Date(); return `${d.getFullYear()}년 ${d.getMonth()+1}월`; };

function exportXlsx(txns, projectName) {
  const wb = XLSX.utils.book_new();
  const ws = {};
  const sc = (addr, v) => { ws[addr] = {v, t: typeof v==="number"?"n":"s"}; };

  sc("A1","법인카드 지출 결의서");
  sc("A3","일자 :                                                                           성명 :  (인)");
  sc("A4","아래와 같이 지출 결의서를 제출하오니 확인 바랍니다.");
  sc("A5","=== 아     래 ===");
  sc("A6","1. 개인 경비 및 지원금");
  sc("A7","프로젝트명"); sc("D7","항목"); sc("E7","일자"); sc("F7","금액"); sc("G7","비고");

  const proj = projectName || "";
  for (let i=0; i<22; i++) {
    const row = 8+i;
    sc(`A${row}`, proj);
    sc(`D${row}`,"식비");
    if (i < txns.length) {
      sc(`E${row}`, txns[i].date || "");
      ws[`F${row}`] = { v: txns[i].amount, t:"n" };
    }
  }
  sc("A30","소계");
  ws["F30"] = { f:"SUM(F8:F29)", t:"n" };

  const merges = [
    {s:{r:0,c:0},e:{r:1,c:6}},
    {s:{r:2,c:0},e:{r:2,c:6}},
    {s:{r:3,c:0},e:{r:3,c:6}},
    {s:{r:4,c:0},e:{r:4,c:6}},
    {s:{r:5,c:0},e:{r:5,c:6}},
    {s:{r:6,c:0},e:{r:6,c:2}},
  ];
  for (let i=0;i<22;i++) merges.push({s:{r:7+i,c:0},e:{r:7+i,c:2}});
  merges.push({s:{r:29,c:0},e:{r:29,c:2}});

  ws["!merges"]=merges;
  ws["!ref"]="A1:G30";
  ws["!cols"]=[{wch:8},{wch:8},{wch:8},{wch:8},{wch:12},{wch:12},{wch:12}];
  XLSX.utils.book_append_sheet(wb,ws,"수입지출계획");
  const d=new Date();
  XLSX.writeFile(wb,`${d.getMonth()+1}월_지출결의서_${proj||"식대"}.xlsx`);
}

const BigNum = ({v,color=C.ink}) => (
  <span style={{fontFamily:"'Playfair Display',serif",fontSize:50,fontWeight:900,color,letterSpacing:"-2px",lineHeight:1}}>
    {v.toLocaleString()}<span style={{fontSize:18,fontWeight:700,marginLeft:4,fontFamily:"'Noto Sans KR',sans-serif"}}>원</span>
  </span>
);
const Pill = ({label,value,accent}) => (
  <div style={{flex:1,background:accent?C.greenLight:C.surface,borderRadius:14,padding:"13px 8px",textAlign:"center",boxShadow:accent?"none":C.shadow}}>
    <div style={{fontSize:16,fontWeight:700,color:accent?C.green:C.ink,fontFamily:"'Playfair Display',serif"}}>{value}</div>
    <div style={{fontSize:11,color:C.inkMid,marginTop:3}}>{label}</div>
  </div>
);
const FI = ({label,value,onChange,type="text",placeholder,big,hint}) => (
  <div style={{marginBottom:16}}>
    {label&&<div style={{fontSize:12,color:C.inkMid,marginBottom:7,fontWeight:500}}>{label}</div>}
    <input type={type} value={value} placeholder={placeholder}
      onChange={e=>onChange(e.target.value)}
      style={{width:"100%",background:C.overlay,border:`1.5px solid ${C.bg}`,borderRadius:12,
        padding:big?"15px 14px":"12px 14px",fontSize:big?22:14,fontWeight:big?700:400,
        color:C.ink,outline:"none",transition:"border-color .2s"}}
      onFocus={e=>e.target.style.borderColor=C.green}
      onBlur={e=>e.target.style.borderColor=C.bg}/>
    {hint&&<div style={{fontSize:11,color:C.inkFaint,marginTop:5}}>{hint}</div>}
  </div>
);
const PBtn = ({onClick,children,secondary,small}) => (
  <button className="primary-btn" onClick={onClick} style={{
    width:"100%",background:secondary?C.surface:C.ink,
    border:secondary?`1.5px solid ${C.inkFaint}`:"none",
    borderRadius:14,padding:small?"11px":"15px",fontSize:small?13:14,
    fontWeight:700,color:secondary?C.ink:"#fff",cursor:"pointer",
    boxShadow:secondary?"none":C.shadow,transition:"transform .15s"}}>
    {children}
  </button>
);
const SHead = ({children}) => (
  <div style={{fontSize:11,fontWeight:700,color:C.inkMid,letterSpacing:".8px",textTransform:"uppercase",marginBottom:12}}>{children}</div>
);
const Toast = ({toast}) => toast?(
  <div style={{position:"fixed",top:20,left:"50%",transform:"translateX(-50%)",zIndex:9999,
    background:toast.err?C.red:C.ink,color:"#fff",padding:"10px 20px",borderRadius:99,
    fontSize:13,fontWeight:600,whiteSpace:"nowrap",boxShadow:C.shadowMd,
    animation:"toastIn .25s ease both"}}>
    {toast.msg}
  </div>
):null;

function TxRow({tx,hasRec,onDl,onDel,onSave,delay=0}) {
  const [editing,setEditing] = useState(false);
  const [amt,setAmt] = useState(String(tx.amount));
  const [merch,setMerch] = useState(tx.merchant);
  const [date,setDate] = useState(tx.date||"");

  if (editing) return (
    <div className="fu" style={{background:C.surface,borderRadius:16,padding:"14px 16px",marginBottom:8,boxShadow:C.shadowMd,animationDelay:`${delay}s`}}>
      <div style={{fontSize:12,color:C.green,fontWeight:700,marginBottom:10}}>내역 수정</div>
      <FI label="금액 (원)" value={amt} onChange={setAmt} type="number" placeholder="13500" big/>
      <FI label="가맹점명" value={merch} onChange={setMerch} placeholder="식당 이름"/>
      <FI label="일자 (MM/DD)" value={date} onChange={setDate} placeholder="05/20"/>
      <div style={{display:"flex",gap:8}}>
        <PBtn small onClick={()=>{onSave({...tx,amount:parseInt(amt)||tx.amount,merchant:merch||tx.merchant,date:date||tx.date});setEditing(false);}}>저장</PBtn>
        <PBtn small secondary onClick={()=>setEditing(false)}>취소</PBtn>
      </div>
    </div>
  );

  return (
    <div className="tx-row fu" style={{display:"flex",alignItems:"center",gap:10,padding:"13px 14px",
      background:C.surface,borderRadius:16,marginBottom:8,boxShadow:C.shadow,
      transition:"background .15s",animationDelay:`${delay}s`}}>
      <div style={{width:36,height:36,borderRadius:12,background:C.greenLight,
        display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:15}}>🍽</div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:14,fontWeight:600,color:C.ink,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tx.merchant}</div>
        <div style={{fontSize:11,color:C.inkMid,marginTop:2}}>{tx.date}</div>
      </div>
      {hasRec&&<button className="icon-btn" onClick={onDl} style={{background:"none",border:"none",cursor:"pointer",fontSize:14,color:C.inkMid}}>↓</button>}
      <button className="icon-btn" onClick={()=>setEditing(true)} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,color:C.inkMid,fontFamily:"inherit"}}>✎</button>
      <div style={{fontSize:14,fontWeight:700,color:C.ink,flexShrink:0}}>−{tx.amount.toLocaleString()}원</div>
      <button className="icon-btn" onClick={onDel} style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:C.inkFaint,lineHeight:1,marginLeft:2}}>×</button>
    </div>
  );
}

const TabBar = ({tab,setTab}) => {
  const tabs=[{id:"home",icon:"◎",label:"홈"},{id:"gallery",icon:"⊞",label:"갤러리"},{id:"settings",icon:"⊙",label:"설정"}];
  return (
    <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",
      width:"100%",maxWidth:430,background:C.surface,borderTop:`1px solid ${C.bg}`,
      display:"flex",zIndex:100,paddingBottom:"env(safe-area-inset-bottom,6px)"}}>
      {tabs.map(t=>(
        <button key={t.id} className="nav-btn" onClick={()=>setTab(t.id)}
          style={{flex:1,background:"none",border:"none",cursor:"pointer",
            padding:"10px 0 8px",display:"flex",flexDirection:"column",
            alignItems:"center",gap:3,transition:"transform .15s"}}>
          <span style={{fontSize:18,color:tab===t.id?C.green:C.inkFaint,transition:"color .2s"}}>{t.icon}</span>
          <span style={{fontSize:10,fontWeight:tab===t.id?700:400,color:tab===t.id?C.green:C.inkMid,transition:"color .2s"}}>{t.label}</span>
        </button>
      ))}
    </div>
  );
};

export default function App() {
  const [txns,setTxns]   = useState([]);
  const [recs,setRecs]   = useState({});
  const [cfg,setCfg]     = useState({email:"",threshold:50000,projectName:""});
  const [tab,setTab]     = useState("home");
  const [overlay,setOv]  = useState(null);
  const [fabOpen,setFab] = useState(false);
  const [preview,setPv]  = useState(null);
  const [ocrRes,setOcr]  = useState(null);
  const [form,setForm]   = useState({amount:"",merchant:"",date:""});
  const [toast,setToast] = useState(null);
  const [notified,setNtf]= useState(false);
  const camRef=useRef(); const galRef=useRef();
  const mk=mKey();

  useEffect(()=>{
    (async()=>{
      const [t,c,r]=await Promise.all([S.get(mk),S.get("cfg"),S.get(`recs-${mk}`)]);
      if(t) setTxns(t); if(c) setCfg(c); if(r) setRecs(r);
    })();
  },[]);

  const ping=(msg,err=false)=>{setToast({msg,err});setTimeout(()=>setToast(null),2400);};
  const used=txns.reduce((s,t)=>s+t.amount,0);
  const remaining=LIMIT-used;
  const pct=Math.min(100,(used/LIMIT)*100);
  const pc=pctColor(pct);

  const saveTxns=async n=>{setTxns(n);await S.set(mk,n);};
  const saveRecs=async n=>{setRecs(n);await S.set(`recs-${mk}`,n);};
  const closeOv=()=>{setOv(null);setPv(null);setOcr(null);setForm({amount:"",merchant:"",date:""});};

  const tryNotify=rem=>{
    if(!cfg.email||rem>cfg.threshold||notified) return;
    setNtf(true);
    const sub=encodeURIComponent(`[법카] 식대 잔액 ${rem.toLocaleString()}원`);
    const body=encodeURIComponent(`식대 잔액 알림\n\n남은 금액: ${rem.toLocaleString()}원\n사용 금액: ${(LIMIT-rem).toLocaleString()}원 / 200,000원`);
    window.open(`mailto:${cfg.email}?subject=${sub}&body=${body}`);
  };

  const handleFile=useCallback(async file=>{
    if(!file) return; setFab(false);
    const reader=new FileReader();
    reader.onload=async e=>{
      const url=e.target.result; setPv(url); setOv("loading");
      try {
        const data=await ocr(url.split(",")[1],file.type||"image/jpeg");
        setOcr(data);
        setForm({
          amount:data.amount?String(data.amount):"",
          merchant:data.merchant&&data.merchant!=="알 수 없음"?data.merchant:"",
          date:data.date||todayMD()
        });
      } catch { setOcr({amount:null,merchant:"알 수 없음",date:null}); setForm(f=>({...f,date:todayMD()})); }
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
    await saveTxns(next);
    if(preview){const c=await compress(preview);await saveRecs({...recs,[id]:c});}
    tryNotify(LIMIT-next.reduce((s,t)=>s+t.amount,0));
    ping(`${amt.toLocaleString()}원 추가됐어요`);
    closeOv();
  };

  const saveTx=async updated=>{
    const next=txns.map(t=>t.id===updated.id?updated:t);
    await saveTxns(next); ping("수정됐어요");
  };

  const delTxn=async id=>{
    const nr={...recs}; delete nr[id];
    await saveTxns(txns.filter(t=>t.id!==id));
    await saveRecs(nr); ping("삭제됐어요");
  };

  const dlRec=id=>{
    const tx=txns.find(t=>t.id===id);
    const a=document.createElement("a");
    a.href=recs[id]; a.download=`영수증_${tx?.merchant||id}.jpg`; a.click();
  };
  const dlAll=async()=>{
    const ids=Object.keys(recs);
    if(!ids.length){ping("저장된 영수증이 없어요",true);return;}
    for(const id of ids){dlRec(parseInt(id));await new Promise(r=>setTimeout(r,350));}
  };

  return (
    <div style={{minHeight:"100vh",background:C.bg,color:C.ink,fontFamily:"'Noto Sans KR',sans-serif",maxWidth:430,margin:"0 auto",paddingBottom:84,position:"relative"}}>
      <Toast toast={toast}/>
      {fabOpen&&<div onClick={()=>setFab(false)} style={{position:"fixed",inset:0,zIndex:40,background:"rgba(245,241,235,.55)",backdropFilter:"blur(2px)"}}/>}

      {overlay&&(
        <div style={{position:"fixed",inset:0,background:C.surface,zIndex:200,maxWidth:430,margin:"0 auto",overflowY:"auto",padding:"52px 22px 40px"}}>
          <button onClick={closeOv} style={{background:"none",border:"none",color:C.inkMid,fontSize:13,cursor:"pointer",marginBottom:28,fontFamily:"inherit",fontWeight:500}}>← 취소</button>
          {overlay==="loading"&&(
            <div style={{textAlign:"center",paddingTop:48}}>
              {preview&&<img src={preview} alt="" style={{width:"100%",maxHeight:180,objectFit:"cover",borderRadius:20,marginBottom:32,opacity:.6}}/>}
              <div style={{width:34,height:34,border:`3px solid ${C.bg}`,borderTop:`3px solid ${C.green}`,borderRadius:"50%",animation:"spin .75s linear infinite",margin:"0 auto 16px"}}/>
              <div style={{color:C.inkMid,fontSize:14}}>영수증 인식 중...</div>
            </div>
          )}
          {(overlay==="confirm"||overlay==="manual")&&(
            <div className="fu">
              <div style={{fontSize:22,fontWeight:700,marginBottom:22,fontFamily:"'Playfair Display',serif"}}>
                {overlay==="confirm"?"영수증 확인":"직접 입력"}
              </div>
              {overlay==="confirm"&&preview&&(
                <div style={{width:"100%",height:190,borderRadius:20,overflow:"hidden",marginBottom:18,boxShadow:C.shadowMd}}>
                  <img src={preview} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                </div>
              )}
              {overlay==="confirm"&&(
                ocrRes?.amount
                  ?<div style={{background:C.greenLight,borderRadius:14,padding:"13px 16px",marginBottom:18}}>
                    <div style={{fontSize:11,color:C.green,fontWeight:700,marginBottom:4}}>✓ 자동 인식</div>
                    <div style={{fontFamily:"'Playfair Display',serif",fontSize:28,fontWeight:900,color:C.green}}>{ocrRes.amount.toLocaleString()}원</div>
                    {ocrRes.date&&<div style={{fontSize:12,color:C.greenMid,marginTop:3}}>{ocrRes.date}</div>}
                  </div>
                  :<div style={{background:C.redLight,borderRadius:14,padding:"13px 16px",marginBottom:18,fontSize:13,color:C.red}}>인식 실패 — 아래에 직접 입력해주세요</div>
              )}
              <FI label="결제 금액 (원)" value={form.amount} onChange={v=>setForm(f=>({...f,amount:v}))} type="number" placeholder="13500" big hint="단체 식사 시 실제 부담 금액으로 수정하세요"/>
              <FI label="일자 (MM/DD)" value={form.date} onChange={v=>setForm(f=>({...f,date:v}))} placeholder="05/20"/>
              <FI label="가맹점명" value={form.merchant} onChange={v=>setForm(f=>({...f,merchant:v}))} placeholder="식당 이름"/>
              <PBtn onClick={addTxn}>추가하기</PBtn>
            </div>
          )}
        </div>
      )}

      {tab==="home"&&!overlay&&(
        <>
          <div style={{padding:"52px 24px 24px",position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",top:-60,right:-40,width:200,height:200,borderRadius:"50%",background:C.greenLight,opacity:.55,zIndex:0}}/>
            <div style={{position:"relative",zIndex:1}}>
              <div style={{fontSize:12,color:C.inkMid,fontWeight:500,marginBottom:14,letterSpacing:".4px"}}>{monthLabel()} · 법인카드 식대</div>
              <div style={{marginBottom:5}}>
                <div style={{fontSize:12,color:C.inkMid,marginBottom:8}}>남은 잔액</div>
                <BigNum v={remaining} color={pc}/>
              </div>
              <div style={{fontSize:13,color:C.inkMid,margin:"12px 0 16px"}}>{used.toLocaleString()}원 사용 · 한도 200,000원</div>
              <div style={{background:C.bg,borderRadius:99,height:6,overflow:"hidden"}}>
                <div style={{width:`${pct}%`,height:"100%",borderRadius:99,background:`linear-gradient(90deg,${pc}88,${pc})`,transition:"width .8s cubic-bezier(.22,1,.36,1)"}}/>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",marginTop:5,fontSize:11,color:C.inkFaint}}>
                <span>0</span><span>200,000원</span>
              </div>
            </div>
          </div>
          <div style={{display:"flex",gap:8,padding:"0 22px 16px"}}>
            <Pill label="사용 건수" value={`${txns.length}건`}/>
            <Pill label="평균 1회" value={txns.length?`${Math.round(used/txns.length).toLocaleString()}원`:"-"}/>
            <Pill label="잔여율" value={`${Math.round(100-pct)}%`} accent={pct<70}/>
          </div>
          {txns.length>0&&(
            <div style={{padding:"0 22px 10px"}}>
              <button onClick={()=>exportXlsx(txns,cfg.projectName)}
                style={{width:"100%",background:C.surface,border:`1.5px solid ${C.bg}`,borderRadius:14,padding:"12px",fontSize:13,fontWeight:600,color:C.ink,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,boxShadow:C.shadow}}>
                <span>📊</span><span>지출결의서 엑셀 다운로드</span>
              </button>
            </div>
          )}
          <div style={{padding:"4px 22px 0"}}>
            <div style={{fontSize:11,fontWeight:700,color:C.inkMid,letterSpacing:".8px",marginBottom:14,textTransform:"uppercase"}}>이번 달 내역</div>
            {txns.length===0&&(
              <div style={{textAlign:"center",padding:"52px 0",color:C.inkMid}}>
                <div style={{fontSize:32,marginBottom:12}}>🍽</div>
                <div style={{fontSize:14,fontWeight:500}}>기록이 없어요</div>
                <div style={{fontSize:12,color:C.inkFaint,marginTop:6}}>아래 + 버튼으로 영수증을 추가해보세요</div>
              </div>
            )}
            {txns.slice(0,5).map((tx,i)=>(
              <TxRow key={tx.id} tx={tx} hasRec={!!recs[tx.id]} onDl={()=>dlRec(tx.id)} onDel={()=>delTxn(tx.id)} onSave={saveTx} delay={i*.05}/>
            ))}
            {txns.length>5&&(
              <button onClick={()=>setTab("gallery")} style={{width:"100%",background:"none",border:"none",color:C.inkMid,fontSize:13,cursor:"pointer",padding:"10px",fontFamily:"inherit",fontWeight:500}}>
                +{txns.length-5}건 더보기 →
              </button>
            )}
          </div>
        </>
      )}

      {tab==="gallery"&&!overlay&&(
        <div style={{padding:"52px 22px 0"}}>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:26,fontWeight:700,marginBottom:4}}>영수증 갤러리</div>
          <div style={{fontSize:13,color:C.inkMid,marginBottom:20}}>{monthLabel()} · {Object.keys(recs).length}장 저장됨</div>
          {Object.keys(recs).length>0&&(
            <button onClick={dlAll} style={{width:"100%",background:C.surface,border:`1.5px solid ${C.bg}`,borderRadius:14,padding:"12px",fontSize:13,fontWeight:600,color:C.ink,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,boxShadow:C.shadow,marginBottom:16}}>
              <span>↓</span><span>전체 영수증 다운로드</span>
            </button>
          )}
          {Object.keys(recs).length>0&&(
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:20}}>
              {txns.filter(t=>recs[t.id]).map(tx=>(
                <div key={tx.id} onClick={()=>dlRec(tx.id)} style={{background:C.surface,borderRadius:16,overflow:"hidden",cursor:"pointer",boxShadow:C.shadow}}>
                  <img src={recs[tx.id]} alt="" style={{width:"100%",height:120,objectFit:"cover",display:"block"}}/>
                  <div style={{padding:"9px 11px"}}>
                    <div style={{fontSize:13,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tx.merchant}</div>
                    <div style={{fontSize:12,color:C.green,fontWeight:700,marginTop:2}}>{tx.amount.toLocaleString()}원</div>
                    <div style={{fontSize:11,color:C.inkMid,marginTop:1}}>{tx.date}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{fontSize:11,fontWeight:700,color:C.inkMid,letterSpacing:".8px",marginBottom:12,textTransform:"uppercase"}}>전체 내역</div>
          {txns.length===0&&<div style={{textAlign:"center",color:C.inkMid,padding:"32px 0",fontSize:14}}>기록이 없어요</div>}
          {txns.map((tx,i)=>(
            <TxRow key={tx.id} tx={tx} hasRec={!!recs[tx.id]} onDl={()=>dlRec(tx.id)} onDel={()=>delTxn(tx.id)} onSave={saveTx} delay={i*.04}/>
          ))}
        </div>
      )}

      {tab==="settings"&&!overlay&&(
        <div style={{padding:"52px 22px 0"}}>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:26,fontWeight:700,marginBottom:26}}>설정</div>
          <SHead>프로젝트 정보</SHead>
          <div style={{background:C.surface,borderRadius:20,padding:"20px",marginBottom:20,boxShadow:C.shadow}}>
            <FI label="프로젝트명" value={cfg.projectName} onChange={v=>setCfg(c=>({...c,projectName:v}))} placeholder="예: 2025 마케팅팀" hint="엑셀 지출결의서의 프로젝트명 칸에 자동 입력됩니다"/>
          </div>
          <SHead>잔액 알림</SHead>
          <div style={{background:C.surface,borderRadius:20,padding:"20px",marginBottom:20,boxShadow:C.shadow}}>
            <FI label="알림 받을 이메일" value={cfg.email} onChange={v=>setCfg(c=>({...c,email:v}))} placeholder="me@company.com"/>
            <div style={{fontSize:12,color:C.inkMid,marginBottom:10,fontWeight:500}}>알림 기준 잔액</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:14}}>
              {[30000,50000,70000,100000].map(v=>(
                <button key={v} onClick={()=>setCfg(c=>({...c,threshold:v}))}
                  style={{padding:"8px 14px",borderRadius:99,
                    border:`1.5px solid ${cfg.threshold===v?C.green:C.bg}`,
                    background:cfg.threshold===v?C.greenLight:C.overlay,
                    color:cfg.threshold===v?C.green:C.inkMid,
                    fontSize:12,fontWeight:cfg.threshold===v?700:400,cursor:"pointer",fontFamily:"inherit"}}>
                  {v.toLocaleString()}원
                </button>
              ))}
            </div>
            <FI label="직접 입력 (원)" value={String(cfg.threshold)} onChange={v=>setCfg(c=>({...c,threshold:parseInt(v)||0}))} type="number" placeholder="50000"/>
            <div style={{fontSize:11,color:C.inkFaint,marginBottom:14,lineHeight:1.6}}>잔액이 기준 이하가 되면 이메일 앱이 자동으로 열립니다. 전송은 직접 눌러야 해요.</div>
          </div>
          <SHead>엑셀 내보내기</SHead>
          <div style={{background:C.surface,borderRadius:20,padding:"20px",marginBottom:20,boxShadow:C.shadow}}>
            <PBtn onClick={()=>exportXlsx(txns,cfg.projectName)}>📊 지출결의서 엑셀 다운로드</PBtn>
            <div style={{fontSize:11,color:C.inkFaint,marginTop:10,lineHeight:1.6}}>
              회사 양식 기준 · A열 프로젝트명 / E열 일자 / F열 금액 자동 입력
            </div>
          </div>
          <PBtn onClick={()=>{S.set("cfg",cfg);setNtf(false);ping("저장됐어요");}}>전체 설정 저장</PBtn>
        </div>
      )}

      {!overlay&&(
        <>
          {fabOpen&&(
            <div style={{position:"fixed",bottom:86,left:"50%",transform:"translateX(-50%)",display:"flex",flexDirection:"column",gap:8,alignItems:"center",zIndex:60,width:"100%",maxWidth:430,padding:"0 22px"}}>
              {[
                {icon:"📷",label:"카메라로 찍기",fn:()=>camRef.current?.click()},
                {icon:"🖼",label:"갤러리에서 불러오기",fn:()=>galRef.current?.click()},
                {icon:"✏️",label:"직접 입력",fn:()=>{setForm({amount:"",merchant:"",date:todayMD()});setOv("manual");setFab(false);}},
              ].map((opt,i)=>(
                <button key={opt.label} onClick={()=>{opt.fn();setFab(false);}}
                  style={{display:"flex",alignItems:"center",gap:12,background:C.surface,border:`1px solid ${C.bg}`,borderRadius:16,padding:"12px 20px",fontSize:14,fontWeight:600,color:C.ink,cursor:"pointer",width:"100%",maxWidth:320,boxShadow:C.shadowMd,animation:"fabPop .22s ease both",animationDelay:`${i*.06}s`,fontFamily:"inherit"}}>
                  <span style={{fontSize:20}}>{opt.icon}</span><span>{opt.label}</span>
                </button>
              ))}
            </div>
          )}
          <div style={{position:"fixed",bottom:72,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:430,display:"flex",justifyContent:"center",zIndex:80,pointerEvents:"none"}}>
            <button onClick={()=>setFab(p=>!p)}
              style={{width:56,height:56,borderRadius:"50%",background:C.ink,border:"none",fontSize:24,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 8px 28px rgba(28,24,20,.28)`,transition:"transform .2s",transform:fabOpen?"rotate(45deg)":"rotate(0deg)",pointerEvents:"auto",color:"#fff"}}>
              +
            </button>
          </div>
        </>
      )}

      <TabBar tab={tab} setTab={t=>{setTab(t);setFab(false);}}/>
      <input ref={camRef} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={e=>handleFile(e.target.files[0])}/>
      <input ref={galRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>handleFile(e.target.files[0])}/>
    </div>
  );
}