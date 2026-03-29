import { textPrimary } from "../styles/theme";

export default function Toast({ toast }) {
  if (!toast) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 104,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9999,
        background: toast.err
          ? "linear-gradient(180deg, rgba(248,113,113,.92), rgba(239,68,68,.88))"
          : "linear-gradient(180deg, rgba(129,140,248,.95), rgba(99,102,241,.88))",
        backdropFilter: "blur(18px)",
        color: "#FFFFFF",
        padding: "11px 24px",
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 700,
        whiteSpace: "nowrap",
        boxShadow: "0 18px 36px rgba(99,102,241,.24)",
        animation: "toast .25s ease both",
        border: "1px solid rgba(255,255,255,.2)",
      }}
    >
      {toast.msg}
    </div>
  );
}
