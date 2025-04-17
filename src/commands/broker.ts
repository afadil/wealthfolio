import { getRunEnv, RUN_ENV, invokeTauri } from '@/adapters';
import { logger } from '@/adapters';

export const syncBrokers = async (): Promise<void> => {
    try {
        switch (getRunEnv()) {
            case RUN_ENV.DESKTOP:
                await invokeTauri('sync_all_accounts');
                return;
            default: 
                throw new Error('Unsupported');
        }
    } catch (error) {
        logger.error('Error syncing brokers.');
        throw error;
    }
};
