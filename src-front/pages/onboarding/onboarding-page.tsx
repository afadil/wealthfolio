import { WEALTHFOLIO_CONNECT_PORTAL_URL } from "@/lib/constants";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { OnboardingConnect } from "./onboarding-connect";
import { OnboardingStep1 } from "./onboarding-step1";
import { OnboardingStep2, OnboardingStep2Handle } from "./onboarding-step2";

const MAX_STEPS = 3;

const OnboardingPage = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [isStepValid, setIsStepValid] = useState(true);
  const settingsStepRef = useRef<OnboardingStep2Handle>(null);

  const handleNext = () => {
    setCurrentStep((prev) => Math.min(prev + 1, MAX_STEPS));
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const handleFinish = () => {
    navigate("/settings/accounts");
  };

  const handleContinue = () => {
    if (currentStep === 2 && settingsStepRef.current) {
      settingsStepRef.current.submitForm();
    } else {
      handleNext();
    }
  };

  useEffect(() => {
    setIsStepValid(currentStep !== 2);
  }, [currentStep]);

  return (
    <div className="bg-background flex h-screen flex-col pt-[env(safe-area-inset-top)]">
      {/* Fixed Header with Logo and Steppers */}
      <header className="flex-none px-4 pt-8 sm:px-6 sm:pt-12">
        <div className="flex flex-col items-center">
          {/* Logo */}
          <img
            alt="Wealthfolio"
            className="mb-3 h-16 w-16 sm:h-20 sm:w-20"
            src="/logo-vantage.png"
          />

          {/* Progress indicators */}
          <div className="flex gap-2">
            {Array.from({ length: MAX_STEPS }).map((_, index) => (
              <div
                key={index}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  index === currentStep - 1
                    ? "bg-primary w-8"
                    : index < currentStep - 1
                      ? "bg-primary/50 w-1.5"
                      : "bg-muted w-1.5"
                }`}
              />
            ))}
          </div>
        </div>
      </header>

      {/* Main content - centered vertically in remaining space */}
      <main className="flex flex-1 flex-col items-center justify-start overflow-y-auto px-4 pt-8 sm:px-6 sm:pt-12">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={currentStep}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex w-full max-w-4xl justify-center"
          >
            {currentStep === 1 && <OnboardingStep1 />}
            {currentStep === 2 && (
              <OnboardingStep2
                ref={settingsStepRef}
                onNext={handleNext}
                onValidityChange={setIsStepValid}
              />
            )}
            {currentStep === 3 && <OnboardingConnect />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Fixed Footer */}
      <footer className="flex-none pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto max-w-4xl px-4 pt-6 pb-8 sm:px-6 sm:pb-18">
          {currentStep === 3 ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="order-2 sm:order-1">
                <Button variant="ghost" onClick={handleBack} size="sm">
                  <Icons.ArrowLeft className="mr-1.5 h-4 w-4" />
                  Back
                </Button>
              </div>
              <div className="order-1 flex flex-col gap-2 sm:order-2 sm:flex-row sm:gap-3">
                <Button
                  asChild
                  className="from-primary to-primary/90 bg-linear-to-r order-1 sm:order-2"
                >
                  <a
                    href={WEALTHFOLIO_CONNECT_PORTAL_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Subscribe & Connect
                    <Icons.ExternalLink className="ml-1.5 h-4 w-4" />
                  </a>
                </Button>
                <Button
                  variant="outline"
                  onClick={handleFinish}
                  className="order-2 sm:order-1"
                >
                  Skip, I'll manage manually
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                {currentStep > 1 && (
                  <Button variant="ghost" onClick={handleBack} size="sm">
                    <Icons.ArrowLeft className="mr-1.5 h-4 w-4" />
                    Back
                  </Button>
                )}
              </div>
              <Button
                onClick={handleContinue}
                disabled={!isStepValid}
                className="from-primary to-primary/90 bg-linear-to-r"
              >
                Continue
                <Icons.ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </footer>
    </div>
  );
};

export default OnboardingPage;
