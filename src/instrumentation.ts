// Warm the database at server boot so the first click never pays the
// cold-connect cost (Atlas connects can take seconds).
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { warmDb } = await import('./lib/db');
    warmDb().catch(() => {});
  }
}
