import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlatform } from '@/hooks/use-platform';
import { OnboardingStep1 } from './onboarding-step1';
import { OnboardingStep2 } from './onboarding-step2';
import { OnboardingStep3 } from './onboarding-step3';
import { OnboardingSyncChoice } from './onboarding-sync-choice';
import { OnboardingSyncStep } from './onboarding-sync-step';

const OnboardingPage = () => {
  const navigate = useNavigate();
  const { isMobile } = usePlatform();
  const [currentStep, setCurrentStep] = useState(1);
  const [syncStage, setSyncStage] = useState<'prompt' | 'scan' | 'done'>(
    isMobile ? 'prompt' : 'prompt',
  );
  const MAX_STEPS = 3;

  const handleNext = () => {
    setCurrentStep((prevStep) => Math.min(prevStep + 1, MAX_STEPS));
  };

  const handleBack = () => {
    setCurrentStep((prevStep) => Math.max(prevStep - 1, 1));
  };

  const handleFinish = async () => {
    navigate('/settings/accounts');
  };

  const renderCurrentStep = () => {
    if (syncStage === 'prompt') {
      return (
        <OnboardingSyncChoice
          onYes={() => setSyncStage('scan')}
          onNo={() => setSyncStage('done')}
        />
      );
    }

    if (syncStage === 'scan') {
      return (
        <OnboardingSyncStep
          onSuccess={() => setSyncStage('done')}
          onBack={() => setSyncStage('prompt')}
        />
      );
    }

    switch (currentStep) {
      case 1:
        return <OnboardingStep1 onNext={handleNext} />;
      case 2:
        return <OnboardingStep2 onNext={handleNext} onBack={handleBack} />;
      case 3:
        return <OnboardingStep3 onNext={handleFinish} onBack={handleBack} />;
      default:
        setCurrentStep(1);
        return null;
    }
  };

  return (
    <section className="grid min-h-screen grid-rows-[auto_1fr] justify-items-center">
      <img
        alt="Wealthfolio Illustration"
        className="align-self-end mx-auto h-20 w-20 md:h-32 md:w-32 lg:h-40 lg:w-40"
        src="/illustration2.png"
        style={{
          aspectRatio: '1 / 1',
          objectFit: 'cover',
        }}
      />
      <div className="align-self-start w-full max-w-7xl">
        <div className="w-full flex-1 px-0 md:px-4">{renderCurrentStep()}</div>
      </div>
    </section>
  );
};

export default OnboardingPage;
