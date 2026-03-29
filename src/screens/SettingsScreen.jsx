import { brandGradient, textMuted, textPrimary } from "../styles/theme";

const FormInput = ({ value, onChange, placeholder }) => (
  <div style={{ marginBottom: 12 }}>
    <input
      className="inp"
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
        color: textPrimary,
        outline: "none",
        transition: "border-color .15s, box-shadow .15s",
        fontFamily: "inherit",
        boxShadow: "none",
      }}
    />
  </div>
);

export default function SettingsScreen({
  user,
  cfg,
  setCfg,
  openSection,
  setOpenSection,
  onSaveProject,
  onExportXlsx,
  onLogout,
}) {
  const initial = (user?.email || "?")[0].toUpperCase();
  const name = user?.email?.split("@")[0] || "";
  const rowS = { width: "100%", display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" };
  const iconBox = (c) => ({ width: 36, height: 36, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", background: `${c}12`, border: `1px solid ${c}25` });

  return (
    <div style={{ padding: "52px 20px 40px", position: "relative", zIndex: 1 }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: textPrimary, marginBottom: 20, textAlign: "left" }}>설정</div>
      <div className="glass-panel" style={{ background: "linear-gradient(180deg, rgba(255,255,255,.74), rgba(255,255,255,.58))", borderRadius: 24, padding: "20px", marginBottom: 24, boxShadow: "0 18px 40px rgba(99,102,241,.12)", display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ width: 56, height: 56, borderRadius: 18, flexShrink: 0, background: "linear-gradient(150deg,#818CF8,#6366F1)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 16px rgba(99,102,241,.3)" }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>{initial}</span>
        </div>
        <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: textPrimary }}>{name}</div>
            <div style={{ fontSize: 12, color: textMuted, marginTop: 2 }}>{user?.email}</div>
        </div>
      </div>

      <div style={{ fontSize: 11, fontWeight: 600, color: textMuted, letterSpacing: ".6px", textTransform: "uppercase", marginBottom: 8 }}>프로젝트 설정</div>
      <div className="glass-soft" style={{ background: "linear-gradient(180deg, rgba(255,255,255,.70), rgba(255,255,255,.56))", borderRadius: 20, overflow: "hidden", marginBottom: 20, boxShadow: "0 14px 32px rgba(148,163,184,.12)", border: "1px solid rgba(255,255,255,.88)" }}>
        <button onClick={() => setOpenSection(openSection === "project" ? null : "project")} style={{ ...rowS, borderBottom: openSection === "project" ? "1px solid #F1F5F9" : "none" }}>
          <div style={iconBox("#6366F1")}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 3H8L2 7h20l-6-4z" /></svg></div>
            <div style={{ flex: 1, textAlign: "left" }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: textPrimary }}>프로젝트명</div>
              <div style={{ fontSize: 12, color: textMuted, marginTop: 1 }}>{cfg.projectName || "미설정"}</div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
        </button>
        {openSection === "project" && (
          <div style={{ padding: "12px 16px 16px" }}>
            <FormInput value={cfg.projectName} onChange={(v) => setCfg((c) => ({ ...c, projectName: v }))} placeholder="우리 가계부" />
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button className="btn-press" onClick={() => setOpenSection(null)} style={{ flex: 1, padding: "11px", borderRadius: 12, background: "#F1F5F9", border: "none", color: "#64748B", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>취소</button>
                <button className="btn-press" onClick={onSaveProject} style={{ flex: 1, padding: "11px", borderRadius: 12, background: brandGradient, border: "none", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>저장</button>
            </div>
          </div>
        )}
      </div>

      <div style={{ fontSize: 11, fontWeight: 600, color: textMuted, letterSpacing: ".6px", textTransform: "uppercase", marginBottom: 8 }}>데이터 관리</div>
      <div className="glass-soft" style={{ background: "linear-gradient(180deg, rgba(255,255,255,.70), rgba(255,255,255,.56))", borderRadius: 20, overflow: "hidden", marginBottom: 20, boxShadow: "0 14px 32px rgba(148,163,184,.12)", border: "1px solid rgba(255,255,255,.88)" }}>
        <button onClick={onExportXlsx} style={rowS}>
          <div style={iconBox("#10B981")}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="18" x2="12" y2="11" /><polyline points="9 15 12 18 15 15" /></svg></div>
          <div style={{ flex: 1, textAlign: "left" }}><div style={{ fontSize: 14, fontWeight: 500, color: textPrimary }}>액셀 다운로드</div></div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
        </button>
      </div>

      <div style={{ fontSize: 11, fontWeight: 600, color: textMuted, letterSpacing: ".6px", textTransform: "uppercase", marginBottom: 8 }}>계정</div>
      <div className="glass-soft" style={{ background: "linear-gradient(180deg, rgba(255,255,255,.70), rgba(255,255,255,.56))", borderRadius: 20, overflow: "hidden", marginBottom: 20, boxShadow: "0 14px 32px rgba(148,163,184,.12)", border: "1px solid rgba(255,255,255,.88)" }}>
        <button onClick={onLogout} style={rowS}>
          <div style={iconBox("#EF4444")}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" /></svg></div>
          <div style={{ flex: 1, textAlign: "left" }}><div style={{ fontSize: 14, fontWeight: 500, color: "#EF4444" }}>로그아웃</div></div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
        </button>
      </div>
      <div style={{ textAlign: "center", marginTop: 12 }}><p style={{ color: "#CBD5E1", fontSize: 11 }}>ExpenseFlow v1.0.0 · © 2026</p></div>
    </div>
  );
}
