import React from "react"
import ReactDOM from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import DashboardPage from "./pages/dashboard-page"

// Mock addon context for development/preview
const mockContext = {
  api: {
    logger: {
      info: (msg: string) => console.log(`[INFO] ${msg}`),
      error: (msg: string) => console.error(`[ERROR] ${msg}`),
      warn: (msg: string) => console.warn(`[WARN] ${msg}`),
      debug: (msg: string) => console.debug(`[DEBUG] ${msg}`),
      trace: (msg: string) => console.trace(`[TRACE] ${msg}`),
    },
    activities: {
      getAll: async () => {
        // Mock trading activities data
        return [
          {
            id: "1",
            activityType: "BUY",
            date: "2024-01-15",
            quantity: 100,
            unitPrice: 150.5,
            currency: "USD",
            fee: 9.99,
            accountId: "acc1",
            accountName: "Trading Account",
            assetSymbol: "AAPL",
            assetName: "Apple Inc.",
            amount: 15050,
            isDraft: false,
            createdAt: "2024-01-15",
            updatedAt: "2024-01-15",
            symbolProfileId: "aapl-profile",
          },
          {
            id: "2",
            activityType: "SELL",
            date: "2024-01-20",
            quantity: 100,
            unitPrice: 165.75,
            currency: "USD",
            fee: 9.99,
            accountId: "acc1",
            accountName: "Trading Account",
            assetSymbol: "AAPL",
            assetName: "Apple Inc.",
            amount: 16575,
            isDraft: false,
            createdAt: "2024-01-20",
            updatedAt: "2024-01-20",
            symbolProfileId: "aapl-profile",
          },
          {
            id: "3",
            activityType: "BUY",
            date: "2024-02-01",
            quantity: 50,
            unitPrice: 280.25,
            currency: "USD",
            fee: 9.99,
            accountId: "acc1",
            accountName: "Trading Account",
            assetSymbol: "MSFT",
            assetName: "Microsoft Corporation",
            amount: 14012.5,
            isDraft: false,
            createdAt: "2024-02-01",
            updatedAt: "2024-02-01",
            symbolProfileId: "msft-profile",
          },
        ]
      },
    },
    secrets: {
      get: async (key: string) => {
        // Mock preferences storage
        if (key === "swingfolio_preferences") {
          return JSON.stringify({
            selectedActivityIds: ["1", "2", "3"],
            includeSwingTag: true,
            selectedAccounts: [],
            lotMatchingMethod: "FIFO",
            defaultDateRange: "YTD",
            includeFees: true,
            includeDividends: false,
            calendarColorThresholds: {
              positive: { light: 0.5, medium: 2.0, dark: 5.0 },
              negative: { light: -0.5, medium: -2.0, dark: -5.0 },
            },
          })
        }
        return null
      },
      set: async (key: string, value: string) => {
        console.log(`Setting ${key}:`, value)
      },
      delete: async (key: string) => {
        console.log(`Deleting ${key}`)
      },
    },
    navigation: {
      navigate: async (route: string) => {
        console.log(`Navigate to: ${route}`)
      },
    },
    query: {
      getClient: () => new QueryClient(),
      invalidateQueries: (key: string | string[]) => {
        console.log(`Invalidate queries: ${key}`)
      },
      refetchQueries: (key: string | string[]) => {
        console.log(`Refetch queries: ${key}`)
      },
    },
  },
} as any

// Create a query client for the demo
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
})

function DevPreview() {
  return (
    <QueryClientProvider client={queryClient}>
      <div style={{ minHeight: "100vh", padding: "2rem", background: "#f8fafc" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <div style={{ marginBottom: "2rem", textAlign: "center" }}>
            <h1 style={{ fontSize: "2rem", fontWeight: "bold", marginBottom: "0.5rem", color: "#1e293b" }}>
              Swingfolio Addon Preview
            </h1>
            <p style={{ color: "#64748b" }}>
              Development preview of the Swingfolio addon for Wealthfolio with mock data
            </p>
          </div>
          <DashboardPage ctx={mockContext} />
        </div>
      </div>
    </QueryClientProvider>
  )
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <DevPreview />
  </React.StrictMode>,
)
