import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import MarketDataSettingsPage from './market-data-settings';
import React from 'react';

// Mock Tauri's invoke function
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

// Mock sonner's toast function
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    message: vi.fn(), // Added for completeness if used
  },
}));

// Mock lucide-react icons
vi.mock('lucide-react', async (importOriginal) => {
  const original = await importOriginal() as any; // Cast to any to avoid type issues with mock
  return {
    ...original,
    EyeIcon: (props: any) => <svg data-testid="eye-icon" {...props} />,
    EyeOffIcon: (props: any) => <svg data-testid="eye-off-icon" {...props} />,
  };
});

// Mock @/components/icons
vi.mock('@/components/icons', () => ({
  Icons: {
    Save: (props: any) => <div data-testid="save-icon" {...props}>SaveIcon</div>, // Use div for simplicity
    // Add other icons if necessary for rendering without errors
    Spinner: (props: any) => <div data-testid="spinner-icon" {...props}>Spinner</div>,
  },
}));

const mockInvoke = vi.mocked(require('@tauri-apps/api/core').invoke);
const mockToast = vi.mocked(require('sonner').toast);

const mockProviderYahoo = {
  id: 'yahoo',
  name: 'Yahoo Finance',
  apiKeyVaultPath: null,
  priority: 1,
  enabled: true,
  logoFilename: 'yahoo-finance.png',
};

const mockProviderMarketDataApp = {
  id: 'marketdata_app',
  name: 'MarketData.app',
  apiKeyVaultPath: 'some/vault/path/marketdata_app',
  priority: 2,
  enabled: false,
  logoFilename: 'marketdata-app.png',
};

const mockProviders = [mockProviderYahoo, mockProviderMarketDataApp];

