import { useEffect } from "react";

import { useAssetLogoIndex } from "@/hooks/use-asset-logos";
import { assetLogoRegistry } from "@/lib/asset-logo-registry";

/**
 * Feeds the custom-logo index from react-query into the module registry that
 * `TickerAvatar` reads synchronously. Renders nothing. Mount once, inside the
 * authenticated tree (the index lists the user's assets).
 */
export function AssetLogoRegistrySync() {
  const { data } = useAssetLogoIndex();

  useEffect(() => {
    if (data) assetLogoRegistry.setIndex(data);
  }, [data]);

  useEffect(() => () => assetLogoRegistry.reset(), []);

  return null;
}
