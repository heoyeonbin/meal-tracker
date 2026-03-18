import { useState, useEffect, useRef, useCallback } from "react";
import * as XLSX from "xlsx";
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
/* ── Fonts ── */
if (!document.querySelector("#gf2")) {
  const l = document.createElement("link"); l.id = "gf2";
  l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Noto+Sans+KR:wght@400;500;600;700&display=swap";
  document.head.appendChild(l);
}
if (!document.querySelector("#css2")) {
  const s = document.createElement("style"); s.id = "css2";
  s.textContent = `
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
    input, button { font-family: 'Noto Sans KR', sans-serif; }
    input[type=number]::-webkit-outer-spin-button,
    input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
    @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
    @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
    @keyframes spin { to{transform:rotate(360deg)} }
    @keyframes toast { from{opacity:0;transform:translateX(-50%) translateY(-10px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
    @keyframes fabPop { from{opacity:0;transform:scale(.8) translateY(10px)} to{opacity:1;transform:scale(1) translateY(0)} }
    @keyframes blink { 0%,90%,100%{scaleY:1} 95%{scaleY:.1} }
    @keyframes bgShift { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
    .fu { animation: fadeUp .4s cubic-bezier(.22,1,.36,1) both; }
    .glass { background: rgba(255,255,255,0.18); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.32); }
    .glass-dark { background: rgba(255,255,255,0.10); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.18); }
    .tx-row:hover { background: rgba(255,255,255,0.22) !important; }
    .btn-press:active { transform: scale(.95); }
    @media (min-width: 768px) {
      #root > div {
        max-width: 430px !important;
        margin: 0 auto !important;
        box-shadow: 0 0 60px rgba(90,60,180,.3);
      }
    }
  `;
  document.head.appendChild(s);
}

/* ── Constants ── */
const LIMIT = 200_000;
const LIMIT_BAR = 200_000;

