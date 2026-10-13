import { Component, type ReactNode } from "react";
import { Button } from "@wealthfolio/ui";
import { useTranslation } from "react-i18next";
import { logger } from "@/adapters";
import { reloadApplication } from "@/lib/reload-application";
import { StartupScreen } from "./startup-screen";

function StartupFailure() {
  const { t } = useTranslation("common", { useSuspense: false });
  return (
    <StartupScreen
      profile={null}
      message={t("profiles.startupFailed", { defaultValue: "Couldn't open Wealthfolio" })}
      error={t("profiles.reloadHelp", {
        defaultValue: "Reload to try opening your profile again.",
      })}
    >
      <Button onClick={() => reloadApplication()}>{t("retry", { defaultValue: "Retry" })}</Button>
    </StartupScreen>
  );
}

/** Keep failures above the route boundary visible, including startup providers. */
export class StartupBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch() {
    logger.error("Application startup rendering failed.");
  }
  override render() {
    return this.state.failed ? <StartupFailure /> : this.props.children;
  }
}
