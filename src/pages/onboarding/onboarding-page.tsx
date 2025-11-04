import { Button } from "@/components/ui/button";
import { Icons } from "@/components/ui/icons";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { OnboardingStep1 } from "./onboarding-step1";
import { OnboardingStep2, OnboardingStep2Handle } from "./onboarding-step2";
import { OnboardingStep3 } from "./onboarding-step3";

const OnboardingPage = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [isStepValid, setIsStepValid] = useState(true);
  const step2Ref = useRef<OnboardingStep2Handle>(null);
  const MAX_STEPS = 3;

  const handleNext = () => {
    setCurrentStep((prevStep) => Math.min(prevStep + 1, MAX_STEPS));
  };

  const handleBack = () => {
    setCurrentStep((prevStep) => Math.max(prevStep - 1, 1));
  };

  const handleFinish = () => {
    navigate("/settings/accounts");
  };

  const handleContinue = () => {
    if (currentStep === 2 && step2Ref.current) {
      step2Ref.current.submitForm();
    } else if (currentStep === MAX_STEPS) {
      handleFinish();
    } else {
      handleNext();
    }
  };

  useEffect(() => {
    if (currentStep === 2) {
      setIsStepValid(false);
    } else {
      setIsStepValid(true);
    }
  }, [currentStep]);

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 1:
        return <OnboardingStep1 />;
      case 2:
        return (
          <OnboardingStep2 ref={step2Ref} onNext={handleNext} onValidityChange={setIsStepValid} />
        );
      case 3:
        return <OnboardingStep3 />;
      default:
        return <OnboardingStep1 />;
    }
  };

  return (
    <section className="scan-hide-target bg-background relative flex min-h-screen flex-col lg:items-center lg:justify-center">
      {/* Desktop: All content in centered wrapper | Mobile: Stacked layout */}
      <div className="flex min-h-screen flex-col lg:min-h-0">
        {/* Mobile: Sticky header | Desktop: Normal header */}
        <div className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-20 pt-[env(safe-area-inset-top)] backdrop-blur lg:relative lg:backdrop-blur-none">
          <div className="flex flex-col items-center">
            <img
              alt="Wealthfolio Illustration"
              className="h-20 w-20 sm:h-24 sm:w-24"
              src="/illustration2.png"
              style={{
                aspectRatio: "1 / 1",
                objectFit: "cover",
              }}
            />
            {/* Progress indicators */}
            <div className="flex justify-center gap-2">
              {Array.from({ length: MAX_STEPS }).map((_, index) => (
                <div
                  key={index}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    index === currentStep - 1
                      ? "bg-primary w-12"
                      : index < currentStep - 1
                        ? "bg-primary/60 w-2"
                        : "bg-muted w-2"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-y-auto pb-20 sm:pb-24 lg:flex-none lg:overflow-visible lg:pb-0">
          <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{
                  duration: 0.3,
                  ease: "easeInOut",
                }}
              >
                {renderCurrentStep()}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Mobile: Fixed bottom navigation | Desktop: Normal bottom navigation */}
        <div className="bg-background/95 supports-[backdrop-filter]:bg-background/80 fixed right-0 bottom-0 left-0 z-20 border-none backdrop-blur lg:relative lg:backdrop-blur-none">
          <div className="mx-auto max-w-4xl px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-8 lg:py-6">
            <div className="flex items-center justify-between gap-4">
              {/* Left side - Back button */}
              <div className="flex items-center gap-3">
                {currentStep > 1 && (
                  <Button variant="outline" onClick={handleBack} type="button" className="shrink-0">
                    <Icons.ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                )}
              </div>

              {/* Right side - Continue/Get Started button */}
              <Button
                onClick={handleContinue}
                disabled={!isStepValid}
                type="button"
                className="group from-primary to-primary/90 bg-linear-to-r shadow-lg transition-all duration-300 hover:shadow-xl"
              >
                {currentStep === MAX_STEPS ? "Get Started" : "Continue"}
                {currentStep === MAX_STEPS ? (
                  <Icons.Check className="ml-2 h-4 w-4 transition-transform duration-300 group-hover:scale-110" />
                ) : (
                  <Icons.ArrowRight className="ml-2 h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default OnboardingPage;
