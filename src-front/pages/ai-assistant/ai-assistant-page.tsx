import { ApplicationShell } from "@wealthfolio/ui";
import { ChatShell } from "@/features/ai-assistant";

/**
 * AI Assistant page - main chat interface for portfolio AI.
 */
export default function AiAssistantPage() {
  return (
    <ApplicationShell className="h-screen">
      <ChatShell className="h-full" />
    </ApplicationShell>
  );
}