describe('MarketDataSettingsPage', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockToast.success.mockReset();
    mockToast.error.mockReset();
  });

  it('shows loading state initially', () => {
    mockInvoke.mockReturnValue(new Promise(() => {})); // Keep promise pending
    render(<MarketDataSettingsPage />);
    expect(screen.getByText('Loading provider settings...')).toBeInTheDocument();
  });

  it('displays error message if fetching fails', async () => {
    mockInvoke.mockRejectedValue(new Error('Fetch failed'));
    render(<MarketDataSettingsPage />);
    await waitFor(() => {
      expect(screen.getByText('Error loading settings: Fetch failed')).toBeInTheDocument();
    });
    expect(mockToast.error).toHaveBeenCalledWith('Failed to load provider settings: Fetch failed');
  });

  it('displays "no providers" message if fetch returns empty array', async () => {
    mockInvoke.mockResolvedValue([]);
    render(<MarketDataSettingsPage />);
    await waitFor(() => {
      expect(screen.getByText('No market data providers configured. This might be an initialization issue.')).toBeInTheDocument();
    });
  });

  describe('when data is successfully fetched', () => {
    beforeEach(() => {
      mockInvoke.mockResolvedValue([...mockProviders]); // Return a copy
    });

    it('renders provider information correctly', async () => {
      render(<MarketDataSettingsPage />);
      await waitFor(() => {
        expect(screen.getByText('Yahoo Finance')).toBeInTheDocument();
        expect(screen.getByText('MarketData.app')).toBeInTheDocument();
      });

      const yahooLogo = screen.getByAltText('Yahoo Finance logo') as HTMLImageElement;
      expect(yahooLogo.src).toContain('/market-data/yahoo-finance.png');

      // Check initial state of controls for Yahoo
      const yahooEnableSwitch = screen.getByLabelText('Enable Provider', { selector: `button[id="enabled-yahoo"]` });
      expect(yahooEnableSwitch).toBeChecked();
      
      const yahooApiKeyInput = screen.getByLabelText('API Key', { selector: `input[id="apikey-yahoo"]` });
      expect(yahooApiKeyInput).toHaveAttribute('placeholder', 'Enter API Key'); // No key set for Yahoo

      const yahooPriorityInput = screen.getByLabelText('Priority', { selector: `input[id="priority-yahoo"]` });
      expect(yahooPriorityInput).toHaveValue(mockProviderYahoo.priority);

      // Check initial state of controls for MarketData.app
      const mdaEnableSwitch = screen.getByLabelText('Enable Provider', { selector: `button[id="enabled-marketdata_app"]` });
      expect(mdaEnableSwitch).not.toBeChecked();
      
      const mdaApiKeyInput = screen.getByLabelText('API Key', { selector: `input[id="apikey-marketdata_app"]` });
      expect(mdaApiKeyInput).toHaveAttribute('placeholder', 'API Key is Set'); // Key is set for MarketData.app
      
      const mdaPriorityInput = screen.getByLabelText('Priority', { selector: `input[id="priority-marketdata_app"]` });
      expect(mdaPriorityInput).toHaveValue(mockProviderMarketDataApp.priority);
    });

    it('toggles "enabled" switch and calls update command', async () => {
      mockInvoke.mockResolvedValueOnce([...mockProviders]); // Initial fetch
      mockInvoke.mockResolvedValueOnce({}); // For the update call

      render(<MarketDataSettingsPage />);
      await waitFor(() => expect(screen.getByText('Yahoo Finance')).toBeInTheDocument());

      const yahooEnableSwitch = screen.getByLabelText('Enable Provider', { selector: `button[id="enabled-yahoo"]` });
      expect(yahooEnableSwitch).toBeChecked(); // Initial state

      await act(async () => {
        fireEvent.click(yahooEnableSwitch);
      });
      
      expect(mockInvoke).toHaveBeenCalledWith('update_market_data_provider_settings', {
        providerId: 'yahoo',
        apiKey: undefined, // Not changing API key in this interaction
        priority: mockProviderYahoo.priority,
        enabled: false, // New state
      });
      expect(mockToast.success).toHaveBeenCalledWith('Yahoo Finance settings updated successfully.');
    });

    it('updates API key input, saves, and calls update command', async () => {
      mockInvoke.mockResolvedValueOnce([...mockProviders]); // Initial fetch
      mockInvoke.mockResolvedValueOnce({}); // For the update call

      render(<MarketDataSettingsPage />);
      await waitFor(() => expect(screen.getByText('Yahoo Finance')).toBeInTheDocument());
      
      const yahooApiKeyInput = screen.getByLabelText('API Key', { selector: `input[id="apikey-yahoo"]` });
      const yahooSaveKeyButton = screen.getAllByTestId('save-icon').find(el => el.closest('button')?.previousElementSibling?.id === 'apikey-yahoo')?.closest('button');
      
      expect(yahooSaveKeyButton).toBeInTheDocument();

      await act(async () => {
        fireEvent.change(yahooApiKeyInput, { target: { value: 'new_yahoo_key' } });
      });
      expect(yahooApiKeyInput).toHaveValue('new_yahoo_key');

      await act(async () => {
        fireEvent.click(yahooSaveKeyButton!);
      });

      expect(mockInvoke).toHaveBeenCalledWith('update_market_data_provider_settings', {
        providerId: 'yahoo',
        apiKey: 'new_yahoo_key',
        priority: mockProviderYahoo.priority,
        enabled: mockProviderYahoo.enabled,
      });
      expect(mockToast.success).toHaveBeenCalledWith('Yahoo Finance settings updated successfully.');
      // Input field should be cleared after save attempt
      await waitFor(() => expect(yahooApiKeyInput).toHaveValue(''));
    });
    
    it('clears an existing API key by saving an empty string', async () => {
      mockInvoke.mockResolvedValueOnce([...mockProviders]); // Initial fetch
      mockInvoke.mockResolvedValueOnce({}); // For the update call

      render(<MarketDataSettingsPage />);
      await waitFor(() => expect(screen.getByText('MarketData.app')).toBeInTheDocument());

      const mdaApiKeyInput = screen.getByLabelText('API Key', { selector: `input[id="apikey-marketdata_app"]` });
      // Placeholder indicates key is set
      expect(mdaApiKeyInput).toHaveAttribute('placeholder', 'API Key is Set'); 
      
      const mdaSaveKeyButton = screen.getAllByTestId('save-icon').find(el => el.closest('button')?.previousElementSibling?.id === 'apikey-marketdata_app')?.closest('button');
      expect(mdaSaveKeyButton).toBeInTheDocument();

      // User types nothing (or deletes existing text), effectively an empty string for clearing
      await act(async () => {
        fireEvent.change(mdaApiKeyInput, { target: { value: '' } });
      });
      expect(mdaApiKeyInput).toHaveValue('');

      await act(async () => {
        fireEvent.click(mdaSaveKeyButton!);
      });
      
      expect(mockInvoke).toHaveBeenCalledWith('update_market_data_provider_settings', {
        providerId: 'marketdata_app',
        apiKey: null, // Empty string input should translate to null for clearing
        priority: mockProviderMarketDataApp.priority,
        enabled: mockProviderMarketDataApp.enabled,
      });
      expect(mockToast.success).toHaveBeenCalledWith('MarketData.app settings updated successfully.');
    });

    it('toggles API key visibility', async () => {
      render(<MarketDataSettingsPage />);
      await waitFor(() => expect(screen.getByText('Yahoo Finance')).toBeInTheDocument());

      const yahooApiKeyInput = screen.getByLabelText('API Key', { selector: `input[id="apikey-yahoo"]` });
      expect(yahooApiKeyInput).toHaveAttribute('type', 'password');

      const visibilityButton = yahooApiKeyInput.parentElement!.querySelector('button[aria-label="Show API key"]');
      expect(visibilityButton).toBeInTheDocument();
      expect(screen.getByTestId('eye-icon')).toBeInTheDocument();


      await act(async () => {
        fireEvent.click(visibilityButton!);
      });
      expect(yahooApiKeyInput).toHaveAttribute('type', 'text');
      expect(screen.getByTestId('eye-off-icon')).toBeInTheDocument();
      
      await act(async () => {
        fireEvent.click(visibilityButton!);
      });
      expect(yahooApiKeyInput).toHaveAttribute('type', 'password');
      expect(screen.getByTestId('eye-icon')).toBeInTheDocument();
    });

    it('updates priority on blur and calls update command', async () => {
      mockInvoke.mockResolvedValueOnce([...mockProviders]); // Initial fetch
      mockInvoke.mockResolvedValueOnce({}); // For the update call

      render(<MarketDataSettingsPage />);
      await waitFor(() => expect(screen.getByText('Yahoo Finance')).toBeInTheDocument());

      const yahooPriorityInput = screen.getByLabelText('Priority', { selector: `input[id="priority-yahoo"]` }) as HTMLInputElement;
      expect(yahooPriorityInput).toHaveValue(mockProviderYahoo.priority);

      await act(async () => {
        fireEvent.change(yahooPriorityInput, { target: { value: '5' } });
      });
      // Local state for input field might update before blur
      expect(yahooPriorityInput).toHaveValue(5); 

      await act(async () => {
        fireEvent.blur(yahooPriorityInput);
      });

      expect(mockInvoke).toHaveBeenCalledWith('update_market_data_provider_settings', {
        providerId: 'yahoo',
        apiKey: undefined, // Not changing API key
        priority: 5, // New priority
        enabled: mockProviderYahoo.enabled,
      });
      expect(mockToast.success).toHaveBeenCalledWith('Yahoo Finance settings updated successfully.');
    });
  });
});
