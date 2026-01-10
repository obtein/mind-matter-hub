import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Search, FileText, Trash2, Edit, Loader2, User } from "lucide-react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import type { Tables } from "@/integrations/supabase/types";

type PatientNote = Tables<"patient_notes"> & {
  patients: { full_name: string } | null;
};
type Patient = Tables<"patients">;

export const NotesView = () => {
  const [notes, setNotes] = useState<PatientNote[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<string>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<PatientNote | null>(null);
  const [formData, setFormData] = useState({
    patient_id: "",
    title: "",
    content: "",
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [notesRes, patientsRes] = await Promise.all([
        supabase
          .from("patient_notes")
          .select("*, patients(full_name)")
          .order("created_at", { ascending: false }),
        supabase.from("patients").select("*").order("full_name"),
      ]);

      if (notesRes.error) throw notesRes.error;
      if (patientsRes.error) throw patientsRes.error;

      setNotes(notesRes.data || []);
      setPatients(patientsRes.data || []);
    } catch (error: any) {
      toast.error("Veriler yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Kullanıcı bulunamadı");

      if (editingNote) {
        const { error } = await supabase
          .from("patient_notes")
          .update({
            title: formData.title,
            content: formData.content,
          })
          .eq("id", editingNote.id);

        if (error) throw error;
        toast.success("Not güncellendi");
      } else {
        const { error } = await supabase.from("patient_notes").insert({
          doctor_id: user.id,
          patient_id: formData.patient_id,
          title: formData.title,
          content: formData.content,
        });

        if (error) throw error;
        toast.success("Not eklendi");
      }

      setIsDialogOpen(false);
      setEditingNote(null);
      setFormData({ patient_id: "", title: "", content: "" });
      fetchData();
    } catch (error: any) {
      toast.error(error.message || "İşlem başarısız");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Bu notu silmek istediğinizden emin misiniz?")) return;

    try {
      const { error } = await supabase.from("patient_notes").delete().eq("id", id);
      if (error) throw error;
      toast.success("Not silindi");
      fetchData();
    } catch (error: any) {
      toast.error("Not silinemedi");
    }
  };

  const openEditDialog = (note: PatientNote) => {
    setEditingNote(note);
    setFormData({
      patient_id: note.patient_id,
      title: note.title,
      content: note.content,
    });
    setIsDialogOpen(true);
  };

  const openNewDialog = () => {
    setEditingNote(null);
    setFormData({ patient_id: "", title: "", content: "" });
    setIsDialogOpen(true);
  };

  const filteredNotes = notes.filter((note) => {
    const matchesSearch =
      note.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      note.content.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPatient =
      selectedPatient === "all" || note.patient_id === selectedPatient;
    return matchesSearch && matchesPatient;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Hasta Notları</h1>
          <p className="text-muted-foreground">Seans notlarınızı kaydedin</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNewDialog} className="shadow-primary" disabled={patients.length === 0}>
              <Plus className="w-4 h-4 mr-2" />
              Yeni Not
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-display">
                {editingNote ? "Notu Düzenle" : "Yeni Not Ekle"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              {!editingNote && (
                <div className="space-y-2">
                  <Label htmlFor="patient">Hasta *</Label>
                  <Select
                    value={formData.patient_id}
                    onValueChange={(value) => setFormData({ ...formData, patient_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Hasta seçin" />
                    </SelectTrigger>
                    <SelectContent>
                      {patients.map((patient) => (
                        <SelectItem key={patient.id} value={patient.id}>
                          {patient.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="title">Başlık *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Örn: İlk Seans, Takip Görüşmesi..."
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="content">İçerik *</Label>
                <Textarea
                  id="content"
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  placeholder="Seans notlarınızı buraya yazın..."
                  rows={6}
                  required
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={!editingNote && !formData.patient_id}
              >
                {editingNote ? "Güncelle" : "Kaydet"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {patients.length === 0 && (
        <Card className="border-warning bg-warning/5">
          <CardContent className="py-4">
            <p className="text-sm text-warning-foreground">
              Not ekleyebilmek için önce hasta eklemeniz gerekiyor.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Not ara..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={selectedPatient} onValueChange={setSelectedPatient}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="Hasta filtrele" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tüm Hastalar</SelectItem>
            {patients.map((patient) => (
              <SelectItem key={patient.id} value={patient.id}>
                {patient.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filteredNotes.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="w-12 h-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground text-center">
              {searchTerm || selectedPatient !== "all"
                ? "Sonuç bulunamadı"
                : "Henüz not eklenmemiş"}
            </p>
            {!searchTerm && selectedPatient === "all" && patients.length > 0 && (
              <Button variant="outline" className="mt-4" onClick={openNewDialog}>
                <Plus className="w-4 h-4 mr-2" />
                İlk notunuzu ekleyin
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredNotes.map((note, index) => (
            <Card
              key={note.id}
              className="group hover:shadow-medium transition-all duration-300 animate-slide-up"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-lg">{note.title}</CardTitle>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <User className="w-4 h-4" />
                      <span>{note.patients?.full_name || "Bilinmeyen"}</span>
                      <span>•</span>
                      <span>
                        {format(new Date(note.created_at), "d MMM yyyy", { locale: tr })}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openEditDialog(note)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(note.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-4">
                  {note.content}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
