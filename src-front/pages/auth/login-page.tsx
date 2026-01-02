import { useAuth } from "@/context/auth-context";
import {
  ApplicationShell,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
} from "@wealthfolio/ui";
import { FormEvent, useState } from "react";

export function LoginPage() {
  const { login, loginLoading, loginError, clearError } = useAuth();
  const [password, setPassword] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!password.trim()) {
      return;
    }
    try {
      await login(password);
      setPassword("");
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  return (
    <ApplicationShell className="fixed inset-0 flex items-center justify-center p-6">
      <div className="w-full max-w-md -translate-y-[5vh]">
        <Card className="w-full border-none bg-transparent shadow-none">
          <CardHeader className="space-y-4 text-center">
            <div className="flex justify-center">
              <img
                src="/logo-vantage.png"
                alt="Wealthfolio logo vantage"
                className="h-16 w-16 sm:h-20 sm:w-20"
              />
            </div>
            <div className="space-y-2">
              <CardTitle>Wealthfolio</CardTitle>
              <CardDescription>Your private portfolio tracker.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form className="space-y-8" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Input
                  id="password"
                  type="password"
                  value={password}
                  autoComplete="current-password"
                  onChange={(event) => {
                    if (loginError) {
                      clearError();
                    }
                    setPassword(event.target.value);
                  }}
                  disabled={loginLoading}
                  required
                  placeholder="Enter your password"
                  className="h-12 rounded-full shadow-none"
                />
                {loginError ? (
                  <p className="text-destructive text-sm" role="alert">
                    {loginError}
                  </p>
                ) : null}
              </div>

              <Button type="submit" className="w-full" disabled={loginLoading}>
                {loginLoading ? "Signing in..." : "Sign In"}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="text-muted-foreground flex flex-col gap-2 text-center text-xs"></CardFooter>
        </Card>
      </div>
    </ApplicationShell>
  );
}
