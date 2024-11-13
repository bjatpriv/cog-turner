import { NextResponse } from 'next/server'
import { Record } from '@/types/records'

const DISCOGS_TOKEN = process.env.DISCOGS_TOKEN
const CACHE_KEY = 'daily_records'
const CACHE_DURATION = 24 * 60 * 60 * 1000 // 24 hours

type CacheData = {
  timestamp: number;
  records: Record[];
}

let cache: { [key: string]: CacheData } = {}

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

    // Randomly select 20 records from the results
    const shuffled = data.results.sort(() => 0.5 - Math.random())
    const selected = shuffled.slice(0, 20)

    // Transform the data to match our Record type
    return selected.map((item: any) => ({
      id: item.id,
      artist: item.title.split(' - ')[0],
      title: item.title.split(' - ')[1] || item.title,
      style: style,
      year: item.year || 0,
      image: item.cover_image || '',
      youtubeId: null,
      lowestPrice: null,
      discogsUrl: `https://www.discogs.com/release/${item.id}`,
      communityRating: item.community?.rating?.average || 0,
      haves: item.community?.have || 0,
      wants: item.community?.want || 0,
    }))
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