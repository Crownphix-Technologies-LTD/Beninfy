import { Prisma } from '@prisma/client'

// Raw SELECT ... FOR UPDATE conflicts surface as P2010 + SQLSTATE in Prisma's
// PostgreSQL adapter, whereas ordinary writes can surface as P2034.
export function isPaymentSerializationConflict(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false
  const adapter = error.meta?.driverAdapterError as
    | { cause?: { kind?: string; originalCode?: string } }
    | undefined
  return (
    error.code === 'P2034' ||
    (error.code === 'P2010' &&
      (adapter?.cause?.kind === 'TransactionWriteConflict' ||
        ['40001', '40P01'].includes(String(error.meta?.code ?? adapter?.cause?.originalCode))))
  )
}

export async function retryPaymentSerialization<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation()
    } catch (error) {
      if (!isPaymentSerializationConflict(error) || attempt >= 2) throw error
      // Retry the entire rolled-back transaction with a fresh snapshot.
      await new Promise((resolve) => setTimeout(resolve, 20 * 2 ** attempt))
    }
  }
}
