"use client";

import { useState } from "react";
import { Copy, Check, Sparkles, ExternalLink, Palette, FileText, Info } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";

interface InfographicPromptDialogProps {
  project: any;
  milestones: any[];
  trigger?: React.ReactNode;
}

interface StylePreset {
  id: string;
  name: string;
  colors: string;
  description: string;
  bgDesc: string;
  paletteDesc: string;
  fontDesc: string;
  elementStyle: string;
}

const presets: StylePreset[] = [
  {
    id: "sleek-corporate",
    name: "Sleek Corporate",
    colors: "Teal, Slate Grey, and Crisp White",
    description: "Professional, clean corporate report style with tech accents.",
    bgDesc: "Clean off-white (#F8FAFC) background",
    paletteDesc: "Deep slate grey (#1E293B) for structure/major text, professional teal (#0D9488) for key highlights and accents, and white (#FFFFFF) for section cards.",
    fontDesc: "Elegant, crisp sans-serif font (like Inter or Helvetica)",
    elementStyle: "Ultra-clean thin vector borders, rounded corners, subtle flat card indicators, high-contrast typography hierarchy.",
  },
  {
    id: "earthy-minimalist",
    name: "Earthy Minimalist",
    colors: "Sage Green, Terracotta, and Warm Cream",
    description: "Organic, warm aesthetic for community-driven non-profits.",
    bgDesc: "Soft, warm cream (#FAF9F6) background",
    paletteDesc: "Earthy charcoal (#2D2A26) for readability, gentle sage green (#2F5233) for primary indicators/progress, and warm terracotta clay (#C05C3E) for key action callouts.",
    fontDesc: "Modern, slightly rounded sans-serif font (like Outfit or Lexend)",
    elementStyle: "Organic shapes, soft hand-drawn-style vector lines, solid flat shapes with no complex gradients, generous white space.",
  },
  {
    id: "high-impact",
    name: "High-Impact Bold",
    colors: "Indigo, Coral, and Ice Grey",
    description: "Vibrant and dynamic design suited for modern digital views.",
    bgDesc: "Cool pale grey (#F3F4F6) background",
    paletteDesc: "Deep navy indigo (#312E81) for structure, vibrant coral (#F43F5E) for major highlight text/icons, and cool white (#FFFFFF) for layout borders.",
    fontDesc: "Bold, modern geometric sans-serif font (like Montserrat or Product Sans)",
    elementStyle: "Bold strokes, clean grids, high contrast color blocking, micro shadow elevations, circular progress rings and clean block charts.",
  },
  {
    id: "pastel-candy",
    name: "Pastel Candy",
    colors: "Sky Blue, Mint, and Light Lavender",
    description: "Friendly, soft style representing education and inclusive learning.",
    bgDesc: "Soft white/cream (#FDFDFD) background",
    paletteDesc: "Charcoal Slate (#334155) for all text to ensure readability, pastel sky blue (#E0F2FE) and light mint green (#ECFDF5) for card backgrounds, with soft lavender (#F3E8FF) accents.",
    fontDesc: "Friendly, highly legible rounded sans-serif (like Quicksand or Nunito)",
    elementStyle: "Soft pill-shaped badges, rounded cards, cute clean vector icons, friendly illustrations, pastel progress bars.",
  },
  {
    id: "dark-premium",
    name: "Dark Premium",
    colors: "Obsidian Slate, Warm Gold, and Amber",
    description: "High prestige dark mode infographic with gold highlights.",
    bgDesc: "Rich charcoal black (#0F172A) background",
    paletteDesc: "Brilliant clean white (#F8FAFC) for text, matte warm gold (#D97706) for main metrics and badges, with amber (#F59E0B) accents on a deep dark canvas.",
    fontDesc: "Sleek, condensed modern sans-serif (like Roboto Condensed or Barlow)",
    elementStyle: "Dark glassmorphic panels, glowing gold borders, glowing circular charts, elegant clean minimalist vectors.",
  }
];

