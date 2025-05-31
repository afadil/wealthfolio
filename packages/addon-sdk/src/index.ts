export interface SidebarItemHandle {
  remove(): void;
}

export interface AddonContext {
  sidebar: {
    addItem(cfg: {
      id: string;
      label: string;
      icon?: string;
      route?: string;
      order?: number;
      onClick?: () => void;
    }): SidebarItemHandle;
  };
  router: {
    add(r: {
      path: string;
      component: React.LazyExoticComponent<React.ComponentType<any>>;
    }): void;
  };
  onDisable(cb: () => void): void;
}

declare global {
  var __WF_CTX__: AddonContext;
}

const ctx = (globalThis as any).__WF_CTX__ as AddonContext;
export default ctx; 