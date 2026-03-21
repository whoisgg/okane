'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getClient } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      // Clear any stale singleton so we get a fresh client on login
      if (typeof window !== 'undefined') delete (window as any).__okane_sb

      const sb = getClient()
      const { error, data } = await sb.auth.signInWithPassword({ email, password })
      if (error) {
        setError(error.message)
        setLoading(false)
      } else if (data.session) {
        router.push('/inicio')
      } else {
        setError('No se pudo establecer la sesión. Intenta de nuevo.')
        setLoading(false)
      }
    } catch (err: any) {
      setError(err?.message ?? 'Error de red. Verifica tu conexión.')
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <span className="text-5xl">お</span>
          <h1 className="mt-2 text-2xl font-bold text-text-primary">Okane</h1>
          <p className="text-sm text-text-secondary">Finanzas personales</p>
        </div>

        <form onSubmit={handleLogin} className="card space-y-4 p-6">
          <div>
            <label className="mb-1 block text-sm font-medium text-text-primary">Email</label>
            <input
              type="email"
              className="input"
              placeholder="tu@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-text-primary">Contraseña</label>
            <input
              type="password"
              className="input"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
          )}

          <button type="submit" className="btn-primary w-full justify-center" disabled={loading}>
            {loading ? 'Ingresando...' : 'Iniciar sesión'}
          </button>
        </form>
      </div>
    </div>
  )
}
