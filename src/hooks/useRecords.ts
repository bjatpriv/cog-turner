import { useState, useEffect } from 'react'
import { Record } from '@/types/records'

const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000 // 7 days

interface CachedData {
  timestamp: number;
  data: Record[];
}

interface StyleCache {
  [style: string]: CachedData;
}

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
      // Try to load all cached styles first
      let styleCache: StyleCache = {}
      try {
        const cachedStyles = localStorage.getItem('all_styles_cache')
        if (cachedStyles) {
          styleCache = JSON.parse(cachedStyles)
        }
      } catch (err) {
        console.error('Error loading cache:', err)
      }

      // Check if we have valid cached data for this style
      const now = Date.now()
      if (styleCache[style] && (now - styleCache[style].timestamp) < CACHE_DURATION) {
        setRecords(styleCache[style].data)
        return
      }

      setIsLoading(true)
      setError(null)

      try {
        // Fetch basic records first
        const basicResponse = await fetch(`/api/records?style=${encodeURIComponent(style)}&phase=basic`)
        const basicData = await basicResponse.json()

        if (!basicResponse.ok) {
          throw new Error(basicData.error || 'Failed to fetch records')
        }

        if (isMounted) {
          setRecords(basicData.records)
        }

        // Then fetch complete records
        const completeResponse = await fetch(`/api/records?style=${encodeURIComponent(style)}&phase=complete`)
        const completeData = await completeResponse.json()

        if (!completeResponse.ok) {
          throw new Error(completeData.error || 'Failed to fetch complete records')
        }

        if (isMounted && completeData.records) {
          setRecords(completeData.records)
          
          // Update cache for this style
          styleCache[style] = {
            timestamp: now,
            data: completeData.records
          }

          // Save updated cache
          try {
            localStorage.setItem('all_styles_cache', JSON.stringify(styleCache))
          } catch (err) {
            console.error('Error saving to cache:', err)
            // If localStorage is full, clear old entries
            if (err.name === 'QuotaExceededError') {
              const oldestStyle = Object.entries(styleCache)
                .sort(([,a], [,b]) => a.timestamp - b.timestamp)[0]?.[0]
              if (oldestStyle) {
                delete styleCache[oldestStyle]
                localStorage.setItem('all_styles_cache', JSON.stringify(styleCache))
              }
            }
          }
        }
      } catch (err) {
        if (isMounted) {
          console.error('Error fetching records:', err)
          setError(err instanceof Error ? err.message : 'An error occurred')
          
          // If we have stale cache data, use it as fallback
          if (styleCache[style]) {
            console.log('Using stale cache data as fallback')
            setRecords(styleCache[style].data)
          }
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