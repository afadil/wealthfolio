import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
  Textarea,
  Icons,
  StarRating,
} from "@wealthfolio/ui";
import { useAddonRatingMutation } from "../hooks/use-addon-rating-mutation";

interface RatingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  addonId: string;
  addonName: string;
  onRatingSubmitted?: () => void;
}

export function RatingDialog({
  open,
  onOpenChange,
  addonId,
  addonName,
  onRatingSubmitted,
}: RatingDialogProps) {
  const [rating, setRating] = React.useState<number>(0);
  const [review, setReview] = React.useState("");

  const { submitRating, isSubmittingRating } = useAddonRatingMutation();

  const handleSubmit = async () => {
    if (rating === 0) {
      return;
    }

    try {
      await submitRating({
        addonId,
        rating,
        review: review.trim() || undefined,
      });

      // Reset form
      setRating(0);
      setReview("");
      onOpenChange(false);
      onRatingSubmitted?.();
    } catch (error) {
      // Error handling is done in the mutation hook
      console.error("Failed to submit rating:", error);
    }
  };

  const handleClose = () => {
    if (!isSubmittingRating) {
      setRating(0);
      setReview("");
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rate {addonName}</DialogTitle>
          <DialogDescription>
            Share your experience with this addon to help other users.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Star Rating */}
          <div className="flex flex-col items-center space-y-2">
            <span className="text-sm font-medium">How would you rate this addon?</span>
            <StarRating rating={rating} interactive onRatingChange={setRating} size="lg" />
            {rating > 0 && (
              <span className="text-muted-foreground text-sm">{rating} out of 5 stars</span>
            )}
          </div>

          {/* Review Text */}
          <div className="space-y-2">
            <label htmlFor="review" className="text-sm font-medium">
              Write a review (optional)
            </label>
            <Textarea
              id="review"
              placeholder="Share your thoughts about this addon..."
              value={review}
              onChange={(e) => setReview(e.target.value)}
              rows={4}
              maxLength={500}
              disabled={isSubmittingRating}
            />
            <div className="text-muted-foreground text-right text-xs">
              {review.length}/500 characters
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isSubmittingRating}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={rating === 0 || isSubmittingRating}>
            {isSubmittingRating ? (
              <>
                <Icons.Loader className="mr-2 h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              "Submit Rating"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
