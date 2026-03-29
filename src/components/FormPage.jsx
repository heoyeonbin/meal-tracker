import { fromYMD, toYMD } from "../utils/date";

const FormInput = ({ label, value, onChange, type = "text", placeholder }) => (
  <div style={{ marginBottom: 12 }}>
    {label && (
      <div style={{ fontSize: 12, color: "#64748B", fontWeight: 500, marginBottom: 6, textAlign: "left" }}>
        {label}
      </div>
    )}
    <input
      className="inp"
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: "100%",
        background: "#FFFFFF",
        border: "1px solid #E2E8F0",
        borderRadius: 10,
        padding: "13px 14px",
        fontSize: 15,
        color: "#1e1b4b",
        outline: "none",
        transition: "border-color .15s, box-shadow .15s",
        fontFamily: "inherit",
        boxShadow: "none",
      }}
    />
  </div>
);

const FixedConfirmBtn = ({ onClick, label = "확인" }) => (
  <div
    style={{
      position: "fixed",
      bottom: 0,
      left: "50%",
      transform: "translateX(-50%)",
      width: "100%",
      maxWidth: 430,
      padding: "16px 20px",
      paddingBottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
      background: "linear-gradient(to top,rgba(232,244,253,.96) 50%,rgba(232,244,253,0))",
    }}
  >
    <button
      className="btn-press"
      onClick={onClick}
      style={{
        width: "100%",
        height: 52,
        borderRadius: 14,
        padding: "0 16px",
        fontSize: 16,
        fontWeight: 700,
        cursor: "pointer",
        border: "none",
        color: "#fff",
        fontFamily: "inherit",
        background: "linear-gradient(90deg,#818CF8,#6366F1)",
        boxShadow: "0 12px 28px rgba(99,102,241,.28)",
      }}
    >
      {label}
    </button>
  </div>
);

const CameraPlaceholderIcon = () => (
  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);

export default function FormPage({ source, preview, ocrRes, form, setForm, onSubmit }) {
  const titleMap = { camera: "영수증 촬영", gallery: "사진 업로드", manual: "직접 등록", edit: "내역 수정" };
  const title = titleMap[source] || "입력";
  const isManualForm = source === "manual" || (source === "edit" && !preview);
  const showsImageArea = source === "camera" || source === "gallery" || (source === "edit" && !!preview);
  const headerButtonStyle = isManualForm
    ? { width: 36, height: 36, borderRadius: 10, background: "transparent", border: "none", boxShadow: "none" }
    : { width: 24, height: 24, borderRadius: 0, background: "transparent", border: "none", boxShadow: "none" };
  const formCardStyle = {
    margin: "0 20px",
    background: "linear-gradient(180deg, rgba(255,255,255,.72), rgba(255,255,255,.58))",
    borderRadius: 16,
    padding: "20px",
    boxShadow: isManualForm ? "0 12px 30px rgba(148,163,184,.12)" : "0 16px 34px rgba(148,163,184,.12)",
    border: isManualForm ? "1px solid rgba(255,255,255,.9)" : "1px solid rgba(255,255,255,.92)",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        minHeight: "100dvh",
        background:
          "radial-gradient(circle at top right, rgba(255,255,255,.82), transparent 24%), radial-gradient(circle at bottom left, rgba(199,210,254,.32), transparent 30%), linear-gradient(160deg,#EEF0FF 0%,#E8F0FA 40%,#E8F4FD 100%)",
        zIndex: 300,
        maxWidth: "none",
        margin: 0,
        overflowY: "auto",
        paddingBottom: 100,
        backgroundRepeat: "no-repeat",
        backgroundAttachment: "fixed",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: `${isManualForm ? 52 : 58}px 20px 16px` }}>
        <button
          className="btn-press"
          onClick={() => window.history.back()}
          style={{ ...headerButtonStyle, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
        >
          <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div style={{ fontSize: isManualForm ? 17 : 18, fontWeight: 700, color: "#1A1A2E", lineHeight: 1 }}>{title}</div>
      </div>

      {showsImageArea && (
        <div style={{ margin: "0 20px 16px" }}>
          {preview ? (
            <div className="glass-panel" style={{ width: "100%", height: 200, borderRadius: 16, overflow: "hidden", boxShadow: "0 16px 36px rgba(148,163,184,.14)", border: "1.5px solid #E2E8F0" }}>
              <img src={preview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </div>
          ) : (
            <div
              className="glass-panel"
              style={{
                width: "100%",
                height: 200,
                borderRadius: 16,
                background: "linear-gradient(180deg, rgba(255,255,255,.74), rgba(255,255,255,.60))",
                border: "1.5px solid #E2E8F0",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                boxShadow: "0 16px 36px rgba(148,163,184,.14)",
              }}
            >
              <CameraPlaceholderIcon />
              <div style={{ fontSize: 13, color: "#94A3B8", fontWeight: 500 }}>사진을 촬영하거나 업로드하세요</div>
            </div>
          )}
        </div>
      )}

      {source === "camera" && ocrRes?.amount && (
        <div style={{ margin: "0 20px 12px", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 14, padding: "12px 16px" }}>
          <div style={{ fontSize: 11, color: "#10B981", fontWeight: 700, marginBottom: 2 }}>✓ 자동 인식 완료</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#1e1b4b" }}>{ocrRes.amount.toLocaleString()}원</div>
        </div>
      )}
      {source === "camera" && ocrRes && !ocrRes.amount && (
        <div style={{ margin: "0 20px 12px", background: "#FFF5F5", border: "1px solid #FED7D7", borderRadius: 14, padding: "12px 16px", fontSize: 13, color: "#EF4444" }}>
          인식 실패 — 아래에 직접 입력해주세요
        </div>
      )}

      <div className="glass-panel" style={formCardStyle}>
        <FormInput
          label="결제 금액"
          value={form.amount ? parseInt(form.amount, 10).toLocaleString() : ""}
          onChange={(v) => setForm((f) => ({ ...f, amount: v.replace(/[^0-9]/g, "") }))}
          placeholder="₩ 0"
        />
        <FormInput label="사용 날짜" type="date" value={toYMD(form.date)} onChange={(v) => setForm((f) => ({ ...f, date: fromYMD(v) }))} />
        <FormInput
          label="가맹점명"
          value={form.merchant}
          onChange={(v) => setForm((f) => ({ ...f, merchant: v }))}
          placeholder="가맹점 이름을 입력해 주세요."
        />
      </div>

      <FixedConfirmBtn onClick={onSubmit} />
    </div>
  );
}
