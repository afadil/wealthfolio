import { ChatShell } from "@/features/ai-assistant";
import { ApplicationShell } from "@wealthfolio/ui";

/**
 * AI Assistant page - main chat interface for Wealthfolio AI.
 */
export default function AiAssistantPage() {
  return (
    <ApplicationShell className="h-screen">
      <ChatShell className="h-full" />
    </ApplicationShell>
  );
}
