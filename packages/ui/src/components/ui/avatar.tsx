import { Avatar as AvatarPrimitive } from "@base-ui/react/avatar";

import { cn } from "../../lib/utils";

interface AvatarProps extends Omit<AvatarPrimitive.Root.Props, "className"> {
  className?: string;
}

function Avatar({ className, ...props }: AvatarProps) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn(
        "group/avatar relative flex h-10 w-10 shrink-0 select-none overflow-hidden rounded-full",
        className,
      )}
      {...props}
    />
  );
}

interface AvatarImageProps extends Omit<AvatarPrimitive.Image.Props, "className"> {
  className?: string;
}

function AvatarImage({ className, ...props }: AvatarImageProps) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn("aspect-square h-full w-full rounded-full object-cover", className)}
      {...props}
    />
  );
}

interface AvatarFallbackProps extends Omit<AvatarPrimitive.Fallback.Props, "className"> {
  className?: string;
}

function AvatarFallback({ className, ...props }: AvatarFallbackProps) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn("bg-muted flex h-full w-full items-center justify-center rounded-full", className)}
      {...props}
    />
  );
}

function AvatarBadge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="avatar-badge"
      className={cn(
        "bg-primary text-primary-foreground ring-background absolute bottom-0 right-0 z-10 inline-flex size-3 select-none items-center justify-center rounded-full ring-2 [&>svg]:size-2",
        className,
      )}
      {...props}
    />
  );
}

function AvatarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="avatar-group"
      className={cn(
        "group/avatar-group *:data-[slot=avatar]:ring-background flex -space-x-2 *:data-[slot=avatar]:ring-2",
        className,
      )}
      {...props}
    />
  );
}

function AvatarGroupCount({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="avatar-group-count"
      className={cn(
        "bg-muted text-muted-foreground ring-background relative flex size-10 shrink-0 items-center justify-center rounded-full text-sm ring-2 [&>svg]:size-4",
        className,
      )}
      {...props}
    />
  );
}

export { Avatar, AvatarImage, AvatarFallback, AvatarBadge, AvatarGroup, AvatarGroupCount };
