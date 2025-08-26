"use client"

import { useState } from "react"
import { Button, Card, CardContent, CardHeader, CardTitle, Icons, GainAmount } from "@wealthfolio/ui"
import type { ClosedTrade } from "../types"
import {
  format,
  startOfYear,
  endOfYear,
  eachMonthOfInterval,
  isSameMonth,
  startOfMonth,
  endOfMonth,
} from "date-fns"

interface MonthData {
  date: Date
  monthName: string
  realizedPL: number
  returnPercent: number
  tradeCount: number
  isCurrentMonth: boolean
}

interface YearData {
  year: number
  yearlyPL: number
  yearlyReturnPercent: number
  totalTrades: number
  months: MonthData[]
}

interface CalendarViewProps {
  trades: ClosedTrade[]
  selectedMonth: Date
  onMonthChange: (date: Date) => void
  currency: string
}

export function CalendarView({ trades, selectedMonth, onMonthChange, currency }: CalendarViewProps) {
  const [selectedYear, setSelectedYear] = useState(selectedMonth.getFullYear())
  const [selectedMonthData, setSelectedMonthData] = useState<MonthData | null>(null)

  // Generate yearly calendar data
  const generateYearlyCalendarData = (): YearData => {
    const yearStart = startOfYear(new Date(selectedYear, 0, 1))
    const yearEnd = endOfYear(new Date(selectedYear, 0, 1))
    const months = eachMonthOfInterval({ start: yearStart, end: yearEnd })

    const monthsData: MonthData[] = months.map((month) => {
      const monthStart = startOfMonth(month)
      const monthEnd = endOfMonth(month)
      
      const monthTrades = trades.filter((trade) => {
        const exitDate = new Date(trade.exitDate)
        return exitDate >= monthStart && exitDate <= monthEnd
      })
      
      const realizedPL = monthTrades.reduce((sum, trade) => sum + trade.realizedPL, 0)
      const totalCostBasis = monthTrades.reduce((sum, trade) => sum + trade.entryPrice * trade.quantity, 0)
      const returnPercent = totalCostBasis > 0 ? (realizedPL / totalCostBasis) * 100 : 0

      return {
        date: month,
        monthName: format(month, "MMM"),
        realizedPL,
        returnPercent,
        tradeCount: monthTrades.length,
        isCurrentMonth: isSameMonth(month, new Date()),
      }
    })

    const yearTrades = trades.filter((trade) => {
      const exitDate = new Date(trade.exitDate)
      return exitDate >= yearStart && exitDate <= yearEnd
    })
    
    const yearlyPL = yearTrades.reduce((sum, trade) => sum + trade.realizedPL, 0)
    const yearlyTotalCostBasis = yearTrades.reduce((sum, trade) => sum + trade.entryPrice * trade.quantity, 0)
    const yearlyReturnPercent = yearlyTotalCostBasis > 0 ? (yearlyPL / yearlyTotalCostBasis) * 100 : 0

    return {
      year: selectedYear,
      yearlyPL,
      yearlyReturnPercent,
      totalTrades: yearTrades.length,
      months: monthsData,
    }
  }

  const yearlyData = generateYearlyCalendarData()

  const handlePreviousYear = () => {
    setSelectedYear(prev => prev - 1)
  }

  const handleNextYear = () => {
    setSelectedYear(prev => prev + 1)
  }

  const handleMonthClick = (monthData: MonthData) => {
    if (monthData.tradeCount > 0) {
      setSelectedMonthData(monthData)
      onMonthChange(monthData.date)
    }
  }

  return (
    <div className="space-y-4 bg-gray-900 text-white rounded-lg overflow-hidden">
      {/* Calendar Header */}
      <div className="flex items-center justify-between p-6 bg-gray-800 border-b border-gray-700">
        <div className="space-y-1">
          <h3 className="text-xl font-bold text-white">{selectedYear}</h3>
          <div className="text-green-400 text-xl font-bold">
            Monthly P/L: {new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: currency,
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }).format(yearlyData.yearlyPL)}
          </div>
          <div className="text-gray-400 text-sm">
            {yearlyData.totalTrades} trades
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handlePreviousYear}
            className="bg-gray-700 border-gray-600 text-white hover:bg-gray-600"
          >
            <Icons.ChevronLeft className="h-4 w-4" />
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleNextYear}
            className="bg-gray-700 border-gray-600 text-white hover:bg-gray-600"
          >
            <Icons.ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Yearly Calendar Grid - 3 rows x 4 columns (12 months) */}
      <div className="bg-gray-800 p-6">
        <div className="grid grid-cols-4 gap-1 bg-gray-700 p-1 rounded-lg">
          {yearlyData.months.map((monthData, index) => (
            <button
              key={monthData.monthName}
              onClick={() => handleMonthClick(monthData)}
              className={`
                relative p-6 min-h-[140px] flex flex-col justify-between transition-all duration-200 rounded
                ${monthData.isCurrentMonth ? "bg-blue-900/50" : "bg-gray-800 hover:bg-gray-750"}
                ${monthData.tradeCount > 0 ? "cursor-pointer hover:shadow-lg" : "cursor-default"}
              `}
            >
              {/* Month Name */}
              <div className={`
                text-lg font-bold text-center
                ${monthData.isCurrentMonth ? "text-blue-400" : "text-white"}
              `}>
                {monthData.monthName}
              </div>

              {/* Trade Data */}
              {monthData.tradeCount > 0 ? (
                <div className="space-y-2 w-full">
                  <div className={`
                    px-3 py-2 rounded text-sm font-bold text-center
                    ${monthData.realizedPL >= 0 
                      ? "bg-green-600 text-white" 
                      : "bg-red-600 text-white"
                    }
                  `}>
                    {new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: currency,
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    }).format(monthData.realizedPL)}
                  </div>
                  <div className="text-xs text-gray-400 text-center font-medium">
                    {monthData.tradeCount} trade{monthData.tradeCount !== 1 ? "s" : ""}
                  </div>
                </div>
              ) : (
                <div></div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Month Details Modal */}
      {selectedMonthData && (
        <Card className="border-gray-700 shadow-lg bg-gray-800 text-white mx-6 mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-semibold text-white">
              {format(selectedMonthData.date, "MMMM yyyy")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-6">
              <div className="text-center">
                <div className="text-sm text-gray-400 mb-1">P/L</div>
                <div className="text-lg font-bold">
                  <GainAmount value={selectedMonthData.realizedPL} currency={currency} />
                </div>
              </div>
              <div className="text-center">
                <div className="text-sm text-gray-400 mb-1">Return %</div>
                <div className={`text-lg font-bold ${
                  selectedMonthData.returnPercent >= 0 
                    ? "text-green-400" 
                    : "text-red-400"
                }`}>
                  {selectedMonthData.returnPercent >= 0 ? '+' : ''}{selectedMonthData.returnPercent.toFixed(2)}%
                </div>
              </div>
              <div className="text-center">
                <div className="text-sm text-gray-400 mb-1">Trades</div>
                <div className="text-lg font-bold text-white">{selectedMonthData.tradeCount}</div>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setSelectedMonthData(null)}
                className="bg-gray-700 border-gray-600 text-white hover:bg-gray-600"
              >
                Close
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}