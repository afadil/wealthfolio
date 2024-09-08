export const isDesktop = () => {
    return !!window.__TAURI__;
}

export const invokeTauri = async (command: string, payload?: Record<string, unknown>) => {
    const invoke = await import('@tauri-apps/api').then((mod) => mod.invoke);
    return await invoke(command, payload);
}
