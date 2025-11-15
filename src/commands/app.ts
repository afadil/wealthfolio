import { getRunEnv, invokeTauri, invokeWeb, logger, RUN_ENV } from "@/adapters";

export interface AppInfo {
  version: string;
  dbPath: string;
  logsDir: string;
}

export const getAppInfo = async (): Promise<AppInfo> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("get_app_info");
      case RUN_ENV.WEB:
        return invokeWeb("get_app_info");
      default:
        throw new Error("Unsupported environment");
    }
  } catch (error) {
    logger.error("Error fetching app info");
    console.error(error);
    return {
      version: "",
      dbPath: "",
      logsDir: "",
    };
  }
};
