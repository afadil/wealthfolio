import type { AddonContext } from "@wealthfolio/addon-sdk";
import { Page, PageContent, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from "@wealthfolio/ui";
import { useState } from "react";
import HistoryTab from "../components/history-tab";
import SuggestionsTab from "../components/suggestions-tab";

interface DividendPageProps {
  ctx: AddonContext;
}

export default function DividendPage({ ctx }: DividendPageProps) {
  const [tab, setTab] = useState("suggestions");

  return (
    <Page>
      <PageHeader heading="Dividend Tracker" />
      <PageContent>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="suggestions">Suggestions</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
          <TabsContent value="suggestions" className="mt-4">
            <SuggestionsTab ctx={ctx} onSaved={() => setTab("history")} />
          </TabsContent>
          <TabsContent value="history" className="mt-4">
            <HistoryTab ctx={ctx} />
          </TabsContent>
        </Tabs>
      </PageContent>
    </Page>
  );
}
