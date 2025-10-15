import { Page, PageContent, PageHeader } from "@/components/page/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icons } from "@wealthfolio/ui";

export default function StickyTestPage() {
  return (
    <Page>
      <PageHeader
        heading="Sticky Header Test"
        text="Scroll to verify header stickiness."
        actions={<Icons.Sparkles className="h-5 w-5" />}
      />
      <PageContent>
        {Array.from({ length: 40 }).map((_, i) => (
          <Card key={i} className="bg-card/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle>Section {i + 1}</CardTitle>
            </CardHeader>
            <CardContent>
              <p>
                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer nec odio. Praesent
                libero. Sed cursus ante dapibus diam. Sed nisi. Nulla quis sem at nibh elementum
                imperdiet. Duis sagittis ipsum. Praesent mauris. Fusce nec tellus sed augue semper
                porta.
              </p>
            </CardContent>
          </Card>
        ))}
      </PageContent>
    </Page>
  );
}
