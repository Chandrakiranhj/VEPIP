"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Loader2, Plus, Trash2, Users } from "lucide-react";

import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const roleStyles: Record<string, string> = {
  admin: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
  program_manager: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  account_manager: "border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300",
  finance: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  leadership: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
};

type PersonRole = "admin" | "leadership" | "program_manager" | "account_manager" | "finance";

function label(v: string) {
  return v.split("_").map((p) => p[0]?.toUpperCase() + p.slice(1)).join(" ");
}

export default function PeoplePage() {
  return <PeopleDirectory />;
}

function PeopleDirectory() {
  const currentPerson = useQuery(api.people.current);
  const people = useQuery(api.people.list) ?? [];
  const addPerson = useMutation(api.people.add);
  const removePerson = useMutation(api.people.remove);

  const [busy, setBusy] = useState<string | boolean>(false);
  const [form, setForm] = useState<{ name: string; email: string; role: PersonRole; password: string }>({
    name: "",
    email: "",
    role: "program_manager",
    password: "",
  });

  async function handleRemove(personId: Id<"people">) {
    if (!confirm("Are you sure you want to remove this person? They will lose all access immediately.")) return;
    setBusy(personId);
    try {
      await removePerson({ personId });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to remove person");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight flex items-center gap-2">
          <Users className="size-6 text-primary" />
          People Directory
        </h1>
        <p className="text-muted-foreground mt-1">Manage team members who can be assigned to projects.</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Team Members</CardTitle>
            <CardDescription>{people.length} people in the directory</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {people.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                No people yet. Add your first team member.
              </div>
            ) : people.map((person) => (
              <div key={person._id} className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-3">
                  <div>
                    <div className="font-medium text-sm">{person.name}</div>
                    {person.email && <div className="text-xs text-muted-foreground">{person.email}</div>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={roleStyles[person.role] ?? ""}>
                    {label(person.role)}
                  </Badge>
                  {currentPerson?.role === "admin" && person._id !== currentPerson._id && (
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className="h-8 w-8 text-muted-foreground hover:text-red-600 hover:bg-red-50"
                      disabled={busy === person._id}
                      onClick={() => handleRemove(person._id)}
                    >
                      {busy === person._id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-lg sticky top-20 self-start">
          <CardHeader>
            <CardTitle>Add Person</CardTitle>
            <CardDescription>Create a login at your role level or below.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="Full name *"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <Input
              placeholder="name@visionempowertrust.org *"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <Input
              placeholder="Initial password *"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
            <select
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as PersonRole })}
            >
              {currentPerson?.role === "admin" && <option value="admin">Admin</option>}
              {(currentPerson?.role === "admin" || currentPerson?.role === "leadership") && (
                <option value="leadership">Leadership</option>
              )}
              <option value="program_manager">Program Manager</option>
              <option value="account_manager">Account Manager</option>
              <option value="finance">Finance</option>
            </select>
            <Button
              className="w-full"
              disabled={Boolean(busy) || !form.name || !form.email || !form.password}
              onClick={async () => {
                setBusy(true);
                try {
                  await addPerson({ 
                    name: form.name, 
                    email: form.email, 
                    role: form.role,
                    password: form.password 
                  });
                  setForm({ name: "", email: "", role: "program_manager", password: "" });
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? <Loader2 className="size-4 animate-spin mr-2" /> : <Plus className="size-4 mr-2" />}
              Add to Directory
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
