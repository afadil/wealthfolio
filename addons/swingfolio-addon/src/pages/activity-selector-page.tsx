import React, { useState, useMemo } from "react"
import {
  ApplicationShell,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Checkbox,
  Badge,
  Skeleton,
  Icons,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wealthfolio/ui"
import type { AddonContext } from "@wealthfolio/addon-sdk"
import { useSwingActivities } from "../hooks/use-swing-activities"
import { useSwingPreferences } from "../hooks/use-swing-preferences"
import { format } from "date-fns"

interface ActivitySelectorPageProps {
  ctx: AddonContext
}

export default function ActivitySelectorPage({ ctx }: ActivitySelectorPageProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedAccount, setSelectedAccount] = useState<string>("all")
  const [selectedType, setSelectedType] = useState<string>("all")
  const [selectedActivities, setSelectedActivities] = useState<Set<string>>(new Set())

  const { data: activities, isLoading, error } = useSwingActivities(ctx)
  const { preferences, updatePreferences, isUpdating } = useSwingPreferences(ctx)

  // Initialize selected activities from preferences
  React.useEffect(() => {
    if (preferences.selectedActivityIds.length > 0) {
      setSelectedActivities(new Set(preferences.selectedActivityIds))
    }
  }, [preferences.selectedActivityIds])

  // Get unique accounts for filter
  const accounts = useMemo(() => {
    if (!activities) return []
    const uniqueAccounts = Array.from(new Set(activities.map((a) => a.accountName)))
    return uniqueAccounts.map((name) => ({
      name,
      id: activities.find((a) => a.accountName === name)?.accountId || "",
    }))
  }, [activities])

  // Filter activities
  const filteredActivities = useMemo(() => {
    if (!activities) return []

    return activities.filter((activity) => {
      const matchesSearch =
        searchTerm === "" ||
        activity.assetSymbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (activity.assetName?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false)

      const matchesAccount = selectedAccount === "all" || activity.accountName === selectedAccount
      const matchesType = selectedType === "all" || activity.activityType === selectedType

      return matchesSearch && matchesAccount && matchesType
    })
  }, [activities, searchTerm, selectedAccount, selectedType])

  const handleToggleActivity = (activityId: string) => {
    const newSelected = new Set(selectedActivities)
    if (newSelected.has(activityId)) {
      newSelected.delete(activityId)
    } else {
      newSelected.add(activityId)
    }
    setSelectedActivities(newSelected)
  }

  const handleSelectAll = () => {
    const allIds = filteredActivities.map((a) => a.id)
    setSelectedActivities(new Set([...selectedActivities, ...allIds]))
  }

  const handleDeselectAll = () => {
    const filteredIds = new Set(filteredActivities.map((a) => a.id))
    const newSelected = new Set([...selectedActivities].filter((id) => !filteredIds.has(id)))
    setSelectedActivities(newSelected)
  }

  const handleToggleSwingTag = (enabled: boolean) => {
    updatePreferences({ includeSwingTag: enabled })
  }

  const handleSaveSelection = () => {
    updatePreferences({
      selectedActivityIds: Array.from(selectedActivities),
    })
    ctx.api.navigation.navigate("/addons/swingfolio")
  }

  const selectedCount = selectedActivities.size
  const filteredSelectedCount = filteredActivities.filter((a) => selectedActivities.has(a.id)).length

  if (isLoading) {
    return <ActivitySelectorSkeleton />
  }

  if (error || !activities) {
    return (
      <ApplicationShell className="p-6">
        <div className="flex h-[calc(100vh-200px)] items-center justify-center">
          <div className="text-center">
            <Icons.AlertCircle className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Failed to load activities</h3>
            <p className="text-muted-foreground mb-4">{error?.message || "Unable to load trading activities"}</p>
            <Button onClick={() => ctx.api.navigation.navigate("/addons/swingfolio")}>Back to Dashboard</Button>
          </div>
        </div>
      </ApplicationShell>
    )
  }

  return (
    <ApplicationShell className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Select Activities</h1>
          <p className="text-muted-foreground">
            Choose which trading activities to include in your swing portfolio analysis
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => ctx.api.navigation.navigate("/addons/swingfolio")}>
            <Icons.ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
          <Button onClick={handleSaveSelection} disabled={isUpdating}>
            {isUpdating ? (
              <Icons.Spinner className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Icons.Save className="h-4 w-4 mr-2" />
            )}
            Save Selection
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        {/* Auto-selection Options */}
        <Card>
          <CardHeader>
            <CardTitle>Auto-Selection Options</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2">
              <Checkbox id="swing-tag" checked={preferences.includeSwingTag} onCheckedChange={handleToggleSwingTag} />
              <label htmlFor="swing-tag" className="text-sm font-medium">
                Automatically include activities tagged with "Swing"
              </label>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Activities with "swing" in their comment will be automatically included
            </p>
          </CardContent>
        </Card>

        {/* Filters and Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Manual Selection</span>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>
                  {filteredSelectedCount} of {filteredActivities.length} selected
                </span>
                <span>•</span>
                <span>{selectedCount} total selected</span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Filters */}
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <Input
                  placeholder="Search by symbol or name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="max-w-sm"
                />
              </div>
              <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="All Accounts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Accounts</SelectItem>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.name}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="BUY">Buy</SelectItem>
                  <SelectItem value="SELL">Sell</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Bulk Actions */}
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleSelectAll}>
                Select All Filtered
              </Button>
              <Button variant="outline" size="sm" onClick={handleDeselectAll}>
                Deselect All Filtered
              </Button>
            </div>

            {/* Activities Table */}
            <div className="border rounded-lg">
              <div className="max-h-[600px] overflow-auto">
                <table className="w-full">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr className="border-b">
                      <th className="text-left p-3 w-12">
                        <Checkbox
                          checked={
                            filteredActivities.length > 0 &&
                            filteredActivities.every((a) => selectedActivities.has(a.id))
                          }
                          onCheckedChange={(checked) => {
                            if (checked) {
                              handleSelectAll()
                            } else {
                              handleDeselectAll()
                            }
                          }}
                        />
                      </th>
                      <th className="text-left p-3">Date</th>
                      <th className="text-left p-3">Type</th>
                      <th className="text-left p-3">Symbol</th>
                      <th className="text-left p-3">Quantity</th>
                      <th className="text-left p-3">Price</th>
                      <th className="text-left p-3">Account</th>
                      <th className="text-left p-3">Tags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredActivities.map((activity) => (
                      <tr key={activity.id} className="border-b hover:bg-muted/25">
                        <td className="p-3">
                          <Checkbox
                            checked={selectedActivities.has(activity.id)}
                            onCheckedChange={() => handleToggleActivity(activity.id)}
                          />
                        </td>
                        <td className="p-3 text-sm">{format(new Date(activity.date), "MMM dd, yyyy")}</td>
                        <td className="p-3">
                          <Badge variant={activity.activityType === "BUY" ? "default" : "secondary"}>
                            {activity.activityType}
                          </Badge>
                        </td>
                        <td className="p-3 font-medium">
                          {activity.assetSymbol}
                          {activity.assetName && (
                            <div className="text-xs text-muted-foreground">{activity.assetName}</div>
                          )}
                        </td>
                        <td className="p-3 text-sm">{activity.quantity.toLocaleString()}</td>
                        <td className="p-3 text-sm">
                          {activity.unitPrice.toLocaleString("en-US", {
                            style: "currency",
                            currency: activity.currency,
                          })}
                        </td>
                        <td className="p-3 text-sm">{activity.accountName}</td>
                        <td className="p-3">
                          <div className="flex gap-1">
                            {activity.hasSwingTag && (
                              <Badge variant="outline" className="text-xs">
                                Swing
                              </Badge>
                            )}
                            {activity.isSelected && (
                              <Badge variant="default" className="text-xs">
                                Selected
                              </Badge>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {filteredActivities.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">No activities match your current filters</div>
            )}
          </CardContent>
        </Card>
      </div>
    </ApplicationShell>
  )
}

function ActivitySelectorSkeleton() {
  return (
    <ApplicationShell className="p-6">
      <div className="flex items-center justify-between pb-6">
        <div>
          <Skeleton className="h-8 w-[250px]" />
          <Skeleton className="mt-2 h-5 w-[400px]" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-10 w-[150px]" />
          <Skeleton className="h-10 w-[120px]" />
        </div>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-[200px]" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-5 w-[300px]" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-[150px]" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Skeleton className="h-10 flex-1 max-w-sm" />
                <Skeleton className="h-10 w-[200px]" />
                <Skeleton className="h-10 w-[150px]" />
              </div>
              <Skeleton className="h-[400px] w-full" />
            </div>
          </CardContent>
        </Card>
      </div>
    </ApplicationShell>
  )
}
