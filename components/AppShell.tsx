'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getClient } from '@/lib/supabase'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const sb = getClient()
    sb.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setLoading(false)
        return
      }
      // No session in cache yet — could be a post-login race.
      // Listen for auth state change before giving up.
      const { data: { subscription } } = sb.auth.onAuthStateChange((event, s) => {
        if (s) {
          setLoading(false)
          subscription.unsubscribe()
        } else if (event === 'SIGNED_OUT' || event === 'INITIAL_SESSION') {
          subscription.unsubscribe()
          router.replace('/login')
        }
      })
      // Safety: if nothing fires in 3s, redirect to login
      const t = setTimeout(() => {
        subscription.unsubscribe()
        router.replace('/login')
      }, 3000)
      return () => { clearTimeout(t); subscription.unsubscribe() }
    })
  }, [router])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      {/* Desktop sidebar — hidden on mobile */}
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      {/* Main content — extra bottom padding on mobile for the tab bar */}
      <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
        {children}
      </main>

      {/* Mobile bottom nav — hidden on desktop */}
      <div className="fixed bottom-0 left-0 right-0 z-40 md:hidden">
        <BottomNav />
      </div>
    </div>
  )
}
