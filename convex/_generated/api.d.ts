/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as access from "../access.js";
import type * as admin from "../admin.js";
import type * as aiAnalysis from "../aiAnalysis.js";
import type * as aiEntities from "../aiEntities.js";
import type * as aiIngest from "../aiIngest.js";
import type * as aiIngestNode from "../aiIngestNode.js";
import type * as aiProactive from "../aiProactive.js";
import type * as aiSearch from "../aiSearch.js";
import type * as alertsInternal from "../alertsInternal.js";
import type * as auth from "../auth.js";
import type * as crons from "../crons.js";
import type * as files from "../files.js";
import type * as finance from "../finance.js";
import type * as funds from "../funds.js";
import type * as http from "../http.js";
import type * as impact from "../impact.js";
import type * as milestones from "../milestones.js";
import type * as operations from "../operations.js";
import type * as people from "../people.js";
import type * as projects from "../projects.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  access: typeof access;
  admin: typeof admin;
  aiAnalysis: typeof aiAnalysis;
  aiEntities: typeof aiEntities;
  aiIngest: typeof aiIngest;
  aiIngestNode: typeof aiIngestNode;
  aiProactive: typeof aiProactive;
  aiSearch: typeof aiSearch;
  alertsInternal: typeof alertsInternal;
  auth: typeof auth;
  crons: typeof crons;
  files: typeof files;
  finance: typeof finance;
  funds: typeof funds;
  http: typeof http;
  impact: typeof impact;
  milestones: typeof milestones;
  operations: typeof operations;
  people: typeof people;
  projects: typeof projects;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
};
