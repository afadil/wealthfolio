import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ActivityImport } from '@/lib/types';
import { Icons } from '@/components/icons';
import { ImportPreviewTable } from '../import-preview-table';
import { ImportAlert } from '../components/import-alert';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

interface ResultStepProps {
  activities: ActivityImport[];
  onBack: () => void;
  onReset: () => void;
}

export const ResultStep = ({ activities, onBack, onReset }: ResultStepProps) => {
  // Use navigate directly in the component
  const navigate = useNavigate();

  // Calculate import summary information
  const importSummary = useMemo(() => {
    if (!activities || activities.length === 0) {
      return null;
    }

    const invalidCount = activities.filter((activity) => !activity.isValid).length;
    const hasImportErrors = invalidCount > 0;

    return {
      totalRows: activities.length,
      validCount: hasImportErrors ? 0 : activities.length,
      invalidCount,
      hasImportErrors,
    };
  }, [activities]);

  // Navigate to activities page
  const goToActivities = () => {
    navigate('/activities');
  };

  // Start a new import
  const startNewImport = () => {
    onReset();
  };

  if (!importSummary) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Icons.Spinner className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Validating imported data...</p>
      </div>
    );
  }

  const { totalRows, hasImportErrors } = importSummary;

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { 
        when: "beforeChildren", 
        staggerChildren: 0.2,
        delayChildren: 0.1 
      }
    }
  };

  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { 
        duration: 0.5,
        ease: [0.22, 1, 0.36, 1]
      }
    }
  };

  const iconContainerVariants = {
    hidden: { scale: 0.8, opacity: 0 },
    visible: { 
      scale: 1,
      opacity: 1,
      transition: { 
        type: "spring",
        stiffness: 200,
        delay: 0.3,
        duration: 0.5
      }
    }
  };

  const iconVariants = {
    hidden: { rotate: -90, opacity: 0 },
    visible: { 
      rotate: 0, 
      opacity: 1,
      transition: { 
        delay: 0.5, 
        duration: 0.5,
        type: "spring",
        stiffness: 120 
      }
    }
  };

  const textVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { duration: 0.4, delay: 0.4 }
    }
  };

  const buttonsVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { duration: 0.4, delay: 0.7 }
    }
  };

  return (
    <motion.div
      className="space-y-8"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {hasImportErrors ? (
        <div className="space-y-4">
          <ImportAlert
            variant="destructive"
            title="Import Failed"
            description="Due to validation errors, none of the activities were imported. Please review the errors below, fix the issues in your file, and try again."
          />
          
          <Card>
            <CardContent className="pt-6">
              <ImportPreviewTable activities={activities} />
            </CardContent>
          </Card>
        </div>
      ) : (
        <motion.div variants={cardVariants}>
          <Card className="w-full max-w-lg mx-auto bg-success/5 border-success/20">
            <CardContent className="pt-8 pb-10 flex flex-col items-center text-center space-y-5">
              <motion.div 
                className="p-4 rounded-full bg-success/10 ring-4 ring-success/20"
                variants={iconContainerVariants}
              >
                <motion.div variants={iconVariants}>
                  <Icons.Check className="h-10 w-10 text-success" />
                </motion.div>
              </motion.div>
              
              <motion.div className="space-y-2" variants={textVariants}>
                <h2 className="text-xl font-semibold text-success/90">Import Successful!</h2>
                <p className="text-sm text-muted-foreground">
                  All <strong className="text-success font-medium">{totalRows}</strong> {totalRows === 1 ? 'activity' : 'activities'} have been successfully added to your account.
                </p>
              </motion.div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      <motion.div 
        className="flex flex-wrap justify-center gap-3 pt-4"
        variants={buttonsVariants}
      >
        {hasImportErrors && (
          <Button variant="outline" onClick={onBack} className="order-1">
            <Icons.ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        )}

        <div className={`flex gap-3 ${hasImportErrors ? 'order-3 ml-auto' : 'order-2'}`}> 
          <Button variant="outline" onClick={startNewImport}>
            <Icons.Import className="mr-2 h-4 w-4" />
            Import Another File
          </Button>

          <Button onClick={goToActivities}>
            <Icons.Activity className="mr-2 h-4 w-4" />
            View All Activities
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
};
