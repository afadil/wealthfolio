import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Icons } from "@/components/ui/icons"
import { motion, AnimatePresence } from 'framer-motion';

interface FileDropzoneProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
  isLoading?: boolean;
  accept?: string;
  isValid?: boolean;
  error?: string | null;
}

export const FileDropzone = ({
  file,
  onFileChange,
  isLoading = false,
  accept = '*',
  isValid = true,
  error = null,
}: FileDropzoneProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileChange(e.target.files[0]);
    }
  };

  const handleClick = () => {
    if (!file && !isLoading) {
      fileInputRef.current?.click();
    }
  };

  const handleRemoveFile = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering the parent div's click handler
    onFileChange(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Determine the border and background colors based on state
  const getBorderClasses = () => {
    if (isDragging) {
      return 'border-primary bg-primary/5';
    }

    if (file) {
      if (isLoading) {
        return 'border-blue-500 bg-blue-50 dark:bg-blue-900/10';
      }
      if (!isValid || error) {
        return 'border-red-500 bg-red-50 dark:bg-red-900/10';
      }
      return 'border-green-500 bg-green-50 dark:bg-green-900/10';
    }

    return 'border-border bg-background/50 hover:bg-background/80 hover:border-muted-foreground/50';
  };

  // Animation variants for icon containers
  const iconContainerVariants = {
    initial: {
      scale: 0.8,
      opacity: 0,
      rotate: -10,
    },
    animate: {
      scale: 1,
      opacity: 1,
      rotate: 0,
      transition: {
        type: 'spring',
        stiffness: 260,
        damping: 20,
        duration: 0.5,
      },
    },
    exit: {
      scale: 0.8,
      opacity: 0,
      rotate: 10,
      transition: { duration: 0.3 },
    },
  };

  // Animation variants for icons
  const iconVariants = {
    initial: { scale: 0.6, opacity: 0 },
    animate: {
      scale: 1,
      opacity: 1,
      transition: {
        delay: 0.1,
        type: 'spring',
        stiffness: 300,
      },
    },
  };

  return (
    <div
      className={`group relative flex h-full flex-col justify-center rounded-lg border border-dashed p-4 transition-colors ${getBorderClasses()} ${!file && !isLoading ? 'cursor-pointer' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        className="hidden"
        accept={accept}
        disabled={isLoading}
      />

      {file && !isLoading && (
        <div
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/90 opacity-0 transition-opacity duration-200 group-hover:pointer-events-auto group-hover:opacity-90 dark:bg-background/95"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col items-center gap-3">
            <Button
              size="sm"
              onClick={handleRemoveFile}
              className="flex items-center gap-1.5 px-3"
            >
              <Icons.Trash className="h-4 w-4" />
              <span>Remove File</span>
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col items-center justify-center space-y-2">
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div
              key="loading"
              variants={iconContainerVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 shadow-sm dark:bg-blue-900/20"
            >
              <motion.div variants={iconVariants} initial="initial" animate="animate">
                <Icons.Spinner className="h-5 w-5 animate-spin text-blue-600 dark:text-blue-400" />
              </motion.div>
            </motion.div>
          ) : file && (!isValid || error) ? (
            <motion.div
              key="error"
              variants={iconContainerVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 shadow-sm dark:bg-red-900/20"
            >
              <motion.div variants={iconVariants} initial="initial" animate="animate">
                <Icons.AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </motion.div>
            </motion.div>
          ) : file ? (
            <motion.div
              key="file"
              variants={iconContainerVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 shadow-sm dark:bg-green-900/20"
            >
              <motion.div variants={iconVariants} initial="initial" animate="animate">
                {isValid ? (
                  <Icons.CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                ) : (
                  <Icons.FileText className="h-5 w-5 text-green-600 dark:text-green-400" />
                )}
              </motion.div>
            </motion.div>
          ) : (
            <motion.div
              key="upload"
              variants={iconContainerVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-muted shadow-sm"
            >
              <motion.div variants={iconVariants} initial="initial" animate="animate">
                <Icons.Import className="h-5 w-5 text-muted-foreground" />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="space-y-0.5 text-center">
          <AnimatePresence mode="wait">
            {isLoading ? (
              <motion.p
                key="loading-text"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.2 }}
                className="text-xs font-medium"
              >
                Processing file...
              </motion.p>
            ) : file && (!isValid || error) ? (
              <motion.div
                key="error-info"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.2 }}
                className="space-y-0"
              >
                <p className="font-medium text-red-600 dark:text-red-400">{file.name}</p>
                <p className="text-xs text-red-500 dark:text-red-400">
                  {(file.size / 1024).toFixed(2)} KB
                </p>
              </motion.div>
            ) : file ? (
              <motion.div
                key="file-info"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.2 }}
                className="space-y-0"
              >
                <p className="text-xs font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(2)} KB</p>
              </motion.div>
            ) : (
              <motion.div
                key="upload-text"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.2 }}
              >
                <p className="text-xs font-medium">
                  <span className="text-primary">Click to upload</span> or drop
                </p>
                <p className="text-xs text-muted-foreground">CSV only</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};
