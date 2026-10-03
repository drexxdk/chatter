import { redirect } from 'next/navigation'

// This app has no public frontend of its own — the real chat client lives in apps/web.
export default function HomePage() {
  redirect('/admin')
}

