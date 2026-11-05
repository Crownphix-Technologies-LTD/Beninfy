'use client'

type PrintReceiptButtonProps = {
  label: string
}

export default function PrintReceiptButton({ label }: PrintReceiptButtonProps) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="flex w-full items-center justify-center gap-2 rounded-xl border-2 px-8 py-4 text-sm font-semibold transition-all hover:opacity-80 md:w-auto"
      style={{ color: '#735c00', borderColor: '#735c00' }}
    >
      <span className="material-symbols-outlined text-[20px]">download</span>
      {label}
    </button>
  )
}
