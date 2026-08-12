export default function DashboardPendingBanner({ label, onClick }) {
  if (!label) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-[10px] border border-success/20 bg-success/10 px-4 py-2.5 text-left text-sm font-semibold text-success hover:bg-success/20"
    >
      {label}
    </button>
  );
}
