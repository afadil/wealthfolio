import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { OnboardingStep1 } from './onboarding-step1';
import { OnboardingStep2 } from './onboarding-step2';
import { OnboardingStep3 } from './onboarding-step3';

const OnboardingPage = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
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
    <section className="grid min-h-screen grid-rows-[auto_1fr] justify-items-center py-16 ">
      <img
        alt="Wealthfolio Illustration"
        className="align-self-end mx-auto mb-8"
        height="150"
        width="150"
        src="/illustration2.png"
        style={{
          aspectRatio: '1 / 1',
          objectFit: 'cover',
        }}
      />
      <div className="align-self-start w-full max-w-7xl">
        <div className="w-full flex-1 px-4 md:px-0">{renderCurrentStep()}</div>
      </div>
    
    </section>
  );
};

export default OnboardingPage;
