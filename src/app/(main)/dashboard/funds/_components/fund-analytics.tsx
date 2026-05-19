"use client";
import { cn } from "@/lib/utils";
import { useQuery } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { ArrowUpRight, Loader2, TrendingUp, Wallet, Zap } from "lucide-react";

export function FundAnalytics({ fiscalYear }: { fiscalYear: string }) {
  const realData = useQuery(api.funds.getRealVisibility, { fiscalYear });
  const schools = useQuery(api.funds.listSchools, {});
  const comparative = useQuery(api.funds.getComparativeAnalysis, { fiscalYear });
  
  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('en-IN', { 
      style: 'currency', 
      currency: 'INR', 
      maximumFractionDigits: 0 
    }).format(val);

  const formatCr = (val: number) => `₹${(val / 10000000).toFixed(2)} Cr`;

  if (!realData || !comparative) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin" /></div>;

  const totalConfirmed = realData.projectTotals.reduce((sum, p) => sum + p.fyVisibility, 0);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden group hover:shadow-md transition-all">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Requirement (Planned)</CardTitle>
            <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform">
              <TrendingUp className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-50">{formatCr(comparative.totalPlanned)}</div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Sum of all planned expenditures</p>
          </CardContent>
        </Card>

        <Card className="bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden group hover:shadow-md transition-all">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Available Funds</CardTitle>
            <div className="p-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg text-purple-600 dark:text-purple-400 group-hover:scale-110 transition-transform">
              <Wallet className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-50">{formatCr(comparative.realFunds)}</div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Confirmed project grants for FY</p>
          </CardContent>
        </Card>

        <Card className="bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden group hover:shadow-md transition-all">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400">Funding Gap</CardTitle>
            <div className="p-2 bg-orange-50 dark:bg-orange-900/20 rounded-lg text-orange-600 dark:text-orange-400 group-hover:scale-110 transition-transform">
              <Zap className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className={cn(
              "text-2xl font-bold",
              comparative.realFunds >= comparative.totalPlanned ? "text-emerald-600" : "text-orange-600"
            )}>
              {formatCr(Math.abs(comparative.realFunds - comparative.totalPlanned))}
              {comparative.realFunds >= comparative.totalPlanned ? " (Surplus)" : " (Deficit)"}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Requirement vs Available</p>
          </CardContent>
        </Card>

        <Card className="bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden group hover:shadow-md transition-all">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400">Schools Funded</CardTitle>
            <div className="p-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform">
              <GraduationCap className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-50">
              {schools?.length || 0} Schools
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Onboarded across 16 states
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Comparative Chart */}
        <Card className="lg:col-span-2 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader>
            <CardTitle>State-wise Comparative Analysis</CardTitle>
            <CardDescription>Planned Requirement vs. Realized Funds for FY {fiscalYear}</CardDescription>
          </CardHeader>
          <CardContent className="h-[400px]">
             <ChartContainer config={{
              planned: { label: "Planned Requirement", color: "hsl(var(--primary))" },
              actual: { label: "Actual Realized", color: "hsl(var(--chart-2))" }
            }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={realData.chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorConfirmed" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="month" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} 
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    tickFormatter={(val) => `₹${val/100000}L`}
                  />
                  <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                  <Area 
                    type="monotone" 
                    dataKey="confirmed" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={3}
                    fillOpacity={1} 
                    fill="url(#colorConfirmed)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Requirements Table */}
        <Card className="bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <CardHeader>
            <CardTitle>Organization-wide Summary</CardTitle>
            <CardDescription>Consolidated financials for FY {fiscalYear}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
             <div className="divide-y divide-slate-100 dark:divide-slate-800">
               <div className="flex items-center justify-between p-4 bg-slate-50/50 dark:bg-slate-900/50">
                  <span className="text-sm font-medium">Total Required</span>
                  <span className="font-bold text-slate-900 dark:text-slate-50">{formatCr(comparative.totalPlanned)}</span>
               </div>
               <div className="flex items-center justify-between p-4">
                  <span className="text-sm font-medium">Total Funds Available</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatCr(comparative.realFunds)}</span>
               </div>
               <div className="flex items-center justify-between p-4">
                  <span className="text-sm font-medium">Total Actual Spent</span>
                  <span className="font-bold text-blue-600 dark:text-blue-400">{formatCr(comparative.totalActual)}</span>
               </div>
               <div className="p-4 bg-slate-50/30 dark:bg-slate-900/30">
                  <div className="text-xs text-slate-500 uppercase font-bold mb-3 tracking-wider">Top Requirements</div>
                  <div className="space-y-3">
                    {comparative.stateBreakdown.sort((a, b) => b.planned - a.planned).slice(0, 5).map((s, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <span className="text-sm text-slate-600 dark:text-slate-400">{s.name}</span>
                        <span className="text-sm font-semibold">{formatCr(s.planned)}</span>
                      </div>
                    ))}
                  </div>
               </div>
             </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const GraduationCap = ({ className }: { className?: string }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="M21.42 10.922 12 4.667 2.58 10.922l8.97 5.98a1 1 0 0 0 1.05 0l8.82-5.88a1 1 0 0 0 0-1.66z" />
    <path d="M6 13v6c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2v-6" />
  </svg>
);