export function InfographicPromptDialog({ project, milestones, trigger }: InfographicPromptDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<StylePreset>(presets[0]);
  const [copied, setCopied] = useState(false);

  if (!project) return null;

  const formatMoney = (amount: number) => {
    if (amount >= 10000000) {
      return `₹${(amount / 10000000).toFixed(2)} Cr`;
    }
    if (amount >= 100000) {
      return `₹${(amount / 100000).toFixed(2)} Lakhs`;
    }
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
  };

  const getDurationString = () => {
    if (project.startDate && project.endDate) {
      return `${project.startDate} to ${project.endDate}`;
    }
    return "Ongoing Project";
  };

  const getOperatingStates = () => {
    if (project.states && project.states.length > 0) {
      return project.states.join(", ");
    }
    return "India (Pan India)";
  };

  // Compile project details for the prompt
  const totalBudgetStr = formatMoney(project.grantAmount || 0);
  const spentBudgetStr = formatMoney(project.spentBudget || 0);
  const approvedBudgetStr = formatMoney(project.approvedBudget || project.grantAmount || 0);
  
  const spentPct = project.approvedBudget > 0 
    ? Math.round((project.spentBudget / project.approvedBudget) * 100)
    : project.grantAmount > 0 
      ? Math.round((project.spentBudget / project.grantAmount) * 100)
      : 0;

  // Compute aggregated stats from activities
  const totalTeachers = project.activities?.reduce((s: number, a: any) => s + (a.teachersReached || 0), 0) || 0;
  const totalStudents = project.activities?.reduce((s: number, a: any) => s + (a.studentsReached || 0), 0) || 0;
  const totalSchools = project.activities?.reduce((s: number, a: any) => s + (a.schoolsReached || 0), 0) || 0;

  // Build grid metrics (2x2 flat grid items)
  const gridMetrics: string[] = [];
  
  // 1. Deliverables Progress
  if (project.deliverablesTotal > 0) {
    gridMetrics.push(`     - "DELIVERABLES: ${project.deliverablesDone}/${project.deliverablesTotal} Completed"`);
  } else {
    gridMetrics.push(`     - "STATUS: Active & On Track"`);
  }

  // 2. Teachers Trained
  if (totalTeachers > 0) {
    gridMetrics.push(`     - "TEACHERS TRAINED: ${totalTeachers} Educators"`);
  } else {
    const teachDeliv = project.deliverables?.find((d: any) => d.title.toLowerCase().includes("teacher"));
    if (teachDeliv) {
      gridMetrics.push(`     - "TARGET TEACHERS: ${teachDeliv.target || 0} Educators"`);
    } else {
      gridMetrics.push(`     - "TEACHER TRAINING: Standard Inclusive Pedagogy"`);
    }
  }

  // 3. Students Reached
  if (totalStudents > 0) {
    gridMetrics.push(`     - "STUDENTS REACHED: ${totalStudents} Children"`);
  } else {
    const studDeliv = project.deliverables?.find((d: any) => d.title.toLowerCase().includes("student"));
    if (studDeliv) {
      gridMetrics.push(`     - "TARGET STUDENTS: ${studDeliv.target || 0} Visually Impaired Kids"`);
    } else {
      gridMetrics.push(`     - "BENEFICIARIES: Visually Impaired Students"`);
    }
  }

  // 4. Schools Covered
  if (totalSchools > 0) {
    gridMetrics.push(`     - "SCHOOLS COVERED: ${totalSchools} Locations"`);
  } else {
    const schoolDeliv = project.deliverables?.find((d: any) => d.title.toLowerCase().includes("school"));
    if (schoolDeliv) {
      gridMetrics.push(`     - "TARGET SCHOOLS: ${schoolDeliv.target || 0} Gov Schools"`);
    } else {
      gridMetrics.push(`     - "SCHOOL NETWORK: Special & Inclusive Schools"`);
    }
  }

  // Ensure we display up to 4 metrics in prompt
  const metricsText = gridMetrics.slice(0, 4).join("\n");

  // Build milestones / deliverables checklist
  const milestoneList = milestones?.slice(0, 3) || [];
  const milestonesText = milestoneList.length > 0
    ? `   - A checklist section labeled "UPCOMING MILESTONES" containing:\n${milestoneList
        .map((m: any) => `     - "${m.title} [${m.status === "completed" ? "Done" : "Pending"}]"`)
        .join("\n")}`
    : '   - A clean horizontal divider showing milestones checklist.';

  // Build the full prompt string
  const generatedPrompt = `A vertical 9:16 high-quality, professional, modern minimalist infographic vector illustration for a grant-funded non-profit education project.

PROJECT DATA SUMMARY:
- Project Title: "${project.name}"
- Funder: "${project.funderName}"
- Timeline: "${getDurationString()}"
- Geography: "${getOperatingStates()}"
- Total Funding: "${totalBudgetStr}"

STYLE PRESET: ${selectedPreset.name}
- Background: ${selectedPreset.bgDesc}
- Color Palette: ${selectedPreset.paletteDesc}
- Typography: ${selectedPreset.fontDesc}
- Elements: ${selectedPreset.elementStyle}

INFOGRAPHIC LAYOUT & CONTENTS:
The infographic must be clean, with plenty of margins, structured in 3 vertical blocks:

1. HEADER BLOCK (Top):
   - Huge, elegant bold title text: "${project.name}"
   - Subtitle: "Supported by ${project.funderName}"
   - Small layout pill/badge: "Grant Period: ${getDurationString()}"

2. IMPACT METRICS GRID (Middle):
   - A clean 2x2 grid representing the real-time project achievements. Use clean, single-colored vector icons (e.g., book, graduation cap, school building, teaching board) next to huge, high-contrast numbers.
   - Render ONLY these exact text strings:
${metricsText}

3. FINANCIALS & GEOGRAPHY (Bottom):
   - A clean minimalist card/block labeled "PROJECT STATS" containing:
     - "Operating States: ${getOperatingStates()}"
     - "Budget Spent: ${spentBudgetStr} of ${approvedBudgetStr} (${spentPct}% Utilised)"
     - A clean, flat linear progress indicator bar demonstrating the ${spentPct}% budget utilization.
${milestonesText}

DESIGN CONSTRAINTS (CRITICAL):
- Ultra-clean flat vector illustration style. NO realistic photographic elements.
- Extremely limited text. Render ONLY the specified titles, labels, and numbers.
- Maintain high visual contrast and plenty of empty space (negative space) for an elegant minimalist look.
- Use a perfectly sharp modern sans-serif font for all numbers and titles. Do not write scribbles or distorted characters.`;

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedPrompt);
    setCopied(true);
    toast.success("Infographic prompt copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-1.5 border-primary/20 hover:bg-primary/5 text-primary">
            <Sparkles className="size-4" />
            Generate Infographic
          </Button>
        )}
      </DialogTrigger>
      
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded bg-primary/10 text-primary">
              <Sparkles className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-lg">Project Infographic Generator</DialogTitle>
              <DialogDescription>
                Create a customized prompt utilizing real-time project details to generate a stunning infographic.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Style Presets Selector */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Palette className="size-3.5" /> Select Aesthetic Style
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => setSelectedPreset(preset)}
                  className={`flex flex-col text-left p-2.5 rounded-lg border text-xs transition-all ${
                    selectedPreset.id === preset.id
                      ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                      : "border-slate-200 hover:border-slate-300 bg-background"
                  }`}
                >
                  <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">{preset.name}</span>
                  <span className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">{preset.colors}</span>
                </button>
              ))}
            </div>
            <div className="p-3 rounded-lg bg-muted/30 text-xs border leading-relaxed text-slate-600 dark:text-slate-400">
              <strong>Preset Description: </strong> {selectedPreset.description}
            </div>
          </div>

          {/* Prompt Preview */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
              <span className="flex items-center gap-1"><FileText className="size-3.5" /> Generated DALL-E Prompt</span>
              <Badge variant="secondary" className="text-[10px] py-0 px-2 font-mono">Vertical 9:16</Badge>
            </h4>
            <div className="relative rounded-lg border bg-slate-950 p-4 font-mono text-[11px] leading-normal text-slate-300 max-h-60 overflow-y-auto whitespace-pre-wrap select-all">
              {generatedPrompt}
            </div>
          </div>

          {/* Quick Instructions */}
          <div className="flex gap-3 p-3.5 rounded-xl bg-primary/5 border border-primary/10 text-xs text-slate-600 dark:text-slate-400">
            <Info className="size-5 text-primary shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h5 className="font-semibold text-slate-800 dark:text-slate-200">How to generate the infographic:</h5>
              <ol className="list-decimal list-inside space-y-1.5 pl-0.5">
                <li>Choose your preferred style aesthetic above.</li>
                <li>Click <strong>Copy Prompt</strong> below to copy the structured text instructions.</li>
                <li>Go to <strong>ChatGPT (GPT-4 / DALL-E)</strong> or any modern image generation AI.</li>
                <li>Paste the prompt and hit enter. DALL-E will draw a beautiful minimalist visual report.</li>
              </ol>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 border-t pt-4">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleCopy} className="gap-1.5 shrink-0">
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? "Copied!" : "Copy Prompt"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
