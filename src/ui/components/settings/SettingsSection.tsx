export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs text-text-strong font-medium mb-3 font-sans">{title}</h3>
      {children}
    </div>
  )
}
