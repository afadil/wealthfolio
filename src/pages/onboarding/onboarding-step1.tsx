import { Button } from '@/components/ui/button';
import { Icons } from '@/components/ui/icons';
import React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

interface OnboardingStep1Props {
  onNext: () => void;
}

export const OnboardingStep1: React.FC<OnboardingStep1Props> = ({ onNext }) => {
  return (
    <div className="space-y-4 px-12 md:px-16 lg:px-20">
      <h1 className="mb-2 text-3xl font-bold">Welcome to Wealthfolio!</h1>
      <p className="text-base text-muted-foreground">
        Let's start by understanding how you can track your assets.
      </p>
      <div className="grid grid-cols-1 gap-16 pt-4 md:grid-cols-2">
        <Card className="flex h-full flex-col border-none shadow-none">
          <CardHeader className="min-h-[110px]">
            <CardTitle className="flex items-center pb-2 text-lg">Simple Tracking</CardTitle>
            <CardDescription className="font-normal">
              <strong>Focus:</strong> Quickly get started by adding your current holdings.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            <ul className="ml-1 space-y-6 text-sm [&>li]:mt-1">
              <li className="flex items-start">
                <Icons.Check className="mr-2 mt-1 h-4 w-4 flex-shrink-0 text-green-600" />
                <span>
                  Use <code className="font-semibold">Add Holding</code> to increase an asset's
                  position
                </span>
              </li>
              <li className="flex items-start">
                <Icons.Check className="mr-2 mt-1 h-4 w-4 flex-shrink-0 text-green-600" />
                <span>
                  Use <code className="font-semibold">Remove Holding</code> to reduce an asset's
                  position
                </span>
              </li>
              <li className="flex items-start">
                <Icons.Check className="mr-2 mt-1 h-4 w-4 flex-shrink-0 text-green-600" />
                <span>
                  Use <code className="font-semibold">Deposit/Withdrawal</code> to update your
                  account's cash balance
                </span>
              </li>
              <li className="flex items-start">
                <Icons.AlertCircle className="mr-2 mt-1 h-4 w-4 flex-shrink-0 text-warning" />
                <span>Unlike Buy/Sell, Add/Remove holdings don't affect cash balance.</span>
              </li>
            </ul>
          </CardContent>
          <CardFooter>
            <p className="mt-4 text-xs text-muted-foreground">
              <strong>Best For:</strong> Quick setup, simple overview.
            </p>
          </CardFooter>
        </Card>
        <Card className="bordeer-muted flex h-full flex-col border-none shadow-none">
          <CardHeader className="min-h-[110px]">
            <CardTitle className="flex items-center pb-2 text-lg">Full Tracking</CardTitle>
            <CardDescription className="font-normal">
              <strong>Focus:</strong> Track every deposit, trade, and dividend for exact
              performance.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            <ul className="ml-1 space-y-6 text-sm [&>li]:mt-1">
              <li className="flex items-start">
                <Icons.Check className="mr-2 mt-1 h-4 w-4 flex-shrink-0 text-green-600" />
                <span>
                  Start with a <code className="font-semibold">Deposit</code> to fund your account.
                </span>
              </li>
              <li className="flex items-start">
                <Icons.Check className="mr-2 mt-1 h-4 w-4 flex-shrink-0 text-green-600" />
                <span>
                  Use <code className="font-semibold">Buy</code> /{' '}
                  <code className="font-semibold">Sell</code> actions for trades.
                </span>
              </li>
              <li className="flex items-start">
                <Icons.Check className="mr-2 mt-1 h-4 w-4 flex-shrink-0 text-green-600" />
                <span>
                  Use{' '}
                  <code className="font-semibold">
                    Deposit, Withdrawal, Transfer In, Transfer Out
                  </code>{' '}
                  actions to track cash flows.
                </span>
              </li>
              <li className="flex items-start">
                <Icons.AlertCircle className="mr-2 mt-1 h-4 w-4 flex-shrink-0 text-warning" />
                <span>Buy/Sell actions update cash balance; always record deposits first.</span>
              </li>
            </ul>
          </CardContent>
          <CardFooter>
            <p className="mt-4 text-xs text-muted-foreground">
              <strong>Best For:</strong> Detailed analysis, accurate cash flow.
            </p>
          </CardFooter>
        </Card>
      </div>

      <p className="pt-4 text-xs text-muted-foreground">
        You can mix both transaction types whenever you need them. For more details,{' '}
        <a
          href="https://wealthfolio.app/docs/concepts/activity-types"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          → View quick guide
        </a>
      </p>

      <div className="flex justify-end pt-4">
        <Button onClick={onNext}>
          Got it, Next: Set Preferences
          <Icons.ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};
