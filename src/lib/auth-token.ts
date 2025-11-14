const AUTH_TOKEN_KEY = "wealthfolio_auth_token";

let authToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

// Initialize from localStorage if available
if (typeof window !== "undefined") {
  authToken = localStorage.getItem(AUTH_TOKEN_KEY);
}

export const setAuthToken = (token: string | null) => {
  authToken = token;
  if (typeof window !== "undefined") {
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY);
    }
  }
};

export const getAuthToken = () => authToken;

export const setUnauthorizedHandler = (handler: (() => void) | null) => {
  unauthorizedHandler = handler;
};

export const notifyUnauthorized = () => {
  if (unauthorizedHandler) {
    unauthorizedHandler();
  }
};
