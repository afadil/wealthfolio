import { Icons } from "@wealthfolio/ui";
import { useTranslation } from "react-i18next";
import { ProfileAvatar } from "./profile-avatar";
import { useProfile } from "./profile-context";

interface MobileProfileMenuProps {
  onAction: () => void;
}

export function MobileProfileMenu({ onAction }: MobileProfileMenuProps) {
  const { t } = useTranslation("common");
  const context = useProfile();
  if (!context?.profile) return null;
  const { profile, profiles, selectProfile, manageProfile, addProfile, lockProfile } = context;
  const runAction = (action: () => void) => {
    onAction();
    action();
  };
  const rowClassName =
    "hover:bg-muted flex min-h-16 w-full items-center gap-4 rounded-lg py-3 text-left text-base font-medium";

  return (
    <div className="divide-border/70 divide-y">
      <div className="pb-3">
        {profiles.map((item) => (
          <button
            key={item.id}
            type="button"
            className={rowClassName}
            aria-pressed={item.id === profile.id}
            onClick={() => {
              if (item.id !== profile.id) runAction(() => selectProfile(item.id));
            }}
          >
            <ProfileAvatar id={item.avatarId} className="mx-0 size-9 shrink-0 rounded-full" />
            <span className="min-w-0 flex-1 truncate">{item.name}</span>
            {item.id === profile.id ? (
              <Icons.Check className="text-primary size-5 shrink-0" />
            ) : item.lockEnabled ? (
              <Icons.Lock className="text-muted-foreground size-5 shrink-0" />
            ) : null}
          </button>
        ))}
      </div>
      <div className="py-3">
        <button type="button" className={rowClassName} onClick={() => runAction(manageProfile)}>
          <Icons.User className="size-6 shrink-0" />
          {t("profiles.settings")}
        </button>
        <button type="button" className={rowClassName} onClick={() => runAction(addProfile)}>
          <Icons.Plus className="size-6 shrink-0" />
          {t("profiles.add")}
        </button>
      </div>
      {profile.lockEnabled && (
        <button type="button" className={rowClassName} onClick={() => runAction(lockProfile)}>
          <Icons.Lock className="size-6 shrink-0" />
          {t("profiles.lock")}
        </button>
      )}
    </div>
  );
}
