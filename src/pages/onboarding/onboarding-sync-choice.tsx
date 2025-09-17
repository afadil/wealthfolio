import { Card, CardContent, Icons } from '@wealthfolio/ui';
import { motion, type Variants } from 'framer-motion';

interface OnboardingSyncChoiceProps {
  onYes: () => void;
  onNo: () => void;
}

export function OnboardingSyncChoice({ onYes, onNo }: OnboardingSyncChoiceProps) {
  const staggerContainer: Variants = {
    initial: { opacity: 0 },
    animate: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2,
      },
    },
  };

  const cardItem: Variants = {
    initial: { opacity: 0, y: 20 },
    animate: {
      opacity: 1,
      y: 0,
      transition: {
        type: 'spring' as const,
        stiffness: 300,
        damping: 24,
      },
    },
  };

  return (
    <div className="space-y-8 px-4 py-4 md:px-12 lg:px-16 xl:px-20">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="space-y-2 text-center"
      >
        <h2 className="text-xl font-semibold tracking-tight md:text-2xl">Sync with desktop?</h2>
        <p className="text-muted-foreground mx-auto max-w-md text-sm md:text-base">
          Choose how you&apos;d like to start your Wealthfolio experience
        </p>
      </motion.div>

      {/* Cards */}
      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="mx-auto grid max-w-2xl gap-4 px-2 py-2 md:gap-6"
      >
        {/* Skip/Continue Card */}
        <motion.div
          variants={cardItem}
          whileHover={{ scale: 1.005, y: -0.5 }}
          whileTap={{ scale: 0.995, y: 0 }}
        >
          <motion.div className="cursor-pointer" onClick={onNo}>
            <Card className="border-border/40 hover:border-border/80 border-2 shadow-sm transition-all duration-200 hover:shadow-md">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="flex-shrink-0">
                    <div className="bg-muted flex h-12 w-12 items-center justify-center rounded-full">
                      <Icons.ArrowRight className="text-muted-foreground h-6 w-6" />
                    </div>
                  </div>
                  <div className="flex-1 space-y-1">
                    <h3 className="text-base font-medium md:text-lg">Continue without sync</h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                      Start fresh with a new portfolio. You can always sync later if needed.
                    </p>
                  </div>
                  <div className="flex-shrink-0">
                    <Icons.ChevronRight className="text-muted-foreground h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>

        {/* Sync Card */}
        <motion.div
          variants={cardItem}
          whileHover={{ scale: 1.005, y: -0.5 }}
          whileTap={{ scale: 0.995, y: 0 }}
        >
          <motion.div className="cursor-pointer" onClick={onYes}>
            <Card className="border-primary/20 hover:border-primary/40 from-background to-primary/5 border-2 bg-gradient-to-br shadow-sm transition-all duration-200 hover:shadow-md">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="flex-shrink-0">
                    <div className="bg-primary/10 flex h-12 w-12 items-center justify-center rounded-full">
                      <Icons.Monitor className="text-primary h-6 w-6" />
                    </div>
                  </div>
                  <div className="flex-1 space-y-1">
                    <h3 className="text-base font-medium md:text-lg">Sync with desktop</h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                      Connect to your existing Wealthfolio desktop app to import your data.
                    </p>
                  </div>
                  <div className="flex-shrink-0">
                    <Icons.Wifi className="text-primary h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>
      </motion.div>
    </div>
  );
}

export default OnboardingSyncChoice;
