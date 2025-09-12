import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { listenNavigateToRoute } from "@/commands/navigation-listener";

const useNavigationEventListener = () => {
  const navigate = useNavigate();

  useEffect(() => {
    let cleanup = () => {};

    // Make navigate function available globally for addons
    (window as any).__wealthfolio_navigate__ = navigate;

    const setupNavigationListener = async () => {
      const handleNavigateToRoute = (event: { payload: { route: string } }) => {
        const { route } = event.payload;
        navigate(route);
      };

      const unlisten = await listenNavigateToRoute(handleNavigateToRoute);
      return unlisten;
    };

    setupNavigationListener()
      .then((unlistenFn) => {
        cleanup = unlistenFn;
      })
      .catch((error) => {
        console.error("Failed to setup navigation event listener:", error);
      });

    return () => {
      // Clean up global reference
      delete (window as any).__wealthfolio_navigate__;
      cleanup();
    };
  }, [navigate]);

  return null;
};

export default useNavigationEventListener;
