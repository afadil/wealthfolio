import { Link } from "react-router-dom";
import {
  Button,
  Icons,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Switch,
} from "@wealthfolio/ui";

interface QuoteHistoryToolbarProps {
  selectedRowCount: number;
  hasUnsavedChanges: boolean;
  dirtyCount: number;
  deletedCount: number;
  isManualDataSource: boolean;
  onAddRow: () => void;
  onDeleteSelected: () => void;
  onSave: () => void;
  onCancel: () => void;
  onChangeDataSource?: (isManual: boolean) => void;
}

export function QuoteHistoryToolbar({
  selectedRowCount,
  hasUnsavedChanges,
  dirtyCount,
  deletedCount,
  isManualDataSource,
  onAddRow,
  onDeleteSelected,
  onSave,
  onCancel,
  onChangeDataSource,
}: QuoteHistoryToolbarProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        {isManualDataSource && (
          <>
            <Button variant="default" size="sm" onClick={onAddRow}>
              <Icons.Plus className="mr-2 h-4 w-4" />
              Add Quote
            </Button>

            <Button asChild variant="outline" size="sm">
              <Link to="/settings/market-data/import" className="flex items-center gap-2">
                <Icons.Import className="h-4 w-4" />
                Import Quotes
              </Link>
            </Button>
          </>
        )}

        {selectedRowCount > 0 && isManualDataSource && (
          <Button variant="outline" size="sm" onClick={onDeleteSelected}>
            <Icons.Trash className="mr-2 h-4 w-4" />
            Delete ({selectedRowCount})
          </Button>
        )}
      </div>

      <div className="flex items-center gap-4">
        {/* Manual tracking toggle */}
        <Popover>
          <PopoverTrigger asChild>
            <div className="flex cursor-pointer items-center space-x-2">
              <Switch id="manual-tracking" checked={isManualDataSource} />
              <Label htmlFor="manual-tracking" className="cursor-pointer">
                Manual tracking
              </Label>
            </div>
          </PopoverTrigger>
          <PopoverContent className="w-[360px] p-4">
            <div className="space-y-4">
              <h4 className="font-medium">Change Tracking Mode</h4>
              {isManualDataSource ? (
                <>
                  <p className="text-muted-foreground text-sm">
                    Switching to automatic tracking will enable data fetching from Market Data
                    Provider. Please note that this will override any manually entered quotes on
                    the next sync.
                  </p>
                  <p className="text-sm font-medium text-yellow-600 dark:text-yellow-400">
                    Your manually entered historical data may be lost.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-muted-foreground text-sm">
                    Switching to manual tracking will stop automatic data fetching from Market Data
                    Provider. You'll need to enter and maintain price data manually.
                  </p>
                  <p className="text-sm font-medium text-yellow-600 dark:text-yellow-400">
                    Automatic price updates will be disabled.
                  </p>
                </>
              )}
              <div className="flex justify-end space-x-2">
                <Button variant="ghost" size="sm">
                  Cancel
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => onChangeDataSource?.(!isManualDataSource)}
                >
                  Confirm Change
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Save/Cancel buttons */}
        {hasUnsavedChanges && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-sm">
              {dirtyCount > 0 && `${dirtyCount} modified`}
              {dirtyCount > 0 && deletedCount > 0 && ", "}
              {deletedCount > 0 && `${deletedCount} to delete`}
            </span>
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button variant="default" size="sm" onClick={onSave}>
              <Icons.Save className="mr-2 h-4 w-4" />
              Save Changes
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
