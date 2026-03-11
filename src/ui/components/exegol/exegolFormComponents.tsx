import { Loader2 } from "lucide-react"

export function ActionBtn({
  onClick,
  loading,
  title,
  className,
  children,
}: {
  onClick: () => void
  loading?: boolean
  title: string
  className: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      title={title}
      className={`p-1 rounded transition-colors disabled:opacity-30 ${className}`}
    >
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        children
      )}
    </button>
  )
}

export function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-[10px] text-text-weaker font-sans font-medium uppercase tracking-wide mb-1">
        {label}
        {required && <span className="text-status-error ml-0.5">*</span>}
      </label>
      {children}
      {hint && (
        <p className="text-[10px] text-text-weaker/60 font-sans mt-0.5">{hint}</p>
      )}
    </div>
  )
}

export function TextInput({
  value,
  onChange,
  placeholder,
  mono,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  mono?: boolean
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full bg-surface-2 border border-border-weak rounded-lg px-3 py-1.5 text-xs text-text-strong focus:outline-none focus:border-accent/50 placeholder-text-weaker ${
        mono ? "font-mono" : "font-sans"
      }`}
    />
  )
}

export function Toggle({
  label,
  hint,
  checked,
  onChange,
  danger,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
  danger?: boolean
}) {
  return (
    <label className="flex items-start gap-2 cursor-pointer group">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 rounded border-border-weak bg-surface-2 text-accent focus:ring-accent/30 w-3.5 h-3.5"
      />
      <div className="flex-1 min-w-0">
        <span className={`text-xs font-sans ${danger && checked ? "text-status-error" : "text-text-base"}`}>
          {label}
        </span>
        {hint && (
          <span className="text-[10px] text-text-weaker/60 font-sans ml-1.5">
            {hint}
          </span>
        )}
      </div>
    </label>
  )
}
