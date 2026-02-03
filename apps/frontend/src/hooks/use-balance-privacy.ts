import { useContext } from "react";
import { PrivacyContext } from "@/context/privacy-context";

export function useBalancePrivacy() {
  const context = useContext(PrivacyContext);
  if (context === undefined) {
    throw new Error("useBalancePrivacy must be used within a PrivacyProvider");
  }
  return context;
}
