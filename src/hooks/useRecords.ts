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

    async function fetchRecords() {
      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch(`/api/records?style=${encodeURIComponent(style)}`)
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Failed to fetch records')
        }

        if (!Array.isArray(data)) {
          console.error('Unexpected response:', data)
          throw new Error('Invalid response format')
        }

        setRecords(data)
      } catch (err) {
        console.error('Error fetching records:', err)
        setError(err instanceof Error ? err.message : 'An error occurred')
        setRecords([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchRecords()
  }, [style])

  return { records, isLoading, error }
} 