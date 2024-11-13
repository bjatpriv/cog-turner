import { useState, useEffect } from 'react'
import { Record } from '@/types/records'

export function useRecords(style: string | null) {
  const [records, setRecords] = useState<Record[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!style) {
      setRecords([])
      return
    }

    let isMounted = true

    async function fetchRecords() {
      setIsLoading(true)
      setError(null)

      try {
        if (typeof style === 'string') {
          const response = await fetch(`/api/records?style=${encodeURIComponent(style)}`)
          const data = await response.json()

          if (!response.ok) {
            throw new Error(data.error || 'Failed to fetch records')
          }

          if (isMounted) {
            setRecords(data)
          }
        }
      } catch (err) {
        if (isMounted) {
          console.error('Error fetching records:', err)
          setError(err instanceof Error ? err.message : 'An error occurred')
          setRecords([])
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    fetchRecords()

    return () => {
      isMounted = false
    }
  }, [style])

  return { records, isLoading, error }
} 