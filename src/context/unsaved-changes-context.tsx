import {
  createContext,
  useContext,
  useCallback,
  useState,
  useRef,
  useEffect,
  type ReactNode,
} from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

interface UnsavedChangesContextType {
  setHasUnsavedChanges: (value: boolean) => void;
  setMessage: (message: string) => void;
  hasUnsavedChanges: boolean;
  confirmAction: (onConfirm: () => void, customMessage?: string) => boolean;
}

const UnsavedChangesContext = createContext<UnsavedChangesContextType | null>(null);

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [message, setMessage] = useState(
    "You have unsaved changes. Are you sure you want to leave? Your changes will be lost.",
  );
  const [dialogMessage, setDialogMessage] = useState(message);
  const [showDialog, setShowDialog] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const hasUnsavedChangesRef = useRef(hasUnsavedChanges);

  useEffect(() => {
    hasUnsavedChangesRef.current = hasUnsavedChanges;
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (!pendingAction) {
      setDialogMessage(message);
    }
  }, [message, pendingAction]);

  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (hasUnsavedChangesRef.current) {
        e.preventDefault();
        e.returnValue = message;
        return message;
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [message]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;

    function handlePopState() {
      if (hasUnsavedChangesRef.current) {
        window.history.pushState(null, "", location.pathname + location.search);
        setPendingNavigation("back");
        setDialogMessage(message);
        setShowDialog(true);
      }
    }

    window.history.pushState(null, "", location.pathname + location.search);
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [hasUnsavedChanges, location.pathname, location.search, message]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;

    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      const link = target.closest("a");

      if (link && link.href) {
        const url = new URL(link.href);
        if (url.origin === window.location.origin) {
          const targetPath = url.pathname + url.search;
          const currentPath = location.pathname + location.search;

          if (targetPath !== currentPath && hasUnsavedChangesRef.current) {
            e.preventDefault();
            e.stopPropagation();
            setPendingNavigation(targetPath);
            setDialogMessage(message);
            setShowDialog(true);
          }
        }
      }
    }

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [hasUnsavedChanges, location.pathname, location.search, message]);

  const handleCancel = useCallback(() => {
    setShowDialog(false);
    setPendingNavigation(null);
    setPendingAction(null);
  }, []);

  const handleConfirm = useCallback(() => {
    hasUnsavedChangesRef.current = false;
    setHasUnsavedChanges(false);
    setShowDialog(false);

    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    } else if (pendingNavigation === "back") {
      window.history.go(-2);
    } else if (pendingNavigation) {
      navigate(pendingNavigation);
    }
    setPendingNavigation(null);
  }, [pendingAction, pendingNavigation, navigate]);

  const confirmAction = useCallback(
    (onConfirm: () => void, customMessage?: string): boolean => {
      if (hasUnsavedChangesRef.current) {
        setPendingAction(() => onConfirm);
        setDialogMessage(customMessage || message);
        setShowDialog(true);
        return false;
      }
      return true;
    },
    [message],
  );

  return (
    <UnsavedChangesContext.Provider
      value={{ setHasUnsavedChanges, setMessage, hasUnsavedChanges, confirmAction }}
    >
      {children}
      <AlertDialog open={showDialog} onOpenChange={(open) => !open && handleCancel()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>{dialogMessage}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancel}>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={handleConfirm}>
              Discard Changes
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </UnsavedChangesContext.Provider>
  );
}

export function useUnsavedChangesContext() {
  const context = useContext(UnsavedChangesContext);
  if (!context) {
    throw new Error("useUnsavedChangesContext must be used within UnsavedChangesProvider");
  }
  return context;
}
