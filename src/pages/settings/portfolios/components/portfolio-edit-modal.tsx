import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useIsMobileViewport } from '@/hooks/use-platform';
import type { Portfolio } from '@/lib/types';
import { PortfolioForm } from './portfolio-form';

export interface PortfolioEditModalProps {
  portfolio?: Portfolio;
  open?: boolean;
  onClose?: () => void;
}

export function PortfolioEditModal({ portfolio, open, onClose }: PortfolioEditModalProps) {
  const defaultValues = {
    id: portfolio?.id ?? undefined,
    name: portfolio?.name ?? '',
    accountIds: portfolio?.accountIds ?? [],
  };

  return (
    <Dialog open={open} onOpenChange={onClose} useIsMobile={useIsMobileViewport}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[625px]">
        <PortfolioForm defaultValues={defaultValues} onSuccess={onClose} />
      </DialogContent>
    </Dialog>
  );
}
