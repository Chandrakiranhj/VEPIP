"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Loader2, Save, IndianRupee, TrendingDown, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function ExpenditureSheet({ fiscalYear }: { fiscalYear: string }) {
  const states = useQuery(api.funds.listStates);
  const fyExpenditures = useQuery(api.funds.getFyExpenditures, { fiscalYear });
  const realSpending = useQuery(api.funds.getRealStateSpending, { fiscalYear });
  const updateFyExpenditure = useMutation(api.funds.upsertFyExpenditure);
  
  const [saving, setSaving] = useState(false);

  const handleUpdate = async (stateId: any, type: "planned" | "actual", value: string) => {
    const numValue = parseFloat(value.replace(/[^0-9.]/g, "")) || 0;
    setSaving(true);
    try {
      await updateFyExpenditure({
        stateId,
        fiscalYear,
        [type === "planned" ? "plannedExpense" : "actualSpent"]: numValue,
      });
    } catch (e) {
      toast.error("Failed to save expenditure");
    } finally {
      setSaving(false);
    }
  };

  const getFyVal = (stateId: any, type: "planned" | "actual") => {
    if (type === "actual") {
        // Aggregate real-time spending from all months for this FY
        const stateReal = realSpending?.[stateId];
        if (stateReal) {
            return Object.values(stateReal).reduce((sum, val) => sum + (val as number), 0);
        }
    }
    const entry = fyExpenditures?.find(e => e.stateId === stateId);
    return entry ? (type === "planned" ? entry.plannedExpense : entry.actualSpent) : 0;
  };

  const formatCr = (val: number) => `₹${(val / 10000000).toFixed(2)} Cr`;

  if (!states) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin" /></div>;

  return (
    <Card className="bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Organization Expenditure (FY {fiscalYear})</CardTitle>
          <CardDescription>Consolidated annual requirements and actual spending across all regions.</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {saving ? (
            <Badge variant="outline" className="flex items-center gap-1 text-slate-500 animate-pulse">
              <Loader2 className="w-3 h-3 animate-spin" /> Saving...
            </Badge>
          ) : (
            <Badge variant="outline" className="flex items-center gap-1 text-emerald-500">
              <CheckCircle2 className="w-3 h-3" /> Synced
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0 border-t border-slate-200 dark:border-slate-800">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50/50 dark:bg-slate-900/50">
              <TableRow>
                <TableHead className="w-[300px]">Cost Center / Region</TableHead>
                <TableHead className="text-right w-[200px]">
                   <div className="flex items-center justify-end gap-2 text-primary">
                     <Target className="w-4 h-4" /> Planned Requirement
                   </div>
                </TableHead>
                <TableHead className="text-right w-[200px]">
                   <div className="flex items-center justify-end gap-2 text-orange-600">
                     <TrendingDown className="w-4 h-4" /> Actual Spent (Realized)
                   </div>
                </TableHead>
                <TableHead className="text-right w-[150px]">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Central Operations */}
              <TableRow className="bg-slate-100/30 dark:bg-slate-800/30">
                <TableCell colSpan={4} className="py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Central / Admin Operations
                </TableCell>
              </TableRow>
              {states.filter(s => s.code === "PAN" || s.code === "ADM").map((state) => {
                const planVal = getFyVal(state._id, "planned");
                const actualVal = getFyVal(state._id, "actual");
                const percentage = planVal > 0 ? (actualVal / planVal) * 100 : 0;

                return (
                  <TableRow key={state._id} className="group transition-colors">
                    <TableCell className="font-semibold py-4">{state.name}</TableCell>
                    <TableCell className="p-1">
                      <div className="flex items-center justify-end gap-2 px-4">
                        <input
                          className="w-32 bg-transparent text-right font-mono text-lg font-bold focus:outline-none focus:ring-2 focus:ring-primary/20 rounded px-2"
                          defaultValue={planVal || ""}
                          onBlur={(e) => handleUpdate(state._id, "planned", e.target.value)}
                          placeholder="0"
                        />
                      </div>
                    </TableCell>
                    <TableCell className="p-1">
                      <div className="flex items-center justify-end gap-2 px-4">
                        <input
                          className="w-32 bg-transparent text-right font-mono text-lg font-bold text-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500/20 rounded px-2"
                          defaultValue={actualVal || ""}
                          onBlur={(e) => handleUpdate(state._id, "actual", e.target.value)}
                          placeholder="0"
                        />
                      </div>
                    </TableCell>
                    <TableCell className="text-right pr-6">
                      <Badge variant={percentage > 100 ? "destructive" : "secondary"}>
                        {percentage.toFixed(0)}% Utilized
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}

              {/* Regional Operations */}
              <TableRow className="bg-slate-100/30 dark:bg-slate-800/30">
                <TableCell colSpan={4} className="py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Regional Operations
                </TableCell>
              </TableRow>
              {states.filter(s => s.code !== "PAN" && s.code !== "ADM").map((state) => {
                const planVal = getFyVal(state._id, "planned");
                const actualVal = getFyVal(state._id, "actual");
                const percentage = planVal > 0 ? (actualVal / planVal) * 100 : 0;

                return (
                  <TableRow key={state._id} className="group transition-colors">
                    <TableCell className="font-semibold py-4">{state.name}</TableCell>
                    <TableCell className="p-1">
                      <div className="flex items-center justify-end gap-2 px-4">
                        <input
                          className="w-32 bg-transparent text-right font-mono text-lg font-bold focus:outline-none focus:ring-2 focus:ring-primary/20 rounded px-2"
                          defaultValue={planVal || ""}
                          onBlur={(e) => handleUpdate(state._id, "planned", e.target.value)}
                          placeholder="0"
                        />
                      </div>
                    </TableCell>
                    <TableCell className="p-1">
                      <div className="flex items-center justify-end gap-2 px-4">
                        <input
                          className="w-32 bg-transparent text-right font-mono text-lg font-bold text-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500/20 rounded px-2"
                          defaultValue={actualVal || ""}
                          onBlur={(e) => handleUpdate(state._id, "actual", e.target.value)}
                          placeholder="0"
                        />
                      </div>
                    </TableCell>
                    <TableCell className="text-right pr-6">
                      <Badge variant={percentage > 100 ? "destructive" : "secondary"}>
                        {percentage.toFixed(0)}% Utilized
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
