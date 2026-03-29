import { formatStoredDate } from "../utils/date";
import { brand, textMuted, textPrimary, textSecondary } from "../styles/theme";

export function GalleryBottomSheet({ tx, onClose, onEdit, onDelete }) {
  if (!tx) return null;

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(26,26,46,.35)", backdropFilter: "blur(8px)" }} />
      <div
        className="glass-panel"
        style={{
          position: "fixed",
          bottom: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: "100%",
          maxWidth: 430,
          background: "linear-gradient(180deg, rgba(255,255,255,.82), rgba(255,255,255,.70))",
          borderRadius: "24px 24px 0 0",
          padding: "12px 20px",
          paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))",
          zIndex: 301,
          animation: "slideUp .22s ease",
          boxShadow: "0 -20px 44px rgba(99,102,241,.14)",
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, color: textMuted, marginBottom: 14, marginTop: 4, textAlign: "center" }}>{tx.merchant}</div>
        <button onClick={onEdit} style={{ width: "100%", padding: "15px", borderRadius: 16, background: "#EEF2FF", border: "none", color: brand, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", marginBottom: 10 }}>
          수정
        </button>
        <button onClick={onDelete} style={{ width: "100%", padding: "15px", borderRadius: 16, background: "#FFF5F5", border: "none", color: "#EF4444", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
          삭제
        </button>
      </div>
    </>
  );
}

export default function GalleryScreen({
  filteredTxns,
  recs,
  canGoPrevGalleryMonth,
  canGoNextGalleryMonth,
  onPrevMonth,
  onNextMonth,
  filterLabel,
  onDownloadAll,
  onDownloadReceipt,
  onOpenItemMenu,
  currentServerMonthDate,
  DownloadIcon,
}) {
  const galleryTxns = filteredTxns.filter((t) => recs[t.id]);
  const totalAmt = filteredTxns.reduce((s, t) => s + t.amount, 0);

  return (
    <div style={{ position: "relative", zIndex: 1, padding: "52px 20px 0" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button className="btn-press" onClick={onPrevMonth} disabled={!canGoPrevGalleryMonth} style={{ background: "none", border: "none", padding: 0, cursor: canGoPrevGalleryMonth ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", opacity: canGoPrevGalleryMonth ? 1 : 0.32 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#1A1A2E" }}>{filterLabel}</div>
          <button className="btn-press" onClick={onNextMonth} disabled={!canGoNextGalleryMonth} style={{ background: "none", border: "none", padding: 0, cursor: canGoNextGalleryMonth ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", opacity: canGoNextGalleryMonth ? 1 : 0.32 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 14, color: "#94A3B8", fontWeight: 400 }}>{filterLabel} 사용 금액 · ₩{totalAmt.toLocaleString()}</div>
          {galleryTxns.length > 0 && (
            <button onClick={onDownloadAll} className="btn-press" style={{ display: "flex", alignItems: "center", padding: "0 14px", height: 32, borderRadius: 20, background: "none", border: `1.5px solid ${brand}`, color: brand, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
              전체 다운로드
            </button>
          )}
        </div>
      </div>

      {galleryTxns.length > 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, paddingBottom: 8 }}>
          {galleryTxns.map((tx) => (
            <div key={tx.id} className="glass-soft" style={{ background: "linear-gradient(180deg, rgba(255,255,255,.72), rgba(255,255,255,.58))", borderRadius: 16, overflow: "hidden", position: "relative", boxShadow: "0 10px 24px rgba(148,163,184,.10)", border: "1px solid rgba(255,255,255,.84)" }}>
              <div style={{ position: "relative", borderRadius: "16px 16px 0 0", overflow: "hidden" }}>
                <img src={recs[tx.id]} alt="" onClick={() => onDownloadReceipt(tx.id)} style={{ width: "100%", height: 140, objectFit: "cover", display: "block", cursor: "pointer" }} />
              </div>
              <button onClick={(e) => { e.stopPropagation(); onOpenItemMenu(tx); }} style={{ position: "absolute", top: 8, right: 8, width: 28, height: 28, borderRadius: 14, background: "rgba(255,255,255,.80)", border: "1px solid rgba(255,255,255,.92)", color: "#64748B", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, letterSpacing: "0", boxShadow: "0 6px 14px rgba(148,163,184,.10)", backdropFilter: "blur(8px)" }}>⋯</button>
              <div style={{ padding: "12px 12px 14px" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3 }}>{tx.merchant}</div>
                <div style={{ fontSize: 12, color: brand, fontWeight: 700, marginTop: 4 }}>₩{tx.amount.toLocaleString()}</div>
                <div style={{ fontSize: 11, color: textMuted, marginTop: 3 }}>{formatStoredDate(tx.date, currentServerMonthDate)}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ textAlign: "center", padding: "64px 0", color: textMuted }}>
          <div style={{ fontSize: 14, fontWeight: 500 }}>저장된 영수증이 없어요</div>
        </div>
      )}
    </div>
  );
}
