import Holidays from "date-holidays";
import { formatDateHeader, formatStoredDate, pad2, parseTxnDate, pctColor, sameTxnDate } from "../utils/date";

function CalendarView({ txns, onDayPress, monthDate, selectedDate }) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const today = new Date();
  const firstDay = monthDate.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const dayTotals = {};
  txns.forEach((tx) => {
    const txDate = parseTxnDate(tx.date, monthDate);
    if (!txDate) return;
    if (txDate.getFullYear() === year && txDate.getMonth() === month) {
      const day = txDate.getDate();
      dayTotals[day] = (dayTotals[day] || 0) + tx.amount;
    }
  });

  const hasTx = (day) => !!dayTotals[day];
  const isToday = (day) => day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
  const isSelected = (day) => selectedDate === `${year}-${pad2(month + 1)}-${pad2(day)}`;

  const cells = [];
  for (let i = 0; i < firstDay; i += 1) cells.push(null);
  for (let i = 1; i <= daysInMonth; i += 1) cells.push(i);

  return (
    <div style={{ padding: "0 4px 8px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", textAlign: "center", marginBottom: 12 }}>
        {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
          <div key={d} style={{ fontSize: 11, color: "#94A3B8", padding: "4px 0", fontWeight: 500 }}>
            {d}
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", rowGap: 14 }}>
        {cells.map((day, i) => (
          <div
            key={i}
            style={{ minHeight: 52, textAlign: "center", cursor: day && hasTx(day) ? "pointer" : "default" }}
            onClick={() => day && hasTx(day) && onDayPress(`${year}-${pad2(month + 1)}-${pad2(day)}`)}
          >
            {day && (
              <>
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: "50%",
                    margin: "0 auto",
                    background: isToday(day) ? "#6366F1" : isSelected(day) ? "rgba(99,102,241,.12)" : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: isToday(day) ? "#fff" : "#1A1A2E",
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  {day}
                </div>
                <div style={{ height: 16, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", marginTop: 2 }}>
                  {hasTx(day) && (
                    <span style={{ fontSize: 9, color: "#6366F1", fontWeight: 500, whiteSpace: "nowrap" }}>
                      ₩{dayTotals[day].toLocaleString()}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CalendarDaySheet({ dateKey, txns, onClose, onEdit }) {
  const dayTxns = txns.filter((tx) => sameTxnDate(tx.date, dateKey));
  const total = dayTxns.reduce((s, t) => s + t.amount, 0);

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(26,26,46,.38)", zIndex: 200, backdropFilter: "blur(8px)" }} />
      <div
        className="glass-panel"
        style={{
          position: "fixed",
          bottom: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: "100%",
          maxWidth: 430,
          background: "linear-gradient(180deg, rgba(252,253,255,.88), rgba(238,244,255,.72))",
          zIndex: 201,
          borderRadius: "32px 32px 0 0",
          padding: "14px 24px 22px",
          paddingBottom: "calc(22px + env(safe-area-inset-bottom, 0px))",
          animation: "slideUp .28s cubic-bezier(.22,1,.36,1)",
          boxShadow: "0 -18px 42px rgba(148,163,184,.18)",
          border: "1px solid rgba(255,255,255,.92)",
          backdropFilter: "blur(24px)",
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 600, color: "#64748B", marginBottom: 6, marginTop: 4 }}>{formatDateHeader(dateKey)}</div>
        <div style={{ fontSize: 28, fontWeight: 800, color: "#1A1A2E", letterSpacing: "-.8px", marginBottom: 18 }}>₩{total.toLocaleString()}</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 13, color: "#94A3B8", fontWeight: 600 }}>사용 내역</span>
          <span style={{ fontSize: 13, color: "#94A3B8" }}>{dayTxns.length}건</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 0, marginBottom: 22, background: "rgba(255,255,255,.42)", borderRadius: 20, padding: "0 2px", border: "1px solid rgba(255,255,255,.74)" }}>
          {dayTxns.map((tx, i) => (
            <button
              key={tx.id}
              onClick={() => {
                onEdit(tx);
                onClose();
              }}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "16px 14px",
                borderBottom: i < dayTxns.length - 1 ? "1px solid rgba(226,232,240,.78)" : "none",
                background: "none",
                border: "none",
                cursor: "pointer",
                width: "100%",
                fontFamily: "inherit",
                borderRadius: 0,
              }}
            >
              <span style={{ fontSize: 15, fontWeight: 600, color: "#1e1b4b" }}>{tx.merchant}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#475569" }}>₩{tx.amount.toLocaleString()}</span>
            </button>
          ))}
        </div>
        <button
          className="btn-press"
          onClick={onClose}
          style={{
            width: "100%",
            padding: "16px",
            borderRadius: 18,
            border: "1px solid rgba(255,255,255,.88)",
            cursor: "pointer",
            background: "linear-gradient(150deg,#8B93FF,#6366F1)",
            color: "#fff",
            fontSize: 15,
            fontWeight: 700,
            fontFamily: "inherit",
            boxShadow: "0 16px 28px rgba(99,102,241,.22)",
          }}
        >
          확인
        </button>
      </div>
    </>
  );
}

export default function HomeScreen({
  txns,
  remaining,
  used,
  limit,
  homeView,
  setHomeView,
  homeMonthLabel,
  canGoPrevHomeMonth,
  canGoNextHomeMonth,
  onPrevMonth,
  onNextMonth,
  homeMonthTxns,
  groupedTxns,
  sortedDateKeys,
  openEdit,
  delTxn,
  calDaySheet,
  setCalDaySheet,
  homeMonthDate,
  HeroGraphic,
}) {
  const pct = Math.min(100, (used / limit) * 100);
  const pc = pctColor(pct);
  const hd = new Holidays("KR");
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  let wdl = 0;
  for (let d = today.getDate(); d <= lastDay; d += 1) {
    const dt = new Date(year, month, d);
    const dow = dt.getDay();
    if (dow !== 0 && dow !== 6 && !hd.isHoliday(dt)) wdl += 1;
  }
  const dailyBudget = wdl > 0 ? Math.round(remaining / wdl) : 0;

  const homeMonthNavBtn = {
    background: "none",
    border: "none",
    cursor: "pointer",
    width: 24,
    height: 24,
    padding: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#94A3B8",
    fontSize: 24,
    fontWeight: 500,
  };

  return (
    <div style={{ position: "relative", zIndex: 1 }}>
      <div style={{ padding: "52px 20px 0" }}>
        <div className="glass-panel" style={{ background: "linear-gradient(180deg, rgba(255,255,255,.78), rgba(255,255,255,.58))", borderRadius: 24, padding: "22px", boxShadow: "0 18px 40px rgba(99,102,241,.12)", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "stretch", justifyContent: "space-between", gap: 16 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 4, fontWeight: 500 }}>이번 달 잔액</div>
              <div style={{ fontSize: 36, fontWeight: 900, letterSpacing: "-1.5px", color: "#1e1b4b", lineHeight: 1.1, marginBottom: 6 }}>₩{remaining.toLocaleString()}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 2 }}>
                <div style={{ alignSelf: "flex-start", background: "#EEF2FF", borderRadius: 20, padding: "5px 12px", fontSize: 11, fontWeight: 600, color: "#6366F1", whiteSpace: "nowrap" }}>
                  일일 사용 가능 금액 ₩{dailyBudget.toLocaleString()}
                </div>
                <div style={{ alignSelf: "flex-start", background: pct >= 90 ? "#FEF2F2" : pct >= 70 ? "#FFFBEB" : "#F0FDF4", borderRadius: 20, padding: "5px 12px", fontSize: 11, fontWeight: 600, color: pc }}>
                  사용률 {Math.round(pct)}%
                </div>
              </div>
            </div>
            <div style={{ width: 110, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
              {HeroGraphic}
            </div>
          </div>
        </div>

        <div className="glass-soft" style={{ background: "rgba(255,255,255,.62)", borderRadius: 14, padding: "4px", boxShadow: "0 12px 28px rgba(99,102,241,.10)", display: "flex", marginBottom: 16 }}>
          {[{ id: "list", label: "리스트" }, { id: "calendar", label: "달력" }].map(({ id, label }) => (
            <button
              key={id}
              className="btn-press"
              onClick={() => setHomeView(id)}
              style={{
                flex: 1,
                padding: "10px",
                borderRadius: 10,
                border: "none",
                cursor: "pointer",
                fontSize: 14,
                fontWeight: homeView === id ? 700 : 500,
                background: homeView === id ? "linear-gradient(150deg,#7C83FF,#6366F1)" : "transparent",
                color: homeView === id ? "#FFFFFF" : "#64748B",
                transition: "all .2s",
                fontFamily: "inherit",
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 4px 16px" }}>
          <button className="btn-press" onClick={onPrevMonth} disabled={!canGoPrevHomeMonth} style={{ ...homeMonthNavBtn, opacity: canGoPrevHomeMonth ? 1 : 0.32, cursor: canGoPrevHomeMonth ? "pointer" : "default" }}>
            ‹
          </button>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1A1A2E" }}>{homeMonthLabel}</div>
          <button className="btn-press" onClick={onNextMonth} disabled={!canGoNextHomeMonth} style={{ ...homeMonthNavBtn, opacity: canGoNextHomeMonth ? 1 : 0.32, cursor: canGoNextHomeMonth ? "pointer" : "default" }}>
            ›
          </button>
        </div>
      </div>

      {homeView === "list" && (
        <div style={{ padding: "0 20px 20px" }}>
          {homeMonthTxns.length === 0 && (
            <div style={{ textAlign: "center", padding: "56px 0" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🍽</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#64748B" }}>아직 기록이 없어요</div>
              <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 6 }}>+ 버튼으로 추가해봐요</div>
            </div>
          )}
          {sortedDateKeys.map((dateKey) => {
            const group = groupedTxns[dateKey];
            const dayTotal = group.reduce((s, t) => s + t.amount, 0);
            return (
              <div key={dateKey} style={{ marginBottom: 8, overflow: "visible" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 8px", background: "#F8FAFC", borderRadius: 8, marginBottom: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#1A1A2E" }}>{formatDateHeader(dateKey)}</span>
                  <span style={{ fontSize: 13, color: "#EF4444" }}>₩{dayTotal.toLocaleString()}</span>
                </div>
                <div style={{ padding: "0 8px" }}>
                  {group.map((tx, i) => (
                    <div
                      key={tx.id}
                      className="tx-row fu"
                      onClick={() => openEdit(tx)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        minHeight: 48,
                        padding: "0 0",
                        borderBottom: i < group.length - 1 ? "1px solid #F1F5F9" : "none",
                        cursor: "pointer",
                        borderRadius: 0,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                        <div style={{ fontSize: 14, fontWeight: 400, color: "#1A1A2E", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.merchant}</div>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 400, color: "#1A1A2E", flexShrink: 0, textAlign: "right" }}>₩{tx.amount.toLocaleString()}</div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          delTxn(tx.id);
                        }}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#CBD5E1", fontSize: 16, lineHeight: 1, padding: "0 0 0 8px", flexShrink: 0 }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {homeView === "calendar" && (
        <div style={{ padding: "0 20px 20px" }}>
          <CalendarView txns={homeMonthTxns} monthDate={homeMonthDate} selectedDate={calDaySheet} onDayPress={(dateKey) => setCalDaySheet(dateKey)} />
        </div>
      )}
    </div>
  );
}
