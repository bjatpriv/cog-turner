import { NextResponse } from 'next/server'
import { Record } from '@/types/records'

const DISCOGS_TOKEN = process.env.DISCOGS_TOKEN
const CACHE_KEY = 'daily_records'
const CACHE_DURATION = 24 * 60 * 60 * 1000 // 24 hours
const RATE_LIMIT_DELAY = 1000 // 1 second delay between requests
const MAX_RETRIES = 5 // Maximum number of retries for rate limiting

type CacheData = {
  timestamp: number;
  records: Record[];
}

interface DiscogsRelease {
  id: number;
  title: string;
  year: number;
  cover_image: string;
  videos?: Array<{
    uri: string;
  }>;
  community?: {
    rating?: {
      average: number;
    };
    have: number;
    want: number;
  };
}

const cache: { [key: string]: CacheData } = {}

// Helper function to add delay between requests
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// Helper function to safely parse JSON
async function safeJsonParse(response: Response) {
  try {
    return await response.json()
  } catch (error) {
    console.error('Failed to parse JSON response:', error)
    return null
  }
}

// Helper function to handle rate-limited requests with retry
async function fetchWithRetry(url: string, options: RequestInit, retries = 0): Promise<Response> {
  try {
    const response = await fetch(url, options)
    
    if (response.status === 429) { // Rate limit reached
      if (retries < MAX_RETRIES) {
        // Wait longer before retrying
        const waitTime = (retries + 1) * RATE_LIMIT_DELAY
        console.log(`Rate limited, waiting ${waitTime}ms before retry ${retries + 1}`)
        await delay(waitTime)
        return fetchWithRetry(url, options, retries + 1)
      } else {
        throw new Error('Rate limit exceeded')
      }
    }

    return response
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Network error: ${error.message}`)
    }
    throw new Error('Unknown network error')
  }
}

async function fetchReleaseDetails(releaseId: number): Promise<DiscogsRelease | null> {
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

    if (!response.ok) {
      return null
    }

    const data = await safeJsonParse(response)
    if (!data) {
      return null
    }

    return data
  } catch (error) {
    console.error(`Error fetching release details for ${releaseId}:`, error)
    return null
  }
}

async function fetchMarketplaceListings(releaseId: number): Promise<number | null> {
  try {
    const response = await fetchWithRetry(
      `https://api.discogs.com/marketplace/listings/release/${releaseId}?sort=price&sort_order=asc&limit=1`,
      {
        headers: {
          'Authorization': `Discogs token=${DISCOGS_TOKEN}`,
          'User-Agent': 'CogTurner/1.0',
        }
      }
    )

    if (!response.ok) {
      return null
    }

    const data = await safeJsonParse(response)
    if (!data?.listings?.length) {
      return null
    }

    return data.listings[0].price.value || null
  } catch (error) {
    console.error(`Error fetching marketplace listings for ${releaseId}:`, error)
    return null
  }
}

async function searchDiscogsRecords(style: string): Promise<Record[]> {
  if (!DISCOGS_TOKEN) {
    throw new Error('Discogs token is not configured')
  }

  const url = `https://api.discogs.com/database/search?style=${encodeURIComponent(style)}&format=vinyl&per_page=100`

  try {
    const response = await fetchWithRetry(url, {
      headers: {
        'Authorization': `Discogs token=${DISCOGS_TOKEN}`,
        'User-Agent': 'CogTurner/1.0',
      }
    })

    if (!response.ok) {
      throw new Error(`Discogs API error: ${response.status}`)
    }

    const data = await safeJsonParse(response)
    if (!data?.results?.length) {
      throw new Error('No results found')
    }

    // Randomly select exactly 20 records
    const shuffled = data.results
      .sort(() => 0.5 - Math.random())
      .slice(0, 20)

    // Process records sequentially
    const recordsWithDetails = []
    for (const item of shuffled) {
      await delay(RATE_LIMIT_DELAY)

      const [details, lowestPrice] = await Promise.all([
        fetchReleaseDetails(item.id),
        fetchMarketplaceListings(item.id)
      ])
      
      recordsWithDetails.push({
        id: item.id,
        artist: item.title.split(' - ')[0],
        title: item.title.split(' - ')[1] || item.title,
        style: style,
        year: item.year || 0,
        image: item.cover_image || '',
        youtubeId: details?.videos?.[0]?.uri.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/)?.[1] || null,
        lowestPrice,
        discogsUrl: `https://www.discogs.com/release/${item.id}`,
        communityRating: details?.community?.rating?.average || 0,
        haves: details?.community?.have || item.community?.have || 0,
        wants: details?.community?.want || item.community?.want || 0,
      })
    }

    return recordsWithDetails
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    throw new Error(`Failed to fetch records: ${message}`)
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const style = searchParams.get('style')

    if (!style) {
      return NextResponse.json({ error: 'Style parameter is required' }, { status: 400 })
    }

    const cacheKey = `${CACHE_KEY}_${style}`
    const now = Date.now()

    if (cache[cacheKey] && (now - cache[cacheKey].timestamp) < CACHE_DURATION) {
      return NextResponse.json(cache[cacheKey].records)
    }

    const records = await searchDiscogsRecords(style)
    
    cache[cacheKey] = {
      timestamp: now,
      records
    }

    return NextResponse.json(records)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}