
import {
  Button,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Icons,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  StarRatingDisplay,
} from '@wealthfolio/ui';
import { RatingDialog } from './rating-dialog';
import type { AddonStoreListing } from '@/lib/types';
import React from 'react';

interface AddonStoreCardProps {
  listing: AddonStoreListing;
  isInstalled?: boolean;
  isInstalling?: boolean;
  onInstall?: (listing: AddonStoreListing) => void;
  onTagClick?: (tag: string) => void;
  onSubmitRating?: (addonId: string, rating: number, review?: string) => Promise<void>;
  isRatingSubmitting?: boolean;
}

export function AddonStoreCard({ 
  listing, 
  isInstalled = false,
  isInstalling = false,
  onInstall,
  onTagClick,
  onSubmitRating: _onSubmitRating,
  isRatingSubmitting: _isRatingSubmitting = false,
}: AddonStoreCardProps) {
  const [ratingDialogOpen, setRatingDialogOpen] = React.useState(false);

  const formatDownloads = (downloads: number) => {
    if (downloads >= 1000000) {
      return `${(downloads / 1000000).toFixed(1)}M`;
    } else if (downloads >= 1000) {
      return `${(downloads / 1000).toFixed(1)}K`;
    }
    return downloads.toString();
  };

  return (
    <Card className="group relative h-full overflow-hidden transition-all duration-200 hover:shadow-lg hover:shadow-primary/10">
      <CardHeader className="pb-2">
        <CardTitle className="line-clamp-1 text-base">{listing.name}</CardTitle>
        <CardDescription className="line-clamp-2 text-sm">
          {listing.description}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Author & Stats */}
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Icons.Users className="h-3 w-3" />
            <span>By {listing.author}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Icons.Download className="h-3 w-3" />
              <span>{formatDownloads(listing.downloads)}</span>
            </div>
            <span className="text-xs">v{listing.version}</span>
          </div>
        </div>

        {/* Rating Display */}
        {listing.rating > 0 && (
          <StarRatingDisplay 
            rating={listing.rating} 
            reviewCount={listing.reviewCount}
            size="sm"
            className="mt-1"
          />
        )}
      </CardContent>

      {/* Overlay Actions - Show on Hover */}
      <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/60 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        {/* View Details Button */}
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="secondary" size="sm" className="bg-white/90 text-black hover:bg-white">
              <Icons.Eye className="mr-2 h-4 w-4" />
              Details
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {listing.name}
                <Badge variant="outline">v{listing.version}</Badge>

              </DialogTitle>
              <DialogDescription className="text-base">
                {listing.description}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-6">
              {/* Screenshots */}
              {listing.images && listing.images.length > 0 && (
                <div className="space-y-3">
                  <h4 className="font-medium">Screenshots</h4>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {listing.images.map((image, index) => (
                      <div key={index} className="overflow-hidden rounded-lg border">
                        <img
                          src={image}
                          alt={`${listing.name} screenshot ${index + 1}`}
                          className="h-48 w-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Release Notes */}
              <div className="space-y-3">
                <h4 className="font-medium">Latest Release Notes</h4>
                <p className="text-sm text-muted-foreground">
                  {listing.releaseNotes}
                </p>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Downloads</p>
                  <p className="text-2xl font-bold text-primary">{formatDownloads(listing.downloads)}</p>
                </div>

                <div className="space-y-1">
                  <p className="text-sm font-medium">Rating</p>
                  <div className="flex flex-col gap-1">
                    <StarRatingDisplay 
                      rating={listing.rating || 0} 
                      reviewCount={listing.reviewCount || 0}
                      size="sm"
                      showText={true}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">Author</p>
                  <p className="text-sm text-muted-foreground">{listing.author}</p>
                </div>
              </div>

              {/* Rate this addon section */}
              {isInstalled && (
                <div className="space-y-3">
                  <h4 className="font-medium">Rate this Add-on</h4>
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setRatingDialogOpen(true)}
                      className="flex items-center gap-2"
                    >
                      <Icons.Star className="h-4 w-4" />
                      Write a Review
                    </Button>
                    <p className="text-sm text-muted-foreground">
                      Share your experience with other users
                    </p>
                  </div>
                </div>
              )}

              {/* Tags */}
              {listing.tags && listing.tags.length > 0 && (
                <div className="space-y-3">
                  <h4 className="font-medium">Categories</h4>
                  <div className="flex flex-wrap gap-2">
                    {listing.tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="outline"
                        className={`capitalize ${onTagClick ? 'cursor-pointer hover:bg-primary hover:text-primary-foreground' : ''}`}
                        onClick={() => onTagClick?.(tag)}
                      >
                        <Icons.Tag className="mr-1 h-3 w-3" />
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-4">
                <Button
                  onClick={() => onInstall?.(listing)}
                  disabled={isInstalled || isInstalling}
                  className="flex-1"
                >
                  {isInstalling ? (
                    <>
                      <Icons.Loader className="mr-2 h-4 w-4 animate-spin" />
                      Installing...
                    </>
                  ) : isInstalled ? (
                    <>
                      <Icons.Check className="mr-2 h-4 w-4" />
                      Installed
                    </>
                  ) : (
                    <>
                      <Icons.Download className="mr-2 h-4 w-4" />
                      Install
                    </>
                  )}
                </Button>
                
                {listing.changelogUrl && (
                  <Button variant="outline" asChild>
                    <a href={listing.changelogUrl} target="_blank" rel="noopener noreferrer">
                      <Icons.ExternalLink className="mr-2 h-4 w-4" />
                      Changelog
                    </a>
                  </Button>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Rate Button - Show only for installed addons */}
        {isInstalled && (
          <Button 
            variant="secondary" 
            size="sm" 
            className="bg-white/90 text-black hover:bg-white"
            onClick={() => setRatingDialogOpen(true)}
          >
            <Icons.Star className="mr-2 h-4 w-4" />
            Rate
          </Button>
        )}

        {/* Install Button */}
        {!isInstalled && (
          <Button
            onClick={() => onInstall?.(listing)}
            disabled={isInstalling || listing.status !== 'active'}
            size="sm"
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {isInstalling ? (
              <>
                <Icons.Loader className="mr-2 h-4 w-4 animate-spin" />
                Installing...
              </>
            ) : listing.status !== 'active' ? (
              listing.status === 'coming-soon' ? (
                <>
                  <Icons.Clock className="mr-2 h-4 w-4" />
                  Coming Soon
                </>
              ) : (
                <>
                  <Icons.Close className="mr-2 h-4 w-4" />
                  {listing.status === 'deprecated' ? 'Deprecated' : 'Unavailable'}
                </>
              )
            ) : (
              <>
                <Icons.Download className="mr-2 h-4 w-4" />
                Install
              </>
            )}
          </Button>
        )}
      </div>
      
      {/* Status Indicators */}
      <div className="absolute right-2 top-2 opacity-90 flex flex-col gap-1">
        {isInstalled && (
          <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
            <Icons.Check className="mr-1 h-3 w-3" />
            Installed
          </Badge>
        )}
        {listing.status && listing.status !== 'active' && (
          listing.status === 'coming-soon' ? (
            <Badge variant="default" className="text-xs capitalize bg-primary text-primary-foreground">
              <Icons.Clock className="mr-1 h-3 w-3" />
              Coming Soon
            </Badge>
          ) : (
            <Badge 
              variant={listing.status === 'deprecated' ? 'destructive' : 'outline'}
              className="text-xs capitalize"
            >
              {listing.status}
            </Badge>
          )
        )}
      </div>

      {/* Rating Dialog */}
      <RatingDialog
        open={ratingDialogOpen}
        onOpenChange={setRatingDialogOpen}
        addonId={listing.id}
        addonName={listing.name}
        onRatingSubmitted={() => {
          // Could refresh rating data here if needed
        }}
      />
    </Card>
  );
}