/* ── Storage (localStorage for deployed version) ── */
const mKey = () => { const d = new Date(); return `meal-${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; };
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwwANXcBffHIpwV0cUoQl5gtUM84qDh76t71YSevbcHWyj38H3CjA8iGHr4bqYkZRCp7A/exec";

const S = {
  get: async k => {
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : null;
    } catch { return null; }
  },
  set: async (k, v) => {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
  },
};

const GS = {
  load: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    const { data } = await supabase
      .from("transactions")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    return data || [];
  },
  add: async tx => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("transactions").insert({
      id: tx.id,
      user_id: user.id,
      amount: tx.amount,
      merchant: tx.merchant,
      date: tx.date,
    });
  },
  del: async id => {
    await supabase.from("transactions").delete().eq("id", id);
  },
  update: async tx => {
    await supabase.from("transactions").update({
      amount: tx.amount,
      merchant: tx.merchant,
      date: tx.date,
    }).eq("id", tx.id);
  },
};
const compress = (url, px = 900) => new Promise(res => {
  const img = new Image(); img.onload = () => {
    const sc = Math.min(1, px / Math.max(img.width, img.height));
    const c = document.createElement("canvas"); c.width = img.width*sc; c.height = img.height*sc;
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL("image/jpeg", .7));
  }; img.src = url;
});

/* ── OCR ── */
async function ocr(b64, mt) {
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": import.meta.env.VITE_ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001", max_tokens: 200,
        system: `Receipt parser. Return ONLY valid JSON: {"amount":number_or_null,"merchant":"string","date":"MM/DD"}. amount=total KRW integer. merchant=Korean store name or "알 수 없음". date=MM/DD or null.`,
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: mt, data: b64 } },
          { type: "text", text: "총 결제금액, 가맹점명, 결제일자 추출" }
        ]}]
      })
    });
    const d = await r.json();
    const t = d.content?.find(b => b.type === "text")?.text || "{}";
    return JSON.parse(t.replace(/```json|```/g, "").trim());
  } catch { return { amount: null, merchant: "알 수 없음", date: null }; }
}

const todayMD = () => { const d = new Date(); return `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}`; };
const pctColor = p => p >= 90 ? "#FF6B6B" : p >= 70 ? "#FFB347" : "#A8E6CF";
const monthLabel = () => { const d = new Date(); return `${d.getFullYear()}년 ${d.getMonth()+1}월`; };

/* ── Excel Export ── */
function exportXlsx(txns, projectName) {
  const wb = XLSX.utils.book_new();
  const ws = {};
  const sc = (addr, v) => { ws[addr] = { v, t: typeof v === "number" ? "n" : "s" }; };
  sc("A1", "법인카드 지출 결의서");
  sc("A3", "일자 :                                                                           성명 :  (인)");
  sc("A4", "아래와 같이 지출 결의서를 제출하오니 확인 바랍니다.");
  sc("A5", "=== 아     래 ==="); sc("A6", "1. 개인 경비 및 지원금");
  sc("A7", "프로젝트명"); sc("D7", "항목"); sc("E7", "일자"); sc("F7", "금액"); sc("G7", "비고");
  const proj = projectName || "";
  for (let i = 0; i < 22; i++) {
    const row = 8 + i; sc(`A${row}`, proj); sc(`D${row}`, "식비");
    if (i < txns.length) { sc(`E${row}`, txns[i].date || ""); ws[`F${row}`] = { v: txns[i].amount, t: "n" }; }
  }
  sc("A30", "소계"); ws["F30"] = { f: "SUM(F8:F29)", t: "n" };
  const merges = [
    {s:{r:0,c:0},e:{r:1,c:6}},{s:{r:2,c:0},e:{r:2,c:6}},{s:{r:3,c:0},e:{r:3,c:6}},
    {s:{r:4,c:0},e:{r:4,c:6}},{s:{r:5,c:0},e:{r:5,c:6}},{s:{r:6,c:0},e:{r:6,c:2}},
  ];
  for (let i = 0; i < 22; i++) merges.push({s:{r:7+i,c:0},e:{r:7+i,c:2}});
  merges.push({s:{r:29,c:0},e:{r:29,c:2}});
  ws["!merges"] = merges; ws["!ref"] = "A1:G30";
  ws["!cols"] = [{wch:8},{wch:8},{wch:8},{wch:8},{wch:12},{wch:12},{wch:12}];
  XLSX.utils.book_append_sheet(wb, ws, "수입지출계획");
  const d = new Date();
  XLSX.writeFile(wb, `${d.getMonth()+1}월_지출결의서_${proj||"식대"}.xlsx`);
}

/* ── Character SVG ── */
const Bori = ({ size = 80, animate = true }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg"
    style={animate ? { animation: "float 3s ease-in-out infinite" } : {}}>
    {/* Body */}
    <ellipse cx="50" cy="62" rx="28" ry="26" fill="white" fillOpacity=".95"/>
    {/* Head */}
    <circle cx="50" cy="38" r="24" fill="white" fillOpacity=".95"/>
    {/* Ears */}
    <ellipse cx="32" cy="20" rx="8" ry="11" fill="white" fillOpacity=".9"/>
    <ellipse cx="68" cy="20" rx="8" ry="11" fill="white" fillOpacity=".9"/>
    <ellipse cx="32" cy="20" rx="5" ry="7" fill="#C9B8FF" fillOpacity=".7"/>
    <ellipse cx="68" cy="20" rx="5" ry="7" fill="#C9B8FF" fillOpacity=".7"/>
    {/* Eyes */}
    <circle cx="42" cy="36" r="4.5" fill="#4A3F8C"/>
    <circle cx="58" cy="36" r="4.5" fill="#4A3F8C"/>
    <circle cx="43.5" cy="34.5" r="1.5" fill="white"/>
    <circle cx="59.5" cy="34.5" r="1.5" fill="white"/>
    {/* Nose */}
    <ellipse cx="50" cy="43" rx="2.5" ry="1.8" fill="#C9B8FF"/>
    {/* Mouth */}
    <path d="M45 47 Q50 51 55 47" stroke="#8B7FBB" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
    {/* Cheeks */}
    <circle cx="37" cy="42" r="5" fill="#FFB8C6" fillOpacity=".5"/>
    <circle cx="63" cy="42" r="5" fill="#FFB8C6" fillOpacity=".5"/>
    {/* Belly spot */}
    <ellipse cx="50" cy="64" rx="14" ry="12" fill="#EDE8FF" fillOpacity=".6"/>
    {/* Arms */}
    <ellipse cx="24" cy="62" rx="7" ry="5" fill="white" fillOpacity=".9" transform="rotate(-20 24 62)"/>
    <ellipse cx="76" cy="62" rx="7" ry="5" fill="white" fillOpacity=".9" transform="rotate(20 76 62)"/>
    {/* Sparkles */}
    <text x="78" y="28" fontSize="10" fill="white" fillOpacity=".8">✦</text>
    <text x="12" y="35" fontSize="7" fill="white" fillOpacity=".6">✦</text>
  </svg>
);

/* ── Mini character for empty state ── */
const BoriSmall = () => (
  <svg width="60" height="60" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg"
    style={{ animation: "float 3s ease-in-out infinite" }}>
    <ellipse cx="50" cy="62" rx="28" ry="26" fill="white" fillOpacity=".5"/>
    <circle cx="50" cy="38" r="24" fill="white" fillOpacity=".5"/>
    <ellipse cx="32" cy="20" rx="8" ry="11" fill="white" fillOpacity=".4"/>
    <ellipse cx="68" cy="20" rx="8" ry="11" fill="white" fillOpacity=".4"/>
    <ellipse cx="32" cy="20" rx="5" ry="7" fill="#C9B8FF" fillOpacity=".5"/>
    <ellipse cx="68" cy="20" rx="5" ry="7" fill="#C9B8FF" fillOpacity=".5"/>
    <circle cx="42" cy="36" r="4" fill="#4A3F8C" fillOpacity=".7"/>
    <circle cx="58" cy="36" r="4" fill="#4A3F8C" fillOpacity=".7"/>
    <path d="M44 47 Q50 52 56 47" stroke="#8B7FBB" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
    <circle cx="37" cy="42" r="4" fill="#FFB8C6" fillOpacity=".4"/>
    <circle cx="63" cy="42" r="4" fill="#FFB8C6" fillOpacity=".4"/>
  </svg>
);

/* ── UI components ── */
const Toast = ({ toast }) => toast ? (
  <div style={{
    position: "fixed", top: 22, left: "50%", transform: "translateX(-50%)",
    zIndex: 9999, background: toast.err ? "rgba(255,107,107,.9)" : "rgba(90,60,180,.9)",
    backdropFilter: "blur(12px)", color: "#fff", padding: "10px 22px",
    borderRadius: 99, fontSize: 13, fontWeight: 700, whiteSpace: "nowrap",
    boxShadow: "0 8px 32px rgba(90,60,180,.3)", animation: "toast .25s ease both",
    border: "1px solid rgba(255,255,255,.3)"
  }}>{toast.msg}</div>
) : null;

const GlassCard = ({ children, style = {}, onClick }) => (
  <div className="glass" onClick={onClick} style={{
    borderRadius: 20, padding: "18px 20px",
    boxShadow: "0 8px 32px rgba(90,60,180,.12)",
    ...style
  }}>{children}</div>
);

const GlassInput = ({ label, value, onChange, type = "text", placeholder, big, hint }) => (
  <div style={{ marginBottom: 16 }}>
    {label && <div style={{ fontSize: 12, color: "rgba(255,255,255,.7)", marginBottom: 7, fontWeight: 600 }}>{label}</div>}
    <input type={type} value={value} placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      style={{
        width: "100%", background: "rgba(255,255,255,.15)", border: "1.5px solid rgba(255,255,255,.3)",
        borderRadius: 14, padding: big ? "15px 14px" : "12px 14px",
        fontSize: big ? 22 : 14, fontWeight: big ? 800 : 400,
        color: "#fff", outline: "none", transition: "border-color .2s",
        fontFamily: "'Noto Sans KR', sans-serif",
      }}
      onFocus={e => e.target.style.borderColor = "rgba(255,255,255,.7)"}
      onBlur={e => e.target.style.borderColor = "rgba(255,255,255,.3)"}
    />
    {hint && <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)", marginTop: 5 }}>{hint}</div>}
  </div>
);

const PBtn = ({ onClick, children, secondary, small }) => (
  <button className="btn-press" onClick={onClick} style={{
    width: "100%", borderRadius: 14,
    padding: small ? "11px" : "15px",
    fontSize: small ? 13 : 14, fontWeight: 700,
    cursor: "pointer", transition: "transform .15s",
    fontFamily: "'Noto Sans KR', sans-serif",
    ...(secondary ? {
      background: "rgba(255,255,255,.15)", border: "1.5px solid rgba(255,255,255,.3)", color: "#fff"
    } : {
      background: "linear-gradient(135deg, #A78BFA, #7C3AED)",
      border: "none", color: "#fff",
      boxShadow: "0 4px 20px rgba(124,58,237,.4)"
    })
  }}>{children}</button>
);

const SHead = ({ children }) => (
  <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.5)", letterSpacing: ".8px", textTransform: "uppercase", marginBottom: 12 }}>{children}</div>
);

/* ── TxRow ── */
function TxRow({ tx, hasRec, onDl, onDel, onSave, delay = 0 }) {
  const [editing, setEditing] = useState(false);
  const [amt, setAmt] = useState(String(tx.amount));
  const [merch, setMerch] = useState(tx.merchant);
  const [date, setDate] = useState(tx.date || "");

  if (editing) return (
    <div className="fu glass" style={{ borderRadius: 18, padding: "16px", marginBottom: 8, animationDelay: `${delay}s` }}>
      <div style={{ fontSize: 12, color: "#C4B5FD", fontWeight: 700, marginBottom: 10 }}>내역 수정</div>
      <GlassInput label="금액 (원)" value={amt} onChange={setAmt} type="number" placeholder="13500" big />
      <GlassInput label="가맹점명" value={merch} onChange={setMerch} placeholder="식당 이름" />
      <GlassInput label="일자 (MM/DD)" value={date} onChange={setDate} placeholder="05/20" />
      <div style={{ display: "flex", gap: 8 }}>
        <PBtn small onClick={() => { onSave({ ...tx, amount: parseInt(amt)||tx.amount, merchant: merch||tx.merchant, date: date||tx.date }); setEditing(false); }}>저장</PBtn>
        <PBtn small secondary onClick={() => setEditing(false)}>취소</PBtn>
      </div>
    </div>
  );

  return (
    <div className="tx-row fu glass-dark" style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "13px 14px", borderRadius: 16, marginBottom: 8,
      transition: "background .15s", animationDelay: `${delay}s`
    }}>
      <div style={{
        width: 38, height: 38, borderRadius: 12, flexShrink: 0,
        background: "linear-gradient(135deg, rgba(167,139,250,.5), rgba(124,58,237,.4))",
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16
      }}>🍽</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.merchant}</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)", marginTop: 2 }}>{tx.date}</div>
      </div>
      {hasRec && <button onClick={onDl} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "rgba(255,255,255,.5)" }}>↓</button>}
      <button onClick={() => setEditing(true)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "rgba(255,255,255,.5)", fontFamily: "inherit" }}>✎</button>
      <div style={{ fontSize: 14, fontWeight: 800, color: "#fff", flexShrink: 0 }}>−{tx.amount.toLocaleString()}원</div>
      <button onClick={onDel} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "rgba(255,255,255,.3)", lineHeight: 1, marginLeft: 2 }}>×</button>
    </div>
  );
}

/* ── TabBar ── */
const TabBar = ({ tab, setTab }) => {
  const tabs = [{ id: "home", icon: "🏠", label: "홈" }, { id: "gallery", icon: "🖼", label: "갤러리" }, { id: "settings", icon: "⚙️", label: "설정" }];
  return (
    <div className="glass" style={{
      position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
      width: "100%", maxWidth: 430, display: "flex", zIndex: 100,
      paddingBottom: "env(safe-area-inset-bottom,6px)", borderRadius: "20px 20px 0 0",
      borderBottom: "none"
    }}>
      {tabs.map(t => (
        <button key={t.id} className="btn-press" onClick={() => setTab(t.id)} style={{
          flex: 1, background: "none", border: "none", cursor: "pointer",
          padding: "10px 0 8px", display: "flex", flexDirection: "column",
          alignItems: "center", gap: 3, transition: "transform .15s"
        }}>
          <span style={{ fontSize: 18 }}>{t.icon}</span>
          <span style={{ fontSize: 10, fontWeight: tab === t.id ? 700 : 400, color: tab === t.id ? "#C4B5FD" : "rgba(255,255,255,.4)", transition: "color .2s" }}>{t.label}</span>
        </button>
      ))}
    </div>
  );
};

/* ══ MAIN ══ */
export default function App() {
  const [txns, setTxns] = useState([]);
  const [recs, setRecs] = useState({});
  const [cfg, setCfg] = useState({ email: "", threshold: 50000, projectName: "" });
  const [tab, setTab] = useState("home");
  const [overlay, setOv] = useState(null);
  const [fabOpen, setFab] = useState(false);
  const [preview, setPv] = useState(null);
  const [ocrRes, setOcr] = useState(null);
  const [form, setForm] = useState({ amount: "", merchant: "", date: "" });
  const [toast, setToast] = useState(null);
  const [notified, setNtf] = useState(false);
  const [user, setUser] = useState(null);
  const camRef = useRef(); const galRef = useRef();
  const mk = mKey();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      if (user) {
        Promise.all([GS.load(), S.get("cfg"), S.get(`recs-${mk}`)]).then(([rows, c, r]) => {
          if (rows.length) setTxns(rows.map(row => ({
            id: Number(row.id),
            amount: Number(row.amount),
            merchant: row.merchant,
            date: row.date,
          })));
          if (c) setCfg(c);
          if (r) setRecs(r);
        });
      }
    });
    supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });
  }, []);

  const ping = (msg, err = false) => { setToast({ msg, err }); setTimeout(() => setToast(null), 2400); };
  const used = txns.reduce((s, t) => s + t.amount, 0);
  const remaining = LIMIT - used;
  const pct = Math.min(100, (used / LIMIT) * 100);
  const pc = pctColor(pct);

  const saveTxns = async n => { setTxns(n); await S.set(mk, n); };
  const saveRecs = async n => { setRecs(n); await S.set(`recs-${mk}`, n); };
  const closeOv = () => { setOv(null); setPv(null); setOcr(null); setForm({ amount: "", merchant: "", date: "" }); };

  const tryNotify = rem => {
    if (!cfg.email || rem > cfg.threshold || notified) return;
    setNtf(true);
    window.open(`mailto:${cfg.email}?subject=${encodeURIComponent(`[법카] 식대 잔액 ${rem.toLocaleString()}원`)}&body=${encodeURIComponent(`남은 금액: ${rem.toLocaleString()}원`)}`);
  };

  const handleFile = useCallback(async file => {
    if (!file) return; setFab(false);
    const reader = new FileReader();
    reader.onload = async e => {
      const url = e.target.result; setPv(url); setOv("loading");
      try {
        const data = await ocr(url.split(",")[1], file.type || "image/jpeg");
        setOcr(data);
        setForm({ amount: data.amount ? String(data.amount) : "", merchant: data.merchant !== "알 수 없음" ? data.merchant : "", date: data.date || todayMD() });
      } catch { setOcr({ amount: null, merchant: "알 수 없음", date: null }); setForm(f => ({ ...f, date: todayMD() })); }
      setOv("confirm");
    };
    reader.readAsDataURL(file);
  }, []);

  const addTxn = async () => {
    const amt = parseInt(form.amount.replace(/,/g, ""), 10);
    if (!amt || amt <= 0) { ping("금액을 입력해주세요", true); return; }
    const id = Date.now();
    const tx = { id, amount: amt, merchant: form.merchant || "식당", date: form.date || todayMD() };
    const next = [tx, ...txns];
    setTxns(next);
    await GS.add(tx);
    if (preview) { const c = await compress(preview); await saveRecs({ ...recs, [id]: c }); }
    tryNotify(LIMIT - next.reduce((s, t) => s + t.amount, 0));
    ping(`${amt.toLocaleString()}원 추가됐어요 ✨`);
    closeOv();
  };

  const saveTx = async updated => {
    setTxns(txns.map(t => t.id === updated.id ? updated : t));
    await GS.update(updated);
    ping("수정됐어요");
  };
  const delTxn = async id => {
    const nr = { ...recs }; delete nr[id];
    setTxns(txns.filter(t => t.id !== id));
    await GS.del(id);
    await saveRecs(nr);
    ping("삭제됐어요");
  };
  const dlRec = id => {
    const tx = txns.find(t => t.id === id);
    const a = document.createElement("a"); a.href = recs[id]; a.download = `영수증_${tx?.merchant||id}.jpg`; a.click();
  };
  const dlAll = async () => {
    const ids = Object.keys(recs);
    if (!ids.length) { ping("저장된 영수증이 없어요", true); return; }
    for (const id of ids) { dlRec(parseInt(id)); await new Promise(r => setTimeout(r, 350)); }
  };

  /* BG gradient */
  const bgStyle = {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 35%, #f093fb 70%, #c471f5 100%)",
    backgroundSize: "300% 300%",
    animation: "bgShift 12s ease infinite",
    color: "#fff",
    fontFamily: "'Noto Sans KR', sans-serif",
    width: "100%",
    paddingBottom: 84,
    position: "relative",
    overflow: "hidden",
  };

  /* decorative blobs */
  const Blob = ({ top, left, size, opacity, color }) => (
    <div style={{
      position: "absolute", top, left, width: size, height: size, borderRadius: "50%",
      background: color || "rgba(255,255,255,.15)", filter: "blur(40px)",
      opacity, pointerEvents: "none", zIndex: 0,
    }} />
  );
  if (!user) return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #667eea 0%, #764ba2 35%, #f093fb 70%, #c471f5 100%)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      fontFamily: "'Noto Sans KR', sans-serif", color: "#fff",
      width: "100%",        // ← 추가
    }}>
      <Bori size={100} />
      <div style={{ fontSize: 24, fontWeight: 800, marginTop: 20, marginBottom: 8 }}>식대 트래커</div>
      <div style={{ fontSize: 14, color: "rgba(255,255,255,.6)", marginBottom: 40 }}>법인카드 식대를 간편하게 관리해요</div>
      <button onClick={() => supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } })}
        style={{
          display: "flex", alignItems: "center", gap: 12,
          background: "#fff", color: "#1C1814", border: "none",
          borderRadius: 14, padding: "14px 28px", fontSize: 15, fontWeight: 700,
          cursor: "pointer", boxShadow: "0 8px 32px rgba(0,0,0,.2)"
        }}>
        <span>🔑</span> Google로 로그인
      </button>
    </div>
  );
  return (
    <div style={bgStyle}>
      <Toast toast={toast} />

      {/* Blobs */}
      <Blob top={-60} left={-40} size={220} opacity={.4} color="rgba(196,181,253,.3)" />
      <Blob top={200} left={260} size={180} opacity={.3} color="rgba(240,147,251,.3)" />
      <Blob top={500} left={-30} size={160} opacity={.25} color="rgba(102,126,234,.4)" />

      {fabOpen && <div onClick={() => setFab(false)} style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(60,20,100,.4)", backdropFilter: "blur(4px)" }} />}

      {/* ── OVERLAY ── */}
      {overlay && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 200, maxWidth: 430, margin: "0 auto",
          background: "linear-gradient(135deg, #667eea, #764ba2, #f093fb)",
          backgroundSize: "300% 300%", animation: "bgShift 12s ease infinite",
          overflowY: "auto", padding: "52px 22px 40px"
        }}>
          <Blob top={-40} left={-20} size={180} opacity={.35} />
          <button onClick={closeOv} style={{ background: "none", border: "none", color: "rgba(255,255,255,.7)", fontSize: 13, cursor: "pointer", marginBottom: 28, fontFamily: "inherit", fontWeight: 600 }}>← 취소</button>

          {overlay === "loading" && (
            <div style={{ textAlign: "center", paddingTop: 48 }}>
              {preview && <img src={preview} alt="" style={{ width: "100%", maxHeight: 180, objectFit: "cover", borderRadius: 20, marginBottom: 32, opacity: .6 }} />}
              <Bori size={80} />
              <div style={{ marginTop: 16, color: "rgba(255,255,255,.8)", fontSize: 14 }}>영수증 읽는 중... ✨</div>
            </div>
          )}

          {(overlay === "confirm" || overlay === "manual") && (
            <div className="fu">
              <div style={{ textAlign: "center", marginBottom: 20 }}><Bori size={70} /></div>
              <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 20, textAlign: "center" }}>
                {overlay === "confirm" ? "영수증 확인" : "직접 입력"}
              </div>
              {overlay === "confirm" && preview && (
                <div style={{ width: "100%", height: 180, borderRadius: 20, overflow: "hidden", marginBottom: 18, boxShadow: "0 8px 32px rgba(0,0,0,.2)" }}>
                  <img src={preview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </div>
              )}
              {overlay === "confirm" && (
                ocrRes?.amount
                  ? <div className="glass" style={{ borderRadius: 16, padding: "14px 18px", marginBottom: 18 }}>
                      <div style={{ fontSize: 11, color: "#A8E6CF", fontWeight: 700, marginBottom: 4 }}>✓ 자동 인식 완료</div>
                      <div style={{ fontSize: 30, fontWeight: 900, fontFamily: "'Nunito',sans-serif" }}>{ocrRes.amount.toLocaleString()}원</div>
                      {ocrRes.date && <div style={{ fontSize: 12, color: "rgba(255,255,255,.6)", marginTop: 3 }}>{ocrRes.date}</div>}
                    </div>
                  : <div style={{ background: "rgba(255,107,107,.2)", border: "1px solid rgba(255,107,107,.4)", borderRadius: 16, padding: "13px 18px", marginBottom: 18, fontSize: 13, color: "#FFB8B8" }}>
                      인식 실패 — 아래에 직접 입력해주세요
                    </div>
              )}
              <GlassInput label="결제 금액 (원)" value={form.amount} onChange={v => setForm(f => ({ ...f, amount: v }))} type="number" placeholder="13500" big hint="단체 식사 시 실제 부담 금액으로 수정하세요" />
              <GlassInput label="일자 (MM/DD)" value={form.date} onChange={v => setForm(f => ({ ...f, date: v }))} placeholder="05/20" />
              <GlassInput label="가맹점명" value={form.merchant} onChange={v => setForm(f => ({ ...f, merchant: v }))} placeholder="식당 이름" />
              <PBtn onClick={addTxn}>추가하기 ✨</PBtn>
            </div>
          )}
        </div>
      )}

      {/* ══ HOME ══ */}
      {tab === "home" && !overlay && (
        <div style={{ position: "relative", zIndex: 1 }}>
          {/* Header */}
          <div style={{ padding: "52px 24px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.65)", fontWeight: 600, marginBottom: 16, letterSpacing: ".5px" }}>
              {monthLabel()} · 법인카드 식대
            </div>
            <Bori size={90} />
            <div style={{ marginTop: 16, marginBottom: 6 }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,.6)", marginBottom: 6 }}>남은 잔액</div>
              <div style={{ fontSize: 52, fontWeight: 900, fontFamily: "'Nunito',sans-serif", color: pc, textShadow: "0 2px 20px rgba(0,0,0,.2)", lineHeight: 1 }}>
                {remaining.toLocaleString()}<span style={{ fontSize: 20, marginLeft: 4 }}>원</span>
              </div>
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,.6)", marginBottom: 18 }}>
              {used.toLocaleString()}원 사용 · 한도 200,000원
            </div>
            {/* Progress */}
            <div className="glass-dark" style={{ borderRadius: 99, height: 10, overflow: "hidden", margin: "0 8px" }}>
              <div style={{
                width: `${pct}%`, height: "100%", borderRadius: 99,
                background: `linear-gradient(90deg, ${pc}88, ${pc})`,
                transition: "width .9s cubic-bezier(.22,1,.36,1)",
                boxShadow: `0 0 12px ${pc}88`
              }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, fontSize: 11, color: "rgba(255,255,255,.4)", padding: "0 8px" }}>
              <span>0</span><span>200,000원</span>
            </div>
          </div>

          {/* Stats */}
          <div style={{ display: "flex", gap: 8, padding: "0 22px 16px" }}>
            {[
              { l: "사용 건수", v: `${txns.length}건` },
              { l: "평균 1회", v: txns.length ? `${Math.round(used/txns.length).toLocaleString()}원` : "-" },
              { l: "잔여율", v: `${Math.round(100-pct)}%` }
            ].map(s => (
              <div key={s.l} className="glass-dark" style={{ flex: 1, borderRadius: 16, padding: "13px 8px", textAlign: "center" }}>
                <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "'Nunito',sans-serif" }}>{s.v}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)", marginTop: 3 }}>{s.l}</div>
              </div>
            ))}
          </div>

          {/* Excel btn */}
          {txns.length > 0 && (
            <div style={{ padding: "0 22px 10px" }}>
              <button className="btn-press glass-dark" onClick={() => exportXlsx(txns, cfg.projectName)} style={{
                width: "100%", border: "1px solid rgba(255,255,255,.2)", borderRadius: 14, padding: "12px",
                fontSize: 13, fontWeight: 700, color: "#fff", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "transform .15s"
              }}>
                <span>📊</span><span>지출결의서 엑셀 다운로드</span>
              </button>
            </div>
          )}

          {/* Tx list */}
          <div style={{ padding: "4px 22px 0" }}>
            <SHead>이번 달 내역</SHead>
            {txns.length === 0 && (
              <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,.6)" }}>
                <BoriSmall />
                <div style={{ fontSize: 14, fontWeight: 600, marginTop: 12 }}>아직 기록이 없어요</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,.4)", marginTop: 6 }}>아래 + 버튼으로 추가해봐요</div>
              </div>
            )}
            {txns.slice(0, 5).map((tx, i) => (
              <TxRow key={tx.id} tx={tx} hasRec={!!recs[tx.id]} onDl={() => dlRec(tx.id)} onDel={() => delTxn(tx.id)} onSave={saveTx} delay={i * .05} />
            ))}
            {txns.length > 5 && (
              <button onClick={() => setTab("gallery")} style={{ width: "100%", background: "none", border: "none", color: "rgba(255,255,255,.5)", fontSize: 13, cursor: "pointer", padding: "10px", fontFamily: "inherit", fontWeight: 600 }}>
                +{txns.length - 5}건 더보기 →
              </button>
            )}
          </div>
        </div>
      )}

      {/* ══ GALLERY ══ */}
      {tab === "gallery" && !overlay && (
        <div style={{ padding: "52px 22px 40px", position: "relative", zIndex: 1 }}>
          <div style={{ fontSize: 24, fontWeight: 900, marginBottom: 4, fontFamily: "'Nunito',sans-serif" }}>영수증 갤러리</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,.6)", marginBottom: 20 }}>{monthLabel()} · {Object.keys(recs).length}장</div>
          {Object.keys(recs).length > 0 && (
            <button className="btn-press glass-dark" onClick={dlAll} style={{
              width: "100%", borderRadius: 14, padding: "12px", fontSize: 13, fontWeight: 700,
              color: "#fff", cursor: "pointer", display: "flex", alignItems: "center",
              justifyContent: "center", gap: 8, border: "1px solid rgba(255,255,255,.2)",
              marginBottom: 16, transition: "transform .15s"
            }}>↓ 전체 영수증 다운로드</button>
          )}
          {Object.keys(recs).length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
              {txns.filter(t => recs[t.id]).map(tx => (
                <div key={tx.id} className="glass-dark" onClick={() => dlRec(tx.id)} style={{ borderRadius: 16, overflow: "hidden", cursor: "pointer" }}>
                  <img src={recs[tx.id]} alt="" style={{ width: "100%", height: 110, objectFit: "cover", display: "block" }} />
                  <div style={{ padding: "9px 11px" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.merchant}</div>
                    <div style={{ fontSize: 12, color: "#C4B5FD", fontWeight: 700, marginTop: 2 }}>{tx.amount.toLocaleString()}원</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,.4)", marginTop: 1 }}>{tx.date}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <SHead>전체 내역</SHead>
          {txns.length === 0 && <div style={{ textAlign: "center", padding: "32px 0", color: "rgba(255,255,255,.5)", fontSize: 14 }}>기록이 없어요</div>}
          {txns.map((tx, i) => <TxRow key={tx.id} tx={tx} hasRec={!!recs[tx.id]} onDl={() => dlRec(tx.id)} onDel={() => delTxn(tx.id)} onSave={saveTx} delay={i * .04} />)}
        </div>
      )}

      {/* ══ SETTINGS ══ */}
      {tab === "settings" && !overlay && (
        <div style={{ padding: "52px 22px 120px", position: "relative", zIndex: 1 }}>
          <div style={{ textAlign: "center", marginBottom: 20 }}><Bori size={70} /></div>
          <div style={{ fontSize: 24, fontWeight: 900, marginBottom: 26, fontFamily: "'Nunito',sans-serif", textAlign: "center" }}>설정</div>

          <SHead>프로젝트 정보</SHead>
          <GlassCard style={{ marginBottom: 20 }}>
            <GlassInput label="프로젝트명" value={cfg.projectName} onChange={v => setCfg(c => ({ ...c, projectName: v }))} placeholder="예: 2025 마케팅팀" hint="엑셀 지출결의서 프로젝트명 칸에 자동 입력" />
          </GlassCard>

          <SHead>잔액 알림</SHead>
          <GlassCard style={{ marginBottom: 20 }}>
            <GlassInput label="알림 받을 이메일" value={cfg.email} onChange={v => setCfg(c => ({ ...c, email: v }))} placeholder="me@company.com" />
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.6)", marginBottom: 10, fontWeight: 600 }}>알림 기준 잔액</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
              {[30000, 50000, 70000, 100000].map(v => (
                <button key={v} className="btn-press" onClick={() => setCfg(c => ({ ...c, threshold: v }))} style={{
                  padding: "8px 14px", borderRadius: 99, fontFamily: "inherit",
                  border: `1.5px solid ${cfg.threshold === v ? "rgba(196,181,253,.8)" : "rgba(255,255,255,.2)"}`,
                  background: cfg.threshold === v ? "rgba(196,181,253,.25)" : "rgba(255,255,255,.08)",
                  color: cfg.threshold === v ? "#C4B5FD" : "rgba(255,255,255,.5)",
                  fontSize: 12, fontWeight: cfg.threshold === v ? 700 : 400, cursor: "pointer", transition: "transform .15s"
                }}>{v.toLocaleString()}원</button>
              ))}
            </div>
            <GlassInput label="직접 입력 (원)" value={String(cfg.threshold)} onChange={v => setCfg(c => ({ ...c, threshold: parseInt(v)||0 }))} type="number" placeholder="50000" />
            <div style={{ fontSize: 11, color: "rgba(255,255,255,.4)", marginBottom: 14, lineHeight: 1.6 }}>잔액 기준 이하 도달 시 이메일 앱이 자동으로 열려요</div>
          </GlassCard>

          <SHead>엑셀 내보내기</SHead>
          <GlassCard style={{ marginBottom: 20 }}>
            <PBtn onClick={() => exportXlsx(txns, cfg.projectName)}>📊 지출결의서 다운로드</PBtn>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,.4)", marginTop: 10 }}>A열 프로젝트명 / E열 일자 / F열 금액 자동 입력</div>
          </GlassCard>

          <PBtn onClick={() => { S.set("cfg", cfg); setNtf(false); ping("저장됐어요 ✨"); }}>전체 설정 저장</PBtn>
          
          <div style={{ marginTop: 16 }}>
            <div className="glass-dark" style={{ borderRadius: 16, padding: "14px 18px", marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)", marginBottom: 4 }}>로그인 계정</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{user?.email}</div>
            </div>
            <PBtn secondary onClick={() => { supabase.auth.signOut(); setUser(null); setTxns([]); }}>
              로그아웃
            </PBtn>
          </div>
        </div>
      )}
      {/* ══ FAB ══ */}
      {!overlay && tab !== "settings" && (
        <>
          {fabOpen && (
            <div style={{ position: "fixed", bottom: 90, left: "50%", transform: "translateX(-50%)", display: "flex", flexDirection: "column", gap: 8, alignItems: "center", zIndex: 60, width: "100%", padding: "0 22px" }}>
              {[
                { icon: "📷", label: "카메라로 찍기", fn: () => camRef.current?.click() },
                { icon: "🖼", label: "갤러리에서 불러오기", fn: () => galRef.current?.click() },
                { icon: "✏️", label: "직접 입력", fn: () => { setForm({ amount: "", merchant: "", date: todayMD() }); setOv("manual"); setFab(false); } },
              ].map((opt, i) => (
                <button key={opt.label} className="glass btn-press" onClick={() => { opt.fn(); setFab(false); }} style={{
                  display: "flex", alignItems: "center", gap: 12, borderRadius: 16, padding: "13px 22px",
                  fontSize: 14, fontWeight: 700, color: "#fff", cursor: "pointer",
                  width: "100%", maxWidth: 300, boxShadow: "0 8px 32px rgba(90,60,180,.3)",
                  animation: "fabPop .22s ease both", animationDelay: `${i * .07}s`, fontFamily: "inherit", transition: "transform .15s"
                }}>
                  <span style={{ fontSize: 20 }}>{opt.icon}</span><span>{opt.label}</span>
                </button>
              ))}
            </div>
          )}
          <div style={{ position: "fixed", bottom: 84, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, display: "flex", justifyContent: "center", zIndex: 80, pointerEvents: "none" }}>
            <button className="btn-press" onClick={() => setFab(p => !p)} style={{
              width: 58, height: 58, borderRadius: "50%",
              background: "linear-gradient(135deg, #A78BFA, #7C3AED)",
              border: "2px solid rgba(255,255,255,.4)", fontSize: 26, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 8px 28px rgba(124,58,237,.5)",
              transition: "transform .25s", transform: fabOpen ? "rotate(45deg)" : "rotate(0deg)",
              pointerEvents: "auto", color: "#fff"
            }}>+</button>
          </div>
        </>
      )}

      <TabBar tab={tab} setTab={t => { setTab(t); setFab(false); }} />
      <input ref={camRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />
      <input ref={galRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />
    </div>
  );
}