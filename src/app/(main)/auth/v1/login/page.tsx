

import { LoginForm } from "../../_components/login-form";

export default function LoginV1() {
  return (
    <div className="flex h-dvh">
      <div className="hidden bg-primary lg:block lg:w-1/3">
        <div className="flex h-full flex-col items-center justify-center p-12 text-center">
          <div className="space-y-8 flex flex-col items-center text-center">
            <div className="rounded-xl bg-white/95 p-6 shadow-sm">
              <img src="/ve-logo-horizontal.svg" alt="Vision Empower" className="h-16 w-auto object-contain" />
            </div>
            <div className="space-y-2">
              <h1 className="font-light text-4xl text-primary-foreground">Project Intelligence Platform</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="flex w-full items-center justify-center bg-background p-8 lg:w-2/3">
        <div className="w-full max-w-md space-y-10 py-24 lg:py-32">
          <div className="space-y-4 text-center">
            <div className="font-medium tracking-tight">Login</div>
            <div className="mx-auto max-w-xl text-muted-foreground">
              Enter the Vision Empower email and password created by your administrator.
            </div>
          </div>
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
