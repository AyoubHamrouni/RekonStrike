export default function EmptyState({ icon: Icon, title, message, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-4">
      {Icon && (
        <div className="w-14 h-14 rounded-2xl bg-surface-2 border border-border flex items-center justify-center mb-4">
          <Icon size={24} className="text-text-dim" />
        </div>
      )}
      <h3 className="text-base font-semibold text-text mb-1.5">{title}</h3>
      {message && <p className="text-sm text-text-dim max-w-md mb-5">{message}</p>}
      {action}
    </div>
  );
}
