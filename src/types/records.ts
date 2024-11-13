export interface Record {
  id: number;
  artist: string;
  title: string;
  style: string;
  year: number;
  image: string;
  youtubeId: string | null;
  lowestPrice: number | null;
  discogsUrl: string;
  communityRating: number | null;
  haves: number;
  wants: number;
}

export interface DiscogsResponse {
  results: Array<{
    id: number;
    title: string;
    year: number;
    cover_image: string;
    community?: {
      have?: number;
      want?: number;
      rating?: {
        average: number;
      };
    };
  }>;
} 