"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Plus, 
  GraduationCap, 
  MapPin, 
  Loader2, 
  ChevronDown, 
  ChevronUp, 
  TrendingUp, 
  IndianRupee,
  Search,
  ExternalLink,
  Trash2,
  Building2,
  Calendar
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from "@/components/ui/dialog";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";

export function StateManagement({ fiscalYear }: { fiscalYear: string }) {
  const states = useQuery(api.funds.listStates);
  const schools = useQuery(api.funds.listSchools, {});
  const visibility = useQuery(api.funds.getFinancialVisibility, { fiscalYear });
  const funders = useQuery(api.funds.listFunders);
  
  const addSchool = useMutation(api.funds.addSchool);
  const removeSchool = useMutation(api.funds.removeSchool);
  const addState = useMutation(api.funds.addState);
  const removeState = useMutation(api.funds.removeState);
  const addVisibility = useMutation(api.funds.upsertVisibility);
  const removeVisibility = useMutation(api.funds.removeVisibility);
  
  const [expandedState, setExpandedState] = useState<string | null>(null);
  const [newSchoolName, setNewSchoolName] = useState("");
  const [search, setSearch] = useState("");

  // New State Form
  const [isAddStateOpen, setIsAddStateOpen] = useState(false);
  const [newStateName, setNewStateName] = useState("");
  const [newStateCode, setNewStateCode] = useState("");

  // Visibility Form
  const [newVisFunderId, setNewVisFunderId] = useState<string>("");
  const [newVisAmount, setNewVisAmount] = useState("");
  const [newVisProb, setNewVisProb] = useState("1");
  const [newVisType, setNewVisType] = useState<"confirmed" | "pipeline">("confirmed");

  const handleAddState = async () => {
    if (!newStateName || !newStateCode) return toast.error("Fill all fields");
    try {
      await addState({ name: newStateName, code: newStateCode.toUpperCase() });
      toast.success("State added");
      setIsAddStateOpen(false);
      setNewStateName("");
      setNewStateCode("");
    } catch (e) { toast.error("Failed to add state"); }
  };

  const handleAddSchool = async (stateId: any) => {
    if (!newSchoolName) return toast.error("Enter school name");
    try {
      await addSchool({ name: newSchoolName, stateId });
      toast.success("School added");
      setNewSchoolName("");
    } catch (e) { toast.error("Failed"); }
  };

  const handleAddVisibility = async (stateId: any) => {
    if (!newVisFunderId || !newVisAmount) return toast.error("Fill visibility details");
    try {
      await addVisibility({
        stateId,
        funderId: newVisFunderId as any,
        amount: parseFloat(newVisAmount),
        probability: parseFloat(newVisProb),
        type: newVisType,
        fiscalYear,
      });
      toast.success("Visibility added");
      setNewVisAmount("");
    } catch (e) { toast.error("Failed"); }
  };

  const formatCr = (val: number) => `₹${(val / 10000000).toFixed(2)} Cr`;

  if (!states) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin" /></div>;

  const filteredStates = states.filter(s => 
    s.name.toLowerCase().includes(search.toLowerCase()) || 
    s.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input 
            placeholder="Search states..." 
            className="pl-10 bg-white/50 dark:bg-slate-900/50"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="px-3 py-1 font-mono">
            Total States: {states.length}
          </Badge>
          <Dialog open={isAddStateOpen} onOpenChange={setIsAddStateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <Plus className="w-4 h-4" /> Add Cost Center
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Cost Center / State</DialogTitle>
                <DialogDescription>Create a new regional or central cost center for tracking.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Name</label>
                  <Input placeholder="e.g. Karnataka or Pan India" value={newStateName} onChange={e => setNewStateName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Code (2-3 chars)</label>
                  <Input placeholder="e.g. KA or PAN" maxLength={3} value={newStateCode} onChange={e => setNewStateCode(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddStateOpen(false)}>Cancel</Button>
                <Button onClick={handleAddState}>Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredStates.map((state) => {
          const stateSchools = schools?.filter(s => s.stateId === state._id) || [];
          const stateVisibility = visibility?.filter(v => v.stateId === state._id) || [];
          const totalStateFund = stateVisibility.reduce((sum, v) => sum + v.amount, 0);
          const isExpanded = expandedState === state._id;

          return (
            <Card 
              key={state._id} 
              className={cn(
                "transition-all duration-300 border-slate-200 dark:border-slate-800 hover:shadow-md",
                isExpanded ? "md:col-span-2 lg:col-span-3 ring-2 ring-primary/20" : ""
              )}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold">
                    {state.code}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-lg">{state.name}</CardTitle>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6 text-slate-300 hover:text-red-500"
                        onClick={(e) => {
                          e.stopPropagation();
                          if(confirm("Delete state and all linked data?")) removeState({ stateId: state._id });
                        }}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                    <CardDescription>{stateSchools.length} Schools Onboarded</CardDescription>
                  </div>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setExpandedState(isExpanded ? null : state._id)}
                >
                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </Button>
              </CardHeader>
              
              {!isExpanded && (
                <CardContent>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-1 text-slate-500">
                      <TrendingUp className="w-3 h-3" />
                      Visibility
                    </div>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      {formatCr(totalStateFund)}
                    </span>
                  </div>
                </CardContent>
              )}

              {isExpanded && (
                <CardContent className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-4 border-t border-slate-100 dark:border-slate-800">
                    {/* Schools Section */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold flex items-center gap-2">
                          <GraduationCap className="w-4 h-4" />
                          Schools in {state.name}
                        </h3>
                      </div>
                      
                      <div className="flex gap-2">
                        <Input 
                          placeholder="New school name..." 
                          value={newSchoolName}
                          onChange={(e) => setNewSchoolName(e.target.value)}
                          className="h-9"
                        />
                        <Button size="sm" onClick={() => handleAddSchool(state._id)}>
                          <Plus className="w-4 h-4 mr-1" /> Add
                        </Button>
                      </div>

                      <div className="rounded-lg border border-slate-200 dark:border-slate-800 max-h-[300px] overflow-y-auto">
                        <Table>
                          <TableBody>
                            {stateSchools.length === 0 ? (
                              <TableRow>
                                <TableCell className="text-center py-8 text-slate-500">
                                  No schools found for this state.
                                </TableCell>
                              </TableRow>
                            ) : (
                              stateSchools.map((school) => (
                                <TableRow key={school._id}>
                                  <TableCell className="font-medium">{school.name}</TableCell>
                                  <TableCell className="text-right flex items-center justify-end gap-1">
                                    <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-red-500" onClick={() => removeSchool({ schoolId: school._id })}>
                                      <Trash2 className="w-3 h-3" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                      <ExternalLink className="w-3 h-3 text-slate-400" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </div>

                    {/* Funding Visibility Section */}
                    <div className="space-y-4">
                      <h3 className="font-bold flex items-center gap-2">
                        <IndianRupee className="w-4 h-4" />
                        Funding Visibility (FY {fiscalYear})
                      </h3>
                      
                      {/* Add Visibility Form */}
                      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                          <Select onValueChange={setNewVisFunderId} value={newVisFunderId}>
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Select Funder" />
                            </SelectTrigger>
                            <SelectContent>
                              {funders?.map(f => (
                                <SelectItem key={f._id} value={f._id}>{f.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input placeholder="Amount (INR)" className="h-8 text-xs" type="number" value={newVisAmount} onChange={e => setNewVisAmount(e.target.value)} />
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                           <Select onValueChange={(v: any) => setNewVisType(v)} value={newVisType}>
                              <SelectTrigger className="h-8 text-xs col-span-1">
                                <SelectValue placeholder="Type" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="confirmed">Confirmed</SelectItem>
                                <SelectItem value="pipeline">Pipeline</SelectItem>
                              </SelectContent>
                            </Select>
                            <Select onValueChange={setNewVisProb} value={newVisProb}>
                              <SelectTrigger className="h-8 text-xs col-span-1">
                                <SelectValue placeholder="Prob." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="1">100%</SelectItem>
                                <SelectItem value="0.75">75%</SelectItem>
                                <SelectItem value="0.5">50%</SelectItem>
                                <SelectItem value="0.25">25%</SelectItem>
                              </SelectContent>
                            </Select>
                            <Button size="sm" className="h-8 text-xs" onClick={() => handleAddVisibility(state._id)}>Add</Button>
                        </div>
                      </div>

                      <div className="space-y-3">
                        {stateVisibility.length === 0 ? (
                          <div className="p-8 text-center bg-slate-50 dark:bg-slate-900 rounded-lg text-slate-500 text-sm italic">
                            No state-specific fund projections found. 
                          </div>
                        ) : (
                          stateVisibility.map((v, i) => (
                            <div key={i} className="group relative flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                              <div>
                                <div className="text-sm font-bold">{v.funderName}</div>
                                <div className="text-[10px] text-slate-500 uppercase">{v.type}</div>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="text-right">
                                  <div className="text-sm font-mono font-bold text-primary">{formatCr(v.amount)}</div>
                                  <div className="text-[10px] text-slate-500">{(v.probability * 100)}% Prob</div>
                                </div>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-7 w-7 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={() => removeVisibility({ visibilityId: v._id })}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          ))
                        )}
                        
                        <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 flex items-center justify-between">
                           <div className="text-sm font-medium">Total State Visibility</div>
                           <div className="text-xl font-bold text-primary">{formatCr(totalStateFund)}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
