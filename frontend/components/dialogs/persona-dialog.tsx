"use client";

import { useState, useEffect } from "react";
import type { Persona } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { fetchPersonas, createPersona, updatePersona, deletePersona } from "@/services/api";
import { User, Plus, Trash2, Pencil } from "lucide-react";

export function PersonaDialog() {
  const [open, setOpen] = useState(false);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [editing, setEditing] = useState<Persona | null>(null);
  const [form, setForm] = useState({ name: "", description: "" });

  const load = async () => {
    try { setPersonas(await fetchPersonas()); } catch {}
  };

  useEffect(() => { if (open) load(); }, [open]);

  const handleSave = async () => {
    if (!form.name.trim()) return;
    if (editing) {
      await updatePersona(editing.id, form);
    } else {
      await createPersona(form);
    }
    setForm({ name: "", description: "" });
    setEditing(null);
    await load();
  };

  const handleEdit = (p: Persona) => {
    setEditing(p);
    setForm({ name: p.name, description: p.description });
  };

  const handleDelete = async (id: string) => {
    await deletePersona(id);
    await load();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full text-xs">
          <User className="h-3 w-3 mr-1.5" />
          人设管理
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>用户人设 / Persona</DialogTitle>
          <DialogDescription>管理你在对话中的身份设定</DialogDescription>
        </DialogHeader>

        {/* 已有人设列表 */}
        <div className="space-y-2 max-h-40 overflow-y-auto">
          {personas.map((p) => (
            <div key={p.id} className="flex items-start gap-2 p-2 rounded border text-sm">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{p.name}</div>
                <div className="text-xs text-muted-foreground line-clamp-2">{p.description || "无描述"}</div>
              </div>
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => handleEdit(p)}>
                <Pencil className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-red-500" onClick={() => handleDelete(p.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
          {personas.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">暂无人设</p>}
        </div>

        {/* 新增/编辑表单 */}
        <div className="space-y-3 pt-2 border-t">
          <p className="text-xs font-medium">{editing ? "编辑人设" : "新建人设"}</p>
          <div>
            <Label htmlFor="persona-name">名称</Label>
            <Input id="persona-name" value={form.name} placeholder="如：刘备"
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="persona-desc">描述</Label>
            <Textarea id="persona-desc" value={form.description} rows={2} placeholder="你的人设描述，会告诉 AI 你是谁"
              onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
        </div>

        <DialogFooter>
          {editing && (
            <Button variant="ghost" onClick={() => { setEditing(null); setForm({ name: "", description: "" }); }}>
              取消编辑
            </Button>
          )}
          <Button onClick={handleSave} disabled={!form.name.trim()}>
            {editing ? "更新" : "创建"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
