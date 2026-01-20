// Secrets Commands
import { invoke } from "./platform";

export const setSecret = async (secretKey: string, secret: string): Promise<void> => {
  return invoke<void>("set_secret", { secretKey, secret });
};

export const getSecret = async (secretKey: string): Promise<string | null> => {
  return invoke<string | null>("get_secret", { secretKey });
};

export const deleteSecret = async (secretKey: string): Promise<void> => {
  return invoke<void>("delete_secret", { secretKey });
};
