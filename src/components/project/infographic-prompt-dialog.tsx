"use client";

import { useState } from "react";
import { Copy, Check, Sparkles, Palette, FileText, Info, HelpCircle } from "lucide-react";
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
    id: "sensory-tactile",
    name: "Sensory & Tactile",
    colors: "Warm Olive Sage & Terracotta Clay",
    description: "Inspired by Vision Empower's tactile models, educational toys, and textures.",
    bgDesc: "Soft warm cream (#FAF9F6) background",
    paletteDesc: "Earthy charcoal (#2D2A26) for high-readability text, calming sage green (#4F6D54) for layout elements, and organic terracotta clay (#C05C3E) for key metrics and icon accents.",
    fontDesc: "Modern, slightly rounded sans-serif font (like Outfit or Lexend) for high accessibility",
    elementStyle: "Stylized illustrations of wooden block shapes, hands touching raised lines, sensory boards, tactile geometry models, and warm, friendly vectors.",
  },
  {
    id: "inclusion-clarity",
    name: "Inclusion & Clarity",
    colors: "High-Contrast Charcoal & Solar Gold",
    description: "Highly visible contrast designed for inclusive and accessible presentations.",
    bgDesc: "Clean off-black charcoal (#1E1E24) dark background",
    paletteDesc: "Brilliant crisp white (#F8FAFC) for text, vibrant sun-gold (#F59E0B) for active highlights and icons, and deep slate (#333533) for card backdrops.",
    fontDesc: "Crisp, bold geometric sans-serif (like Montserrat or Inter)",
    elementStyle: "Assistive technology themes, glowing audio-wave lines, Braille text patterns subtly integrated into borders, and high-prestige golden circular metrics.",
  },
  {
    id: "playful-ludic",
    name: "Playful Ludic",
    colors: "Lively Indigo & Coral Orange",
    description: "Captures the spirit of game-based learning and computational thinking games.",
    bgDesc: "Soft cool ice-grey (#F3F4F6) background",
    paletteDesc: "Deep indigo blue (#312E81) for structure and text, playful coral orange (#F43F5E) for metric callouts, and clean white (#FFFFFF) for cards.",
    fontDesc: "Friendly, rounded sans-serif (like Nunito or Quicksand)",
    elementStyle: "Game cards, puzzle piece blocks representing CT concepts, dice, smiling student silhouettes, and dynamic, friendly curves.",
  },
  {
    id: "stem-horizon",
    name: "STEM Horizon",
    colors: "Deep Teal & Fresh Mint Green",
    description: "Professional science and technology aesthetic for institutional reports.",
    bgDesc: "Pure bright white (#FFFFFF) background",
    paletteDesc: "Professional slate grey (#1E293B) for body text, deep technical forest teal (#0D9488) for main divisions, and soft mint green (#ECFDF5) for card fills.",
    fontDesc: "Clean, elegant architectural sans-serif (like Inter or Helvetica Neue)",
    elementStyle: "Structured clean gridlines, schematic lines, geometric shapes, science kits, magnifying glasses, and neat linear progress trackers.",
  },
  {
    id: "creative-outreach",
    name: "Creative Outreach",
    colors: "Warm Sand, Plum, & Dusty Rose",
    description: "Soft, welcoming colors showing care, support, and community outreach.",
    bgDesc: "Warm sand beige (#F5EBE0) background",
    paletteDesc: "Deep plum purple (#4A2840) for structure, dusty rose (#D5A3B3) for details, and charcoal for body text.",
    fontDesc: "Elegant, clean serif/sans-serif mix (like Playfair Display and Inter)",
    elementStyle: "Soft organic hand-drawn shapes, community-centric metaphors, classrooms with teachers, and gentle curved visual flows.",
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

  const getTimelineDetails = () => {
    if (!project.startDate || !project.endDate) {
      return { text: "Ongoing Project", elapsedPct: 0, showElapsed: false };
    }
    try {
      const start = new Date(project.startDate);
      const end = new Date(project.endDate);
      const now = new Date();
      const totalMs = end.getTime() - start.getTime();
      const elapsedMs = now.getTime() - start.getTime();
      if (totalMs <= 0) return { text: `${project.startDate} to ${project.endDate}`, elapsedPct: 0, showElapsed: false };
      
      const totalDays = Math.ceil(totalMs / (1000 * 60 * 60 * 24));
      const elapsedDays = Math.max(0, Math.min(totalDays, Math.ceil(elapsedMs / (1000 * 60 * 60 * 24))));
      const elapsedPct = Math.round((elapsedDays / totalDays) * 100);
      
      return {
        text: `${project.startDate} to ${project.endDate} (${elapsedDays} of ${totalDays} days elapsed)`,
        elapsedPct,
        totalDays,
        elapsedDays,
        showElapsed: true
      };
    } catch (e) {
      return { text: `${project.startDate} to ${project.endDate}`, elapsedPct: 0, showElapsed: false };
    }
  };

  const timeline = getTimelineDetails();

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

  // Build grid metrics (2x2 flat grid items or horizontal row blocks)
  const gridMetrics: string[] = [];
  
  // 1. Deliverables Progress
  if (project.deliverablesTotal > 0) {
    gridMetrics.push(`     - "DELIVERABLES: ${project.deliverablesDone}/${project.deliverablesTotal} Completed"`);
  } else {
    gridMetrics.push(`     - "STATUS: Active & On Track"`);
  }

  // 2. Teachers Trained (Capacity Building / Pragya)
  if (totalTeachers > 0) {
    gridMetrics.push(`     - "TEACHERS TRAINED: ${totalTeachers} Educators"`);
  } else {
    const teachDeliv = project.deliverables?.find((d: any) => d.title.toLowerCase().includes("teacher"));
    if (teachDeliv) {
      gridMetrics.push(`     - "TARGET TEACHERS: ${teachDeliv.target || 0} Educators"`);
    } else {
      gridMetrics.push(`     - "TEACHER TRAINING: Inclusive STEM Capacity Building"`);
    }
  }

  // 3. Students Reached (Anubhav / Assistive Resources)
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

  // 4. Schools Covered (Accessible Resource Centres / ARC)
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

  // Build milestones checklist
  const milestoneList = milestones?.slice(0, 3) || [];
  const milestonesText = milestoneList.length > 0
    ? `   - A timeline flow labeled "UPCOMING ROADMAP" listing:\n${milestoneList
        .map((m: any) => `     - "${m.title} [${m.status === "completed" ? "Done" : "Pending"}]"`)
        .join("\n")}`
    : '   - A clean divider indicating upcoming program milestones.';

  // Build the full prompt string (16:9 Landscape layout with specific Vision Empower visual cues)
  const generatedPrompt = `A wide 16:9 landscape-oriented, highly professional and modern minimalist infographic vector illustration for "Vision Empower" (an organization bringing inclusive STEM and computational thinking education to visually impaired children in India).

CONTEXT:
This infographic is a project progress and status report designed for funders to see real-time performance.
Project: "${project.name}"
Supported by: ${project.funderName}
Project Duration: ${timeline.text}
Active Regions: ${getOperatingStates()}
Total Funding: ${totalBudgetStr}

STYLE THEME: ${selectedPreset.name}
- Background: ${selectedPreset.bgDesc}
- Color Palette: ${selectedPreset.paletteDesc}
- Typography: ${selectedPreset.fontDesc}
- Visual Accents: ${selectedPreset.elementStyle}

COMPOSITION & VISUAL METAPHORS:
- Aspect Ratio: Widescreen 16:9 landscape layout (1792x1024 px).
- Visual Metaphor (Inclusive Education): Incorporate subtle abstract vector details representing sensory, tactile, and game-based learning. Examples: stylized hands exploring a 3D geometry shape or a tactile diagram, soft circular Braille dot motifs integrated into background shapes, and sound wave lines or puzzle piece blocks signifying computational thinking games.
- Layout: 3 clear, distinct horizontal sections arranged side-by-side (Left third, Middle third, Right third) separated by neat negative space:

1. LEFT THIRD (Project Identity & Timeline Track):
   - Huge, elegant bold title text: "${project.name}"
   - Subheading: "A progress report prepared for ${project.funderName}"
   - A clean horizontal timeline progress indicator:
     - "Timeline: ${timeline.text}"
     - "Timeline Progress: ${timeline.elapsedPct}% Completed"
     - "Target Scope: ${project.deliverablesTotal || 0} Deliverables across ${getOperatingStates()}"

2. MIDDLE THIRD (Real-Time Impact Metrics):
   - A clean horizontal layout of 3 to 4 metric boxes. Each box has a simple, clean single-color vector icon (such as a tactile book, a teacher training workshop symbol, or a group of students) above a huge, high-contrast bold number.
   - The metrics to display:
${metricsText}

3. RIGHT THIRD (Financials & Timelines):
   - A card showing "BUDGET UTILISATION":
     - Total Grant: ${totalBudgetStr}
     - Utilised: ${spentBudgetStr} (${spentPct}% spent)
     - A clean, flat linear progress indicator bar showing ${spentPct}% progress.
${milestonesText}

DESIGN FREEDOM & CONSTRAINTS (CRITICAL):
- DO NOT generate any corporate logos, brand insignia, organization emblems, or graphic icons meant to serve as logos. Keep the visual design clean and purely focus on data and illustrations.
- 100% DATA ACCURACY: The numbers and labels (total budget, spent budget, spent percentage, deliverables target vs completed, timeline days/percent, and metrics) are exact. Render all numbers exactly as written.
- Use clean, flat vector illustration style with absolutely NO photo elements, NO complex gradients, and NO cluttered details.
- Provide a generous amount of empty space (negative space) around all text and icons for a premium, clean aesthetic.
- Typesetting must be crisp, using a single highly legible sans-serif font.
- Feel free to represent the metrics and milestones creatively with elegant progress rings, flowchart paths, or clean grids that fit the landscape layout.`;

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
      
      <DialogContent className="sm:max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded bg-primary/10 text-primary">
              <Sparkles className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-xl">Project Infographic Generator (Widescreen 16:9)</DialogTitle>
              <DialogDescription>
                Configure style presets matching Vision Empower's accessibility mission and copy the formulated prompt to generate beautiful 16:9 landscape infographics.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 py-2">
          {/* Style Controls (Left Column) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Palette className="size-3.5" /> Select Aesthetic Style
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {presets.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => setSelectedPreset(preset)}
                    className={`flex flex-col text-left p-3 rounded-lg border text-xs transition-all ${
                      selectedPreset.id === preset.id
                        ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                        : "border-slate-200 hover:border-slate-300 bg-background"
                    }`}
                  >
                    <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">{preset.name}</span>
                    <span className="text-[10px] text-muted-foreground mt-0.5 leading-snug line-clamp-2">{preset.colors}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-muted/30 text-xs border leading-relaxed space-y-1.5">
              <h5 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                Preset: {selectedPreset.name}
              </h5>
              <p className="text-slate-600 dark:text-slate-400">
                {selectedPreset.description}
              </p>
              <div className="pt-2 border-t mt-2 text-[10px] text-muted-foreground space-y-1">
                <div><strong>Theme Background:</strong> {selectedPreset.bgDesc}</div>
                <div><strong>Visual Assets:</strong> {selectedPreset.elementStyle}</div>
              </div>
            </div>

            <div className="flex gap-3 p-3.5 rounded-xl bg-primary/5 border border-primary/10 text-xs text-slate-600 dark:text-slate-400">
              <Info className="size-5 text-primary shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h5 className="font-semibold text-slate-800 dark:text-slate-200">Generating in ChatGPT/DALL-E:</h5>
                <ol className="list-decimal list-inside space-y-1.5 pl-0.5 leading-relaxed">
                  <li>Choose your preferred style aesthetic.</li>
                  <li>Click <strong>Copy Prompt</strong>.</li>
                  <li>Go to <strong>ChatGPT (GPT-4 / DALL-E)</strong> or Midjourney.</li>
                  <li>Paste the prompt. ChatGPT will automatically generate the 16:9 layout.</li>
                </ol>
              </div>
            </div>
          </div>

          {/* Prompt Preview (Right Column) */}
          <div className="lg:col-span-7 flex flex-col space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
              <span className="flex items-center gap-1"><FileText className="size-3.5" /> Generated Widescreen Prompt</span>
              <Badge variant="secondary" className="text-[10px] py-0 px-2 font-mono">Horizontal 16:9</Badge>
            </h4>
            <div className="flex-1 min-h-[300px] lg:min-h-0 relative rounded-lg border bg-slate-950 p-4 font-mono text-[11px] leading-relaxed text-slate-300 overflow-y-auto whitespace-pre-wrap select-all border-slate-800 max-h-[480px]">
              {generatedPrompt}
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
