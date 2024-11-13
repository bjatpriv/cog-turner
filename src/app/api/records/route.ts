import { NextResponse } from 'next/server'
import { Record } from '@/types/records'

const DISCOGS_TOKEN = process.env.DISCOGS_TOKEN
const CACHE_KEY = 'daily_records'
const CACHE_DURATION = 24 * 60 * 60 * 1000 // 24 hours
const BATCH_SIZE = 20 // Number of records to fetch

type CacheData = {
  timestamp: number;
  records: Record[];
}

const cache: { [key: string]: CacheData } = {}

// Helper function to fetch release details including rating
async function fetchReleaseDetails(releaseId: number) {
  try {
    const response = await fetch(
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

// Updated helper function to fetch lowest price using the stats endpoint
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

    if (!response.ok) {
      console.error(`Failed to fetch marketplace stats for ${releaseId}:`, response.statusText)
      return null
    }

    const data = await response.json()
    
    // Debug log to see the structure
    console.log(`Marketplace stats for ${releaseId}:`, JSON.stringify(data, null, 2))

    // The lowest_price field contains the current lowest price
    return data.lowest_price || null
  } catch (error) {
    console.error(`Error fetching marketplace stats for ${releaseId}:`, error)
    return null
  }
}

async function searchDiscogsRecords(style: string): Promise<Record[]> {
  if (!DISCOGS_TOKEN) {
    throw new Error('Discogs token is not configured')
  }

  try {
    // Fetch initial batch with more results to ensure enough unique artists
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

    // Keep track of unique artists
    const seenArtists = new Set<string>()
    const selectedRecords: Record[] = []

    // Process records and select unique artists
    for (const item of data.results) {
      const artist = item.title.split(' - ')[0].trim()
      
      if (!seenArtists.has(artist) && selectedRecords.length < BATCH_SIZE) {
        seenArtists.add(artist)

        // Fetch additional details in parallel
        const [details, lowestPrice] = await Promise.all([
          fetchReleaseDetails(item.id),
          fetchLowestPrice(item.id)
        ])

        // Check if rating exists and is a valid number
        const rating = details?.community?.rating?.average
        const communityRating = rating && !isNaN(rating) ? rating : null

        selectedRecords.push({
          id: item.id,
          artist: artist,
          title: item.title.split(' - ')[1] || item.title,
          style: style,
          year: item.year || 0,
          image: item.cover_image || '',
          youtubeId: details?.videos?.[0]?.uri.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/)?.[1] || null,
          lowestPrice,
          discogsUrl: `https://www.discogs.com/release/${item.id}`,
          communityRating,
          haves: details?.community?.have || item.community?.have || 0,
          wants: details?.community?.want || item.community?.want || 0,
        })
      }

      if (selectedRecords.length === BATCH_SIZE) break
    }

    return selectedRecords
  } catch (error) {
    console.error('Error in searchDiscogsRecords:', error)
    throw error
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const style = searchParams.get('style')

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
      return NextResponse.json(cache[cacheKey].records)
    }

    const records = await searchDiscogsRecords(style)
    
    if (records.length === 0) {
      return NextResponse.json(
        { error: 'No records found' },
        { status: 404 }
      )
    }

    // Update cache
    cache[cacheKey] = {
      timestamp: now,
      records
    }

    return NextResponse.json(records)
  } catch (error) {
    console.error('Error in GET handler:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch records' },
      { status: 500 }
    )
  }
}