import { DropzoneRootProps, DropzoneInputProps } from 'react-dropzone';
import { cn } from '@/lib/utils';
import { Icons } from '@/components/icons';

interface FileDropzoneProps {
  getRootProps: (props?: DropzoneRootProps) => DropzoneRootProps;
  getInputProps: () => DropzoneInputProps;
  isDragActive: boolean;
  selectedFile: File | null;
  isLoading: boolean;
  openFilePicker: () => void;
}

export function FileDropzone({
  getRootProps,
  getInputProps,
  isDragActive,
  selectedFile,
  isLoading,
  openFilePicker,
}: FileDropzoneProps) {
  return (
    <div
      {...getRootProps()}
      className={cn(
        'mb-4 cursor-pointer rounded-md border border-dashed p-8 text-center animate-in fade-in-50',
        isDragActive && 'bg-success/10',
      )}
    >
      <input {...getInputProps()} />
      <div className="flex h-[50px]" onClick={openFilePicker}>
        <div className="flex items-center">
          <div className="mr-4 flex-shrink-0 rounded-full bg-secondary p-6">
            {selectedFile ? (
              isLoading ? (
                <Icons.Spinner className="h-8 w-8 animate-spin" />
              ) : (
                <Icons.FileText className="h-8 w-8" />
              )
            ) : (
              <Icons.Import className="h-8 w-8" />
            )}
          </div>
          <div className="flex flex-col text-left">
            {selectedFile ? (
              <>
                <p className="text-base font-semibold">{selectedFile.name}</p>
                <p className="text-sm text-gray-500">{(selectedFile.size / 1024).toFixed(2)} KB</p>
              </>
            ) : (
              <>
                <p className="text-lg font-semibold">
                  {isDragActive ? 'Drop the CSV file here' : 'Drag and drop your CSV file here'}
                </p>
                <p className="text-sm text-gray-500">Or click here to choose a file.</p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
