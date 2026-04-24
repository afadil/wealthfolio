import { Card, CardContent, CardHeader, Skeleton } from "@wealthfolio/ui";

export function RetirementDashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ── Main column ── */}
        <div className="space-y-6 lg:col-span-2">
          {/* Verdict hero */}
          <Card className="overflow-hidden">
            <CardContent className="px-7 py-6">
              <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
                <Skeleton className="h-5 w-24 rounded-full" />
                <Skeleton className="h-8 w-44 rounded-md" />
              </div>
              <Skeleton className="mb-2.5 h-8 w-[85%] rounded-md" />
              <Skeleton className="mb-6 h-8 w-[60%] rounded-md" />
              <Skeleton className="mb-5 h-3 w-full rounded-full" />
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-3 w-16 rounded" />
                    <Skeleton className="h-5 w-20 rounded" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Projection chart */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1.5">
                  <Skeleton className="h-3 w-40 rounded" />
                  <Skeleton className="h-4 w-32 rounded" />
                </div>
                <div className="flex gap-3">
                  <Skeleton className="h-3 w-20 rounded" />
                  <Skeleton className="h-3 w-20 rounded" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-2 sm:px-6">
              <Skeleton className="h-64 w-full rounded-md" />
            </CardContent>
          </Card>

          {/* Milestone strip */}
          <Card className="p-0">
            <div className="grid grid-cols-2 divide-x divide-y sm:grid-cols-4 sm:divide-y-0">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2 p-4">
                  <Skeleton className="h-3 w-16 rounded" />
                  <Skeleton className="h-5 w-20 rounded" />
                  <Skeleton className="h-3 w-24 rounded" />
                </div>
              ))}
            </div>
          </Card>

          {/* Coverage */}
          <Card>
            <CardHeader className="pb-2">
              <div className="space-y-1.5">
                <Skeleton className="h-3 w-32 rounded" />
                <Skeleton className="h-4 w-48 rounded" />
              </div>
            </CardHeader>
            <CardContent className="space-y-5 px-2 sm:px-6">
              <Skeleton className="h-56 w-full rounded-md" />
              <Skeleton className="h-3 w-full rounded-full" />
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center justify-between gap-3">
                      <Skeleton className="h-3 w-24 rounded" />
                      <Skeleton className="h-3 w-16 rounded" />
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center justify-between gap-3">
                      <Skeleton className="h-3 w-24 rounded" />
                      <Skeleton className="h-3 w-16 rounded" />
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Year-by-year snapshot */}
          <Card>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-40 rounded" />
            </CardHeader>
            <CardContent className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-3 w-10 rounded" />
                  <Skeleton className="h-3 flex-1 rounded" />
                  <Skeleton className="h-3 w-16 rounded" />
                  <Skeleton className="h-3 w-16 rounded" />
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Disclaimer */}
          <Card>
            <CardContent className="space-y-2 py-5">
              <Skeleton className="h-3 w-1/3 rounded" />
              <Skeleton className="h-3 w-full rounded" />
              <Skeleton className="h-3 w-[90%] rounded" />
            </CardContent>
          </Card>
        </div>

        {/* ── Sidebar ── */}
        <div className="space-y-4 lg:col-span-1 lg:self-start">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <div className="space-y-1.5">
                  <Skeleton className="h-3 w-20 rounded" />
                  <Skeleton className="h-4 w-32 rounded" />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <Skeleton className="h-3 w-24 rounded" />
                  <Skeleton className="h-3 w-16 rounded" />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Skeleton className="h-3 w-28 rounded" />
                  <Skeleton className="h-3 w-20 rounded" />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Skeleton className="h-3 w-20 rounded" />
                  <Skeleton className="h-3 w-14 rounded" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
