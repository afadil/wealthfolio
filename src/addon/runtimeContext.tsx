import type { AddonContext, SidebarItemHandle } from '@wealthfolio/addon-sdk';
import { Icons } from '@/components/icons';

// Store for dynamically added navigation items
const dynamicNavItems = new Map<string, any>();
const disableCallbacks = new Set<() => void>();

// Store for dynamically added routes
const dynamicRoutes = new Map<string, React.LazyExoticComponent<React.ComponentType<any>>>();

// Navigation update listeners
const navigationUpdateListeners = new Set<() => void>();

const realCtx: AddonContext = {
  sidebar: {
    addItem: (cfg: {
      id: string;
      label: string;
      icon?: string;
      route?: string;
      order?: number;
      onClick?: () => void;
    }): SidebarItemHandle => {
      console.log('Adding sidebar item:', cfg);
      
      // Create navigation item
      const navItem = {
        icon: getIconComponent(cfg.icon),
        title: cfg.label,
        href: cfg.route || '#',
        onClick: cfg.onClick,
        order: cfg.order || 999,
        id: cfg.id,
      };
      
      // Store the navigation item
      dynamicNavItems.set(cfg.id, navItem);
      
      // Notify listeners that navigation has changed
      notifyNavigationUpdate();
      
      return { 
        remove: () => {
          console.log('Removing sidebar item:', cfg.id);
          dynamicNavItems.delete(cfg.id);
          notifyNavigationUpdate();
        }
      };
    }
  },
  router: {
    add: (r: {
      path: string;
      component: React.LazyExoticComponent<React.ComponentType<any>>;
    }): void => {
      console.log('Route registered:', r.path);
      
      // Store the route component
      dynamicRoutes.set(r.path, r.component);
      
      // Notify listeners that routes have changed
      notifyNavigationUpdate();
    }
  },
  onDisable: (cb: () => void): void => {
    console.log('Disable hook registered');
    disableCallbacks.add(cb);
  }
};

// Helper function to get icon component
function getIconComponent(iconName?: string) {
  if (!iconName) {
    return <Icons.Circle className="h-5 w-5" />;
  }
  
  // Map common icon names to available icons
  const iconMap: Record<string, keyof typeof Icons> = {
    'star': 'Goal',
    'chart': 'BarChart', 
    'graph': 'PieChart',
    'bell': 'AlertCircle',
    'dashboard': 'Dashboard',
    'analytics': 'Activity2',
    'alerts': 'AlertTriangle',
    'home': 'Home',
    'settings': 'Settings',
    'users': 'Users',
    'wallet': 'Wallet',
    'performance': 'Performance',
  };
  
  const IconComponent = Icons[iconMap[iconName] || 'Circle'];
  return <IconComponent className="h-5 w-5" />;
}

// Function to notify navigation update listeners
function notifyNavigationUpdate() {
  navigationUpdateListeners.forEach(listener => listener());
}

// Public API for getting dynamic navigation items
export function getDynamicNavItems() {
  return Array.from(dynamicNavItems.values()).sort((a, b) => a.order - b.order);
}

// Public API for getting dynamic routes
export function getDynamicRoutes() {
  return Array.from(dynamicRoutes.entries()).map(([path, component]) => ({
    path,
    component
  }));
}

// Public API for subscribing to navigation updates
export function subscribeToNavigationUpdates(callback: () => void) {
  navigationUpdateListeners.add(callback);
  return () => navigationUpdateListeners.delete(callback);
}

// Public API for triggering all disable callbacks
export function triggerAllDisableCallbacks() {
  disableCallbacks.forEach(cb => {
    try {
      cb();
    } catch (error) {
      console.error('Error in addon disable callback:', error);
    }
  });
  disableCallbacks.clear();
  dynamicNavItems.clear();
  dynamicRoutes.clear();
  notifyNavigationUpdate();
}

export default realCtx; 