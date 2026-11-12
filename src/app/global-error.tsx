'use client'

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body className="m-0 bg-[#f7f7fa] font-sans text-gray-900">
        <main className="flex min-h-screen items-center justify-center px-5 py-12">
          <section className="w-full max-w-lg border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
            <span className="material-symbols-outlined text-primary text-[30px]" aria-hidden="true">
              error
            </span>
            <h1 className="mt-4 text-2xl font-bold">We could not load this page</h1>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              Your booking has not been submitted again. Check your connection, then retry or return
              to the home page.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={reset}
                className="bg-primary focus:ring-primary px-4 py-2.5 text-sm font-semibold text-white focus:ring-2 focus:ring-offset-2 focus:outline-none"
              >
                Try again
              </button>
              <a
                href="/"
                className="focus:ring-primary border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-800 focus:ring-2 focus:ring-offset-2 focus:outline-none"
              >
                Return home
              </a>
            </div>
          </section>
        </main>
      </body>
    </html>
  )
}
