import { NextResponse } from 'next/server'
import { Record } from '@/types/records'

const DISCOGS_TOKEN = process.env.DISCOGS_TOKEN
const CACHE_KEY = 'daily_records'
const CACHE_DURATION = 24 * 60 * 60 * 1000 // 24 hours

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

async function fetchReleaseDetails(releaseId: number): Promise<DiscogsRelease | null> {
  const response = await fetch(
    `https://api.discogs.com/releases/${releaseId}`,
    {
      headers: {
        'Authorization': `Discogs token=${DISCOGS_TOKEN}`,
        'User-Agent': 'CogTurner/1.0',
      }
    }
  )

  if (!response.ok) {
    console.error(`Failed to fetch release details for ${releaseId}:`, response.statusText)
    return null
  }

  return response.json()
}

async function fetchMarketplaceListings(releaseId: number): Promise<number | null> {
  try {
    const response = await fetch(
      `https://api.discogs.com/marketplace/listings/release/${releaseId}?sort=price&sort_order=asc&limit=1`,
      {
        headers: {
          'Authorization': `Discogs token=${DISCOGS_TOKEN}`,
          'User-Agent': 'CogTurner/1.0',
        }
      }
    )

    if (!response.ok) {
      console.error(`Failed to fetch marketplace listings for ${releaseId}:`, response.statusText)
      return null
    }

    const data = await response.json()
    // Get the price from the first (cheapest) listing if available
    if (data.listings && data.listings.length > 0) {
      return data.listings[0].price.value
    }
    return null
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
  console.log('Fetching from Discogs:', url)

  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Discogs token=${DISCOGS_TOKEN}`,
        'User-Agent': 'CogTurner/1.0',
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Discogs API error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      })
      throw new Error(`Discogs API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    
    if (!data.results || !Array.isArray(data.results)) {
      console.error('Unexpected Discogs response:', data)
      throw new Error('Invalid response from Discogs')
    }

    // Randomly select exactly 20 records from the results
    const shuffled = data.results
      .sort(() => 0.5 - Math.random())
      .slice(0, 20)

    // Fetch detailed information for each record
    const recordsWithDetails = await Promise.all(
      shuffled.map(async (item: DiscogsRelease) => {
        // Fetch both release details and marketplace listings in parallel
        const [details, lowestPrice] = await Promise.all([
          fetchReleaseDetails(item.id),
          fetchMarketplaceListings(item.id)
        ])
        
        return {
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
        }
      })
    )

    return recordsWithDetails
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
      return NextResponse.json({ error: 'Style parameter is required' }, { status: 400 })
    }

    const cacheKey = `${CACHE_KEY}_${style}`
    const now = Date.now()

    // Check cache
    if (cache[cacheKey] && (now - cache[cacheKey].timestamp) < CACHE_DURATION) {
      console.log('Returning cached data for style:', style)
      return NextResponse.json(cache[cacheKey].records)
    }

    console.log('Fetching new data for style:', style)
    const records = await searchDiscogsRecords(style)
    
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