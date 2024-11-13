'use client'

import React from 'react'
import { useState } from 'react'
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Youtube, ChevronLeft, ChevronRight } from "lucide-react"
import Image from 'next/image'
import Link from 'next/link'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useRecords } from '@/hooks/useRecords'

// Define available styles
const electronicStyles = [
  'House', 'Techno', 'Experimental', 'Ambient', 'Synth-pop', 'Electro', 
  'Trance', 'Downtempo', 'Disco', 'Deep House', 'Tech House'
]

export default function MusicRecordsGrid() {
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null)
  const [selectedRecordIndex, setSelectedRecordIndex] = useState<number | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  
  const { records, isLoading, error } = useRecords(selectedStyle)

  const handleCardClick = (index: number) => {
    setSelectedRecordIndex(index)
    setIsModalOpen(true)
  }

  const handlePrevious = () => {
    setSelectedRecordIndex((prev) => (prev === null || prev === 0) ? records.length - 1 : prev - 1)
  }

  const handleNext = () => {
    setSelectedRecordIndex((prev) => (prev === null || prev === records.length - 1) ? 0 : prev + 1)
  }

  // Helper function to format price
  const formatPrice = (price: number | null): string => {
    if (price === null || typeof price !== 'number') return 'N/A'
    return `€${price.toFixed(2)}`
  }

  // Helper function to format rating
  const formatRating = (rating: number | null): string => {
    if (rating === null || typeof rating !== 'number') return 'N/A'
    return `${rating.toFixed(1)}/5`
  }

  return (
    <div className="container mx-auto p-4 pb-12">
      <header className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Cog Turner</h1>
        <p className="text-lg text-gray-600 mb-1">
          A dispatch of records you may never have heard before, refreshed daily.
        </p>
        <p className="text-xs text-gray-400 italic">
          <Link 
            href="https://www.discogs.com" 
            target="_blank" 
            rel="noopener noreferrer"
            className="hover:underline"
          >
            Data provided by Discogs
          </Link>
        </p>
      </header>

      <div className="w-[180px] mb-4">
        <Select 
          onValueChange={(value) => setSelectedStyle(value)} 
          value={selectedStyle || undefined}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select Style" />
          </SelectTrigger>
          <SelectContent>
            {electronicStyles.map((style) => (
              <SelectItem key={style} value={style}>
                {style}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading && (
        <div className="text-center py-8">
          <p className="text-gray-500">Loading records...</p>
        </div>
      )}

      {error && (
        <div className="text-center py-8">
          <p className="text-red-500">{error}</p>
        </div>
      )}

      {!selectedStyle && (
        <p className="text-center text-gray-500 mt-8">Please select a style to view records.</p>
      )}

      {selectedStyle && !isLoading && !error && records.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {records.map((record, index) => (
            <Card 
              key={record.id} 
              className="overflow-hidden group cursor-pointer"
              onClick={() => handleCardClick(index)}
            >
              <CardContent className="p-0 relative">
                <Image
                  src={record.image}
                  alt={record.title}
                  width={200}
                  height={200}
                  className="w-full h-auto aspect-square object-cover"
                />
                <div className="p-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h2 className="text-xs font-semibold truncate">{record.artist}</h2>
                      <p className="text-xs text-gray-600 truncate">{record.title}</p>
                      <p className="text-[10px] text-gray-500">
                        {record.year} • {formatRating(record.communityRating)}
                      </p>
                      <p className="text-[10px] text-gray-500">
                        From {formatPrice(record.lowestPrice)}
                      </p>
                    </div>
                    {record.youtubeId && (
                      <Youtube className="w-6 h-6 text-black" />
                    )}
                  </div>
                </div>
                <div className="absolute inset-0 bg-black opacity-0 group-hover:opacity-10 transition-opacity" aria-hidden="true" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[450px]">
          {selectedRecordIndex !== null && records[selectedRecordIndex] && (
            <div className="relative">
              <Button
                variant="outline"
                size="icon"
                className="absolute left-0 top-1/2 -translate-y-1/2 z-10"
                onClick={handlePrevious}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="absolute right-0 top-1/2 -translate-y-1/2 z-10"
                onClick={handleNext}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <div className="p-1">
                <div className="flex flex-col gap-6">
                  <div>
                    <DialogTitle className="text-xl font-bold">{records[selectedRecordIndex].title}</DialogTitle>
                    <DialogDescription className="text-gray-500 mt-1">{records[selectedRecordIndex].artist}</DialogDescription>
                  </div>
                  <div className="flex gap-6">
                    <Image
                      src={records[selectedRecordIndex].image}
                      alt={records[selectedRecordIndex].title}
                      width={150}
                      height={150}
                      className="w-[150px] h-[150px] rounded-lg"
                    />
                    <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      <div>
                        <p className="font-semibold text-gray-500">Style:</p>
                        <p>{records[selectedRecordIndex].style}</p>
                      </div>
                      <div>
                        <p className="font-semibold text-gray-500">Year:</p>
                        <p>{records[selectedRecordIndex].year}</p>
                      </div>
                      <div>
                        <p className="font-semibold text-gray-500">Price:</p>
                        <p>{formatPrice(records[selectedRecordIndex].lowestPrice)}</p>
                      </div>
                      <div>
                        <p className="font-semibold text-gray-500">Rating:</p>
                        <p>{formatRating(records[selectedRecordIndex].communityRating)}</p>
                      </div>
                      <div>
                        <p className="font-semibold text-gray-500">Haves:</p>
                        <p>{records[selectedRecordIndex].haves}</p>
                      </div>
                      <div>
                        <p className="font-semibold text-gray-500">Wants:</p>
                        <p>{records[selectedRecordIndex].wants}</p>
                      </div>
                    </div>
                  </div>
                  {records[selectedRecordIndex].youtubeId && (
                    <div className="w-full max-w-[400px] ml-0 aspect-video bg-muted rounded-lg flex items-center justify-center">
                      <iframe
                        width="100%"
                        height="100%"
                        src={`https://www.youtube.com/embed/${records[selectedRecordIndex].youtubeId}`}
                        title={`YouTube video for ${records[selectedRecordIndex].title}`}
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      ></iframe>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button className="flex-1" variant="default" asChild>
                      <Link href={records[selectedRecordIndex].discogsUrl} target="_blank" rel="noopener noreferrer">
                        View on Discogs
                      </Link>
                    </Button>
                    {records[selectedRecordIndex].youtubeId && (
                      <Button className="flex-1" variant="default" asChild>
                        <Link href={`https://www.youtube.com/watch?v=${records[selectedRecordIndex].youtubeId}`} target="_blank" rel="noopener noreferrer">
                          Watch on YouTube
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <footer className="mt-8 text-center text-sm text-gray-500">
        <p>
          This application uses Discogs&apos; API but is not affiliated with, sponsored or endorsed by Discogs. &apos;Discogs&apos; is a trademark of Zink Media, LLC.
        </p>
      </footer>
    </div>
  )
}
