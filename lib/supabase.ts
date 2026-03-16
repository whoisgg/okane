import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export function createClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// Singleton for client components
let _client: ReturnType<typeof createClient> | null = null
export function getClient() {
  if (!_client) _client = createClient()
  return _client
}
