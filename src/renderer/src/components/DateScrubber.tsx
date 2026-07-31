import React, { useState, useEffect } from 'react'
import { Calendar } from 'lucide-react'

interface DateScrubberProps {
  years: number[]
  activeYear?: number
  onSelectYear: (year: number) => void
}

export default function DateScrubber({ years, activeYear, onSelectYear }: DateScrubberProps) {
  const [hoveredYear, setHoveredYear] = useState<number | null>(null)

  if (years.length === 0) return null

  const sortedYears = [...years].sort((a, b) => b - a)

  return (
    <div className="date-scrubber">
      <div className="date-scrubber-track">
        {sortedYears.map(year => (
          <div
            key={year}
            className={`date-scrubber-item ${activeYear === year ? 'active' : ''}`}
            onClick={() => onSelectYear(year)}
            onMouseEnter={() => setHoveredYear(year)}
            onMouseLeave={() => setHoveredYear(null)}
          >
            <div className="date-scrubber-dot" />

            {(hoveredYear === year || activeYear === year) && (
              <div className="date-scrubber-badge">
                {year}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
