import { Route, Switch } from "wouter";
import { Shell } from "@/components/layout/shell";
import Portfolio from "@/pages/portfolio";
import Lots from "@/pages/lots";
import Activity from "@/pages/activity";
import Events from "@/pages/events";
import Statements from "@/pages/statements";
import StatementDetail from "@/pages/statement-detail";
import Trade from "@/pages/trade";
import NotFound from "@/pages/not-found";

/**
 * Every wallet page renders inside one Shell so the ledger stage (the WebGL view of the lots) stays
 * mounted while the reading panel changes. The inner switch keeps absolute paths so the pages can
 * keep reading their params with useRoute. The whole section is one lazy chunk: the landing page
 * does not need any of it.
 */
export default function WalletSection({ address }: { address: string }) {
  return (
    <Shell address={address}>
      <Switch>
        <Route path="/w/:address/statements/:statementId" component={StatementDetail} />
        <Route path="/w/:address/statements" component={Statements} />
        <Route path="/w/:address/lots" component={Lots} />
        <Route path="/w/:address/activity" component={Activity} />
        <Route path="/w/:address/events" component={Events} />
        <Route path="/w/:address/trade" component={Trade} />
        <Route path="/w/:address" component={Portfolio} />
        <Route component={NotFound} />
      </Switch>
    </Shell>
  );
}
