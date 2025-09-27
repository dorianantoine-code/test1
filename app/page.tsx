"use client"
import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"

export default function Home() {
  const [msg, setMsg] = useState("...")

  useEffect(() => {
    setMsg("Hello World depuis Supabase 🚀")
  }, [])

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100">
      <h1 className="text-3xl font-bold text-green-600">{msg}</h1>
    </main>
  )
}