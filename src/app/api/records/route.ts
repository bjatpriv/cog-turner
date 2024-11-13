import { NextResponse } from 'next/server'
import { Record } from '@/types/records'

const DISCOGS_TOKEN = process.env.DISCOGS_TOKEN
const CACHE_KEY = 'daily_records'
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000 // 7 days
const BATCH_SIZE = 5 // Process 5 records at a time
const BATCH_DELAY = 1000 // 1 second between batches

type CacheData = {
  timestamp: number;
  records: Record[];
}

const cache: { [key: string]: CacheData } = {}

// Helper function to create basic record object
function createBasicRecord(item: DiscogsResponse['results'][0]): Record {
  return {
    id: item.id,
    artist: item.title.split(' - ')[0].trim(),
    title: item.title.split(' - ')[1] || item.title,
    style: style,
    year: item.year || 0,
    image: item.cover_image || '',
    youtubeId: null,
    lowestPrice: null,
    discogsUrl: `https://www.discogs.com/release/${item.id}`,
    communityRating: null,
    haves: item.community?.have ?? 0,
    wants: item.community?.want ?? 0,
  }
}

// Add exponential backoff for retries
async function fetchWithRetry(url: string, options: RequestInit, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options)
      
      if (response.status === 429) {
        // Calculate exponential backoff delay
        const delay = Math.min(1000 * Math.pow(2, i), 10000)
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }
      
      return response
    } catch (error) {
      if (i === retries - 1) throw error
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }
  throw new Error('Max retries exceeded')
}

// Update the helper functions to use fetchWithRetry
async function fetchReleaseDetails(releaseId: number) {
  try {
    const response = await fetchWithRetry(
      `https://api.discogs.com/releases/${releaseId}`,
      {
        headers: {
          'Authorization': `Discogs token=${DISCOGS_TOKEN}`,
          'User-Agent': 'CogTurner/1.0',
        }
      }
    )

    if (!response.ok) return null
    return response.json()
  } catch (error) {
    console.error(`Error fetching release details for ${releaseId}:`, error)
    return null
  }
}

// Helper function to fetch lowest price
async function fetchLowestPrice(releaseId: number): Promise<number | null> {
  try {
    const response = await fetch(
      `https://api.discogs.com/marketplace/stats/${releaseId}`,
      {
        headers: {
          'Authorization': `Discogs token=${DISCOGS_TOKEN}`,
          'User-Agent': 'CogTurner/1.0',
        }
      }
    )

    if (!response.ok) return null
    const data = await response.json()
    return data.lowest_price || null
  } catch (error) {
    console.error(`Error fetching marketplace stats for ${releaseId}:`, error)
    return null
  }
}

async function processBatch(records: Record[]): Promise<Record[]> {
  const updatedRecords = await Promise.all(
    records.map(async (record) => {
      const [details, lowestPrice] = await Promise.all([
        fetchReleaseDetails(record.id),
        fetchLowestPrice(record.id)
      ])

      return {
        ...record,
        youtubeId: details?.videos?.[0]?.uri.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/)?.[1] || null,
        lowestPrice,
        communityRating: details?.community?.rating?.average || null,
        haves: details?.community?.have || record.haves,
        wants: details?.community?.want || record.wants,
      }
    })
  )
  
  return updatedRecords
}

async function searchDiscogsRecords(style: string): Promise<{ records: Record[], isComplete: boolean }> {
  if (!DISCOGS_TOKEN) {
    throw new Error('Discogs token is not configured')
  }

  try {
    // First, check if we have cached results
    const cacheKey = `${CACHE_KEY}_${style}`
    const now = Date.now()
    
    if (cache[cacheKey] && (now - cache[cacheKey].timestamp) < CACHE_DURATION) {
      console.log('Returning cached data for style:', style)
      return { records: cache[cacheKey].records, isComplete: true }
    }

    const response = await fetch(
      `https://api.discogs.com/database/search?style=${encodeURIComponent(style)}&format=vinyl&per_page=50`,
      {
        headers: {
          'Authorization': `Discogs token=${DISCOGS_TOKEN}`,
          'User-Agent': 'CogTurner/1.0',
        }
      }
    )

    if (!response.ok) {
      throw new Error(`Discogs API error: ${response.status}`)
    }

    const data = await response.json()
    if (!data?.results?.length) {
      throw new Error('No results found')
    }

    // Filter unique artists and create basic records
    const artistMap = new Map()
    data.results.forEach(item => {
      const artist = item.title.split(' - ')[0].trim()
      if (!artistMap.has(artist)) {
        artistMap.set(artist, createBasicRecord(item))
      }
    })

    // Get first 20 unique artists
    const basicRecords = Array.from(artistMap.values()).slice(0, 20)

    // Return basic records immediately
    return { records: basicRecords, isComplete: false }
  } catch (error) {
    console.error('Error in searchDiscogsRecords:', error)
    throw error
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const style = searchParams.get('style')
    const phase = searchParams.get('phase') || 'basic' // 'basic' or 'complete'

    if (!style) {
      return NextResponse.json(
        { error: 'Style parameter is required' }, 
        { status: 400 }
      )
    }

    const cacheKey = `${CACHE_KEY}_${style}`
    const now = Date.now()

    // Check cache
    if (cache[cacheKey] && (now - cache[cacheKey].timestamp) < CACHE_DURATION) {
      return NextResponse.json({
        records: cache[cacheKey].records,
        isComplete: true
      })
    }

    if (phase === 'basic') {
      // Return basic records quickly
      const { records, isComplete } = await searchDiscogsRecords(style)
      return NextResponse.json({ records, isComplete })
    } else {
      // Process full details in batches
      const { records: basicRecords } = await searchDiscogsRecords(style)
      const processedRecords: Record[] = []

      for (let i = 0; i < basicRecords.length; i += BATCH_SIZE) {
        const batch = basicRecords.slice(i, i + BATCH_SIZE)
        const batchResults = await processBatch(batch)
        processedRecords.push(...batchResults)
        
        if (i + BATCH_SIZE < basicRecords.length) {
          await new Promise(resolve => setTimeout(resolve, BATCH_DELAY))
        }
      }

      // Update cache with complete records
      cache[cacheKey] = {
        timestamp: now,
        records: processedRecords
      }

      return NextResponse.json({
        records: processedRecords,
        isComplete: true
      })
    }
  } catch (error) {
    console.error('Error in GET handler:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch records' }, 
      { status: 500 }
    )
  }
}