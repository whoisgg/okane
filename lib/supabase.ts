import { createClient as createSupabaseClient } from '@supabase/supabase-js'

type SupabaseClient = ReturnType<typeof createSupabaseClient>

declare global {
  interface Window { __okane_sb?: SupabaseClient }
}

export function createClient(): SupabaseClient {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// Singleton anchored to window to survive Next.js HMR reloads.
// Without this, each hot reload creates a new client instance that steals
// the Web Lock from the previous one, aborting auth requests mid-flight.
export function getClient(): SupabaseClient {
  if (typeof window === 'undefined') return createClient()
  if (!window.__okane_sb) window.__okane_sb = createClient()
  return window.__okane_sb
}
