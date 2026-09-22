import { CheckCircle2 } from 'lucide-react'

export default function MobilePaymentSuccessPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-white px-6 text-center">
      <div className="max-w-sm">
        <CheckCircle2 className="mx-auto text-emerald-600" size={40} />
        <h1 className="mt-4 text-xl font-bold text-gray-950">Payment submitted</h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          Return to the Beninfy app while we verify your payment securely.
        </p>
      </div>
    </main>
  )
}
