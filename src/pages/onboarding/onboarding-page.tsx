import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Link, useLocation } from 'react-router-dom';

export const OnboardingPage = () => {
  const location = useLocation();
  // Parse the query parameters
  const searchParams = new URLSearchParams(location.search);
  const currentStep = parseInt(searchParams.get('step') || '0', 10);

  const renderStepIcon = (stepNumber: number) => {
    return currentStep >= stepNumber ? (
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500">
        <Icons.CheckCircle className="text-xs text-white" />
      </div>
    ) : (
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground/80">
        <span className="text-xs text-white">{stepNumber}</span>
      </div>
    );
  };

  return (
    <section className="flex min-h-screen items-center justify-center pb-16">
      <div className="flex max-w-4xl flex-col space-x-6 md:flex-row md:items-center">
        <div className="md:flex md:w-1/4 md:items-center md:justify-center">
          <img
            alt="Illustration"
            className="mx-auto"
            height="400"
            width="400"
            src="/illustration.png"
            style={{
              aspectRatio: '1 / 1',
              objectFit: 'cover',
            }}
          />
        </div>
        <div className="space-y-6 md:w-3/4">
          <h1 className="mb-4 text-3xl font-bold text-gray-900 dark:text-gray-100">
            Welcome to Wealthfolio
          </h1>
          <p className="mb-8 text-lg text-gray-600 dark:text-gray-400">
            Your personal financial portfolio tracker, right on your computer. Here's how to get
            started:
          </p>
          <div className="mb-8 space-y-6 pl-2">
            <Link to="/settings/general" className="group flex items-center space-x-2">
              {renderStepIcon(1)}
              <p className="text-gray-700 dark:text-gray-300">Set your main currency</p>
              <Icons.ArrowRight className="ml-2 h-4 w-4" />
            </Link>
            <Link to="/settings/accounts" className="group flex items-center space-x-2">
              {renderStepIcon(2)}
              <p className="text-gray-700 dark:text-gray-300">Add your accounts</p>
              <Icons.ArrowRight className="ml-2 h-4 w-4" />
            </Link>
            <Link to="/activities" className="group flex items-center space-x-2">
              {renderStepIcon(3)}
              <p className="text-gray-700 dark:text-gray-300">Add or import activities</p>
              <Icons.ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </div>
          {currentStep === 0 && (
            <div>
              <Button className="mt-4" asChild>
                <Link to="/settings/general">
                  Let's get started
                  <Icons.ArrowRight className="ml-2 h-4 w-4 text-white" />
                </Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default OnboardingPage;
