import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const supabase = supabaseUrl && publishableKey
  ? createClient(supabaseUrl, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null

export const isSupabaseConfigured = Boolean(supabase)

export async function invokeAdmin(action, values = {}) {
  if (!supabase) throw new Error('Supabase is not configured. Add the public project URL and publishable key.')

  const { data, error } = await supabase.functions.invoke('admin-api', {
    body: { action, ...values },
  })
  if (error) {
    let responseMessage = ''
    if (error.context && typeof error.context.json === 'function') {
      try {
        const response = await error.context.json()
        responseMessage = response.error || ''
      } catch {
        responseMessage = ''
      }
    }
    throw new Error(responseMessage || error.message)
  }
  if (data?.error) throw new Error(data.error)
  return data
}
