import { useEffect, useState } from "react";

import { isDesktop, openUrlInBrowser } from "@/adapters";
import { Button } from "@wealthfolio/ui/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@wealthfolio/ui/components/ui/carousel";
import { toast } from "@wealthfolio/ui/components/ui/use-toast";
import { useCheckUpdateOnStartup, useClearUpdate, useInstallUpdate } from "@/hooks/use-updater";
import { Icons } from "@wealthfolio/ui";

function formatReleaseDate(pubDate?: string) {
  if (!pubDate) {
    return null;
  }

  const parsed = new Date(pubDate);
  if (Number.isNaN(parsed.getTime())) {
    return pubDate;
  }

  return parsed.toLocaleString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function UpdateDialog() {
  const { data: updateInfo } = useCheckUpdateOnStartup();
  const clearUpdate = useClearUpdate();
  const [isOpen, setIsOpen] = useState(false);
  const installMutation = useInstallUpdate();
  const isDesktopEnv = isDesktop;

  const screenshots = updateInfo?.screenshots ?? [];

  useEffect(() => {
    if (updateInfo) {
      setIsOpen(true);
    }
  }, [updateInfo]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen || installMutation.isPending) return;
      if (e.key === "Escape") {
        setIsOpen(false);
        clearUpdate();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, installMutation.isPending, clearUpdate]);

  const handleClose = () => {
    if (installMutation.isPending) return;
    setIsOpen(false);
    clearUpdate();
  };

  const handleInstall = () => {
    // Close dialog - backend will handle everything with native dialogs
    setIsOpen(false);
    clearUpdate();
    installMutation.mutate();
  };

  const handleOpenStore = async () => {
    if (!updateInfo?.storeUrl) return;

    try {
      await openUrlInBrowser(updateInfo.storeUrl);
    } catch (error) {
      toast({
        title: "Unable to open the link",
        description: "Try opening the link manually.",
        variant: "destructive",
      });
      console.error("Failed to open store for update", error);
    }
  };

  const handleOpenChangelog = async () => {
    if (!updateInfo?.changelogUrl) return;

    try {
      await openUrlInBrowser(updateInfo.changelogUrl);
    } catch (error) {
      toast({
        title: "Unable to open changelog",
        description: "Try opening the changelog manually in your browser.",
        variant: "destructive",
      });
      console.error("Failed to open changelog", error);
    }
  };

  const releaseDate = formatReleaseDate(updateInfo?.pubDate);

  if (!isOpen || !updateInfo) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="bg-background/80 animate-in fade-in absolute inset-0 backdrop-blur-sm duration-300"
        onClick={handleClose}
      />

      {/* Dialog */}
      <div className="border-border bg-card animate-in zoom-in-95 fade-in relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border shadow-2xl duration-300">
        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto">
          {/* Header */}
          <div className="relative px-6 pt-6 pb-4">
            <button
              onClick={handleClose}
              className="bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground absolute top-4 right-4 rounded-full p-2 transition-all duration-200 hover:scale-105"
              aria-label="Close dialog"
            >
              <Icons.Close className="h-4 w-4" />
            </button>

            {/* Version badge */}
            <div className="mb-4 flex items-center gap-3">
              <span className="bg-primary/10 text-primary inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-sm font-medium">
                <Icons.Sparkles className="h-3.5 w-3.5" />v{updateInfo.latestVersion}
              </span>
              {releaseDate && <span className="text-muted-foreground text-sm">{releaseDate}</span>}
            </div>

            {/* Title */}
            <div className="mb-3 space-y-3">
              <h2 className="text-foreground text-2xl font-bold text-balance">
                New Update Available
              </h2>
            </div>

            {/* Description */}
            {updateInfo.notes && (
              <p className="text-muted-foreground text-sm leading-relaxed text-pretty">
                {updateInfo.notes}
              </p>
            )}
          </div>

          {/* Screenshot Carousel */}
          {screenshots.length > 0 && (
            <div className="px-6 pb-4">
              <Carousel className="w-full">
                <CarouselContent>
                  {screenshots.map((screenshotUrl, index) => (
                    <CarouselItem key={index}>
                      <div className="border-border bg-secondary/30 relative aspect-video overflow-hidden rounded-xl border">
                        <img
                          src={screenshotUrl}
                          alt={`Screenshot ${index + 1}`}
                          className="object-cover"
                        />
                      </div>
                    </CarouselItem>
                  ))}
                </CarouselContent>
                {screenshots.length > 1 && (
                  <>
                    <CarouselPrevious className="left-3" />
                    <CarouselNext className="right-3" />
                  </>
                )}
              </Carousel>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="border-border bg-secondary/30 flex shrink-0 items-center justify-between gap-4 border-t px-6 py-4">
          <Button variant="ghost" onClick={handleClose}>
            Remind me later
          </Button>
          <div className="flex items-center gap-3">
            {updateInfo.changelogUrl && (
              <Button variant="outline" onClick={handleOpenChangelog}>
                View Changelog
              </Button>
            )}
            {isDesktopEnv ? (
              // Desktop: Show App Store or direct install button
              updateInfo.isAppStoreBuild ? (
                <Button onClick={handleOpenStore} disabled={!updateInfo.storeUrl}>
                  Open App Store
                </Button>
              ) : (
                <Button onClick={handleInstall}>
                  <Icons.Download className="mr-2 h-4 w-4" />
                  Update Now
                </Button>
              )
            ) : (
              // Web: Show download link (opens GitHub releases or Docker instructions)
              <Button onClick={handleOpenStore} disabled={!updateInfo.storeUrl}>
                <Icons.ExternalLink className="mr-2 h-4 w-4" />
                View Release
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
