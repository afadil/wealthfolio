import { makeAssistantToolUI } from "@assistant-ui/react";
import { CompactToolCard } from "./shared";

export const CashBalancesToolUI = makeAssistantToolUI({
  toolName: "get_cash_balances",
  render: ({ status }) => {
    if (status?.type === "running") {
      return <CompactToolCard label="Fetching cash balances..." />;
    }
    return <CompactToolCard label="Fetched cash balances" />;
  },
});
