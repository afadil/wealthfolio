import React from 'react';

/**
 * Core types for addon development
 */

/**
 * Handle returned from sidebar item creation
 */
export interface SidebarItemHandle {
  /** Remove the sidebar item */
  remove(): void;
}

/**
 * Configuration for adding a sidebar item
 */
export interface SidebarItemConfig {
  /** Unique identifier for the sidebar item */
  id: string;
  /** Display text for the sidebar item */
  label: string;
  /** Optional icon name or React component */
  icon?: string | React.ReactNode;
  /** Optional route to navigate to when clicked */
  route?: string;
  /** Optional ordering priority (lower numbers appear first) */
  order?: number;
  /** Optional click handler (if no route provided) */
  onClick?: () => void;
}

/**
 * Configuration for adding a route
 */
export interface RouteConfig {
  /** Route path pattern */
  path: string;
  /** Lazy-loaded React component */
  component: React.LazyExoticComponent<React.ComponentType<any>>;
}

/**
 * Sidebar management interface
 */
export interface SidebarManager {
  /**
   * Add an item to the application sidebar
   * @param config Configuration for the sidebar item
   * @returns Handle to remove the item
   */
  addItem(config: SidebarItemConfig): SidebarItemHandle;
}

/**
 * Router management interface
 */
export interface RouterManager {
  /**
   * Register a new route in the application
   * @param route Route configuration
   */
  add(route: RouteConfig): void;
}

/**
 * Main addon context interface providing access to Wealthfolio APIs
 */
export interface AddonContext {
  /** Sidebar management */
  sidebar: SidebarManager;
  /** Router management */
  router: RouterManager;
  /** Register a callback for addon cleanup */
  onDisable(callback: () => void): void;
}

/**
 * Addon enable function signature
 */
export type AddonEnableFunction = (context: AddonContext) => void | { disable?: () => void };

/**
 * Global context declaration for addons
 */
declare global {
  var __WF_CTX__: AddonContext;
}
