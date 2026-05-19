import packageJson from "../../package.json";

const currentYear = new Date().getFullYear();

export const APP_CONFIG = {
  name: "Project Intelligence Platform",
  version: packageJson.version,
  copyright: `Copyright ${currentYear}, Vision Empower.`,
  meta: {
    title: "Project Intelligence Platform - Vision Empower",
    description:
      "Internal project command center for Vision Empower grants, deliverables, activities, financials, reports, and leadership alerts.",
  },
};
