"use client";

import { useState, useEffect } from "react";
import type { WorldInfoBook, WorldInfoEntry } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  fetchWorldInfoBooks, createWorldInfoBook, deleteWorldInfoBook,
  createWorldInfoEntry, deleteWorldInfoEntry,
} from "@/services/api";
import { BookOpen, Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";

export function WorldInfoDialog() {
  const [open, setOpen] = useState(false);
  const [books, setBooks] = useState<WorldInfoBook[]>([]);
  const [expandedBook, setExpandedBook] = useState<string | null>(null);
  const [newBookName, setNewBookName] = useState("");
  const [newEntry, setNewEntry] = useState({ keys: "", content: "" });

  const load = async () => {
    try { setBooks(await fetchWorldInfoBooks()); } catch {}
  };

  useEffect(() => { if (open) load(); }, [open]);

  const handleAddBook = async () => {
    if (!newBookName.trim()) return;
    await createWorldInfoBook({ name: newBookName });
    setNewBookName("");
    await load();
  };

  const handleDeleteBook = async (id: string) => {
    await deleteWorldInfoBook(id);
    if (expandedBook === id) setExpandedBook(null);
    await load();
  };

  const handleAddEntry = async (bookId: string) => {
    const keys = newEntry.keys.split(",").map((k) => k.trim()).filter(Boolean);
    if (keys.length === 0 || !newEntry.content.trim()) return;
    await createWorldInfoEntry(bookId, {
      keys,
      content: newEntry.content,
      position: "after_char",
    });
    setNewEntry({ keys: "", content: "" });
    await load();
  };

  const handleDeleteEntry = async (bookId: string, entryId: string) => {
    await deleteWorldInfoEntry(bookId, entryId);
    await load();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full text-xs">
          <BookOpen className="h-3 w-3 mr-1.5" />
          世界观管理
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>世界观 / World Info</DialogTitle>
          <DialogDescription>管理知识库与触发条目，按关键词自动注入上下文</DialogDescription>
        </DialogHeader>

        {/* 知识库列表 */}
        <div className="space-y-2">
          {books.map((book) => (
            <div key={book.id} className="border rounded p-2">
              {/* Book header */}
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0"
                  onClick={() => setExpandedBook(expandedBook === book.id ? null : book.id)}>
                  {expandedBook === book.id ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                </Button>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium">{book.name}</span>
                  <span className="text-xs text-muted-foreground ml-2">({book.entries.length} 条)</span>
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-red-500"
                  onClick={() => handleDeleteBook(book.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>

              {/* Expanded entries */}
              {expandedBook === book.id && (
                <div className="mt-2 ml-6 space-y-2">
                  {book.entries.map((entry) => (
                    <div key={entry.id} className="flex items-start gap-2 p-2 bg-muted/50 rounded text-xs">
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-[10px] text-blue-600">
                          {entry.keys.join(", ")}
                          {entry.constant && <span className="ml-1 text-amber-600">[常驻]</span>}
                        </div>
                        <div className="mt-0.5 line-clamp-2">{entry.content}</div>
                      </div>
                      <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0 text-red-400"
                        onClick={() => handleDeleteEntry(book.id, entry.id)}>
                        <Trash2 className="h-2.5 w-2.5" />
                      </Button>
                    </div>
                  ))}

                  {/* Add entry form */}
                  <div className="space-y-1.5 pt-1 border-t">
                    <Input placeholder="触发关键词（逗号分隔）" value={newEntry.keys} className="text-xs h-7"
                      onChange={(e) => setNewEntry({ ...newEntry, keys: e.target.value })} />
                    <Textarea placeholder="注入内容" value={newEntry.content} rows={2} className="text-xs"
                      onChange={(e) => setNewEntry({ ...newEntry, content: e.target.value })} />
                    <Button size="sm" variant="outline" className="w-full text-xs h-7"
                      onClick={() => handleAddEntry(book.id)} disabled={!newEntry.keys.trim() || !newEntry.content.trim()}>
                      <Plus className="h-3 w-3 mr-1" /> 添加条目
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {books.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">暂无知识库</p>}
        </div>

        {/* Add book */}
        <div className="flex gap-2 pt-2 border-t">
          <Input placeholder="新知识库名称" value={newBookName} className="text-xs"
            onChange={(e) => setNewBookName(e.target.value)} />
          <Button size="sm" onClick={handleAddBook} disabled={!newBookName.trim()}>
            <Plus className="h-3 w-3 mr-1" /> 创建
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
