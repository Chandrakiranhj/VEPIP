import { v } from "convex/values";
import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { createAuthMiddleware, APIError } from "better-auth/api";
import { betterAuth } from "better-auth/minimal";

import { api, components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import authConfig from "./auth.config";
import { normalizeEmail } from "./access";

export const VE_EMAIL_DOMAIN = "visionempowertrust.org";

const siteUrl = 
  process.env.SITE_URL || 
  process.env.NEXT_PUBLIC_SITE_URL || 
  process.env.NEXT_PUBLIC_CONVEX_SITE_URL || 
  "http://localhost:3000";

function isNonEmptyString(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}

const trustedOrigins = Array.from(
  new Set(
    [
      siteUrl,
      process.env.NEXT_PUBLIC_SITE_URL,
      ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    ].filter(isNonEmptyString),
  ),
);

export const SUPER_ADMIN_EMAIL = "chandrakiran@visionempowertrust.org";
const superAdminInitialPassword = process.env.SUPERADMIN_INITIAL_PASSWORD;

export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  return betterAuth({
    baseURL: siteUrl,
    trustedOrigins,
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    hooks: {
      before: createAuthMiddleware(async (hookCtx) => {
        const path = hookCtx.path;
        
        if (path !== "/sign-up/email" && path !== "/sign-in/email") {
          return;
        }

        const email = normalizeEmail(String(hookCtx.body?.email ?? ""));
        const password = String(hookCtx.body?.password ?? "");
        
        // 1. Domain Check
        if (!email.endsWith(`@${VE_EMAIL_DOMAIN}`)) {
          throw new APIError("BAD_REQUEST", {
            message: `Use your @${VE_EMAIL_DOMAIN} email address.`,
          });
        }

        // 2. Superadmin Bypass for sign-up (bootstrap)
        if (path === "/sign-up/email" && email === SUPER_ADMIN_EMAIL) {
          if (superAdminInitialPassword && password !== superAdminInitialPassword) {
            throw new APIError("FORBIDDEN", {
              message: "Invalid superadmin bootstrap password.",
            });
          }
          return;
        }

        // 3. Managed User Check
        // Note: Better Auth runs in an Action context, so we must use runQuery
        const person = await ctx.runQuery(api.auth.getInternalPerson, { email });

        if (!person) {
          throw new APIError("FORBIDDEN", {
            message: "Access restricted. Please ask an administrator to add you to the platform first.",
          });
        }

        // 4. JIT Account Creation (Admin-set password flow)
        if (path === "/sign-in/email") {
          if (email === SUPER_ADMIN_EMAIL && !person && superAdminInitialPassword && password === superAdminInitialPassword) {
            await createAuth(ctx).api.signUpEmail({
              body: {
                email,
                password,
                name: "Chandrakiran",
              },
            });
            return;
          }

          // Check if better-auth account is already linked to this person
          if (!person.authUserId && person.tempPassword && person.tempPassword === password) {
            // Create the account transparently
            await createAuth(ctx).api.signUpEmail({
              body: {
                email,
                password,
                name: person.name,
              },
            });
            
            // Clear temp password now that it's linked
            await (ctx as any).runMutation(api.auth.clearTempPassword, { email });
            
            // The sign-in will now proceed normally because the account was just created
          }
        }

        // 5. Block standard signup (only allow JIT, Superadmin, or pre-added users)
        if (path === "/sign-up/email") {
          if (email === SUPER_ADMIN_EMAIL) return;
          
          if (person) {
            // Pre-added by admin, allow signup (likely via JIT flow above)
            return;
          }

          throw new APIError("FORBIDDEN", {
            message: "Manual sign-up is disabled. Please ask an administrator to add you to the platform first.",
          });
        }
      }),
    },
    plugins: [convex({ authConfig })],
  });
};

export const getInternalPerson = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return ctx.db.query("people").withIndex("by_email", (q) => q.eq("email", args.email)).unique();
  },
});

export const clearTempPassword = mutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const person = await ctx.db.query("people").withIndex("by_email", (q) => q.eq("email", args.email)).unique();
    if (person) {
      await ctx.db.patch(person._id, { tempPassword: undefined });
    }
  },
});

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return authComponent.safeGetAuthUser(ctx);
  },
});
