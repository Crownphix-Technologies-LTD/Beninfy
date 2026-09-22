import { XCircle } from 'lucide-react'

export default function MobilePaymentCancelPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-white px-6 text-center">
      <div className="max-w-sm">
        <XCircle className="mx-auto text-gray-500" size={40} />
        <h1 className="mt-4 text-xl font-bold text-gray-950">Checkout closed</h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          No payment status was changed. You can return to Beninfy and try again when ready.
        </p>
      </div>
    </main>
  )
}
