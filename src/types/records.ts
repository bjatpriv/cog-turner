export type Record = {
  id: number;
  artist: string;
  title: string;
  style: string;
  year: number;
  image: string;
  youtubeId: string | null;
  lowestPrice: number | null;
  discogsUrl: string;
  communityRating: number;
  haves: number;
  wants: number;
} 