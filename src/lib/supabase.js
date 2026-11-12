import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

let supabase = null
let supabaseConfigError = ''

if (!supabaseUrl || !publishableKey) {
  supabaseConfigError = 'Backend is not configured. Add the Supabase project URL and publishable key.'
} else {
  try {
    const parsedUrl = new URL(supabaseUrl)
    if (!['https:', 'http:'].includes(parsedUrl.protocol)) {
      throw new Error('The Supabase URL must use HTTPS.')
    }
    if (parsedUrl.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(parsedUrl.hostname)) {
      throw new Error('The Supabase URL must use HTTPS outside local development.')
    }

    supabase = createClient(supabaseUrl, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  } catch (error) {
    supabaseConfigError = error instanceof Error ? error.message : 'The Supabase configuration is invalid.'
  }
}

export { supabase, supabaseConfigError }
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
