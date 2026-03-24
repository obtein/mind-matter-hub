import { useState, useEffect } from "react";
import { useAuth, useDb } from "@/services/ServiceContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Search, User, Phone, Trash2, Edit, Loader2, ChevronRight, MapPin, Calendar } from "lucide-react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { handleError } from "@/lib/errorHandler";

interface Patient {
  id: string;
  full_name: string;
  phone: string | null;
  date_of_birth: string | null;
  gender: string | null;
  address: string | null;
  meslek: string | null;
  notes: string | null;
  created_at: string;
  last_appointment?: string | null;
}

interface PatientsViewProps {
  onPatientSelect: (patientId: string) => void;
}

export const PatientsView = ({ onPatientSelect }: PatientsViewProps) => {
  const auth = useAuth();
  const db = useDb();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [genderFilter, setGenderFilter] = useState<string>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [deletePatientId, setDeletePatientId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    full_name: "",
    phone: "",
    date_of_birth: "",
    gender: "",
    address: "",
    meslek: "",
    notes: "",
  });

  useEffect(() => {
    fetchPatients();
  }, []);

  const fetchPatients = async () => {
    try {
      const patientsWithAppointments = await db.getPatientsWithLastAppointment();

      setPatients(patientsWithAppointments);
    } catch (error: any) {
      toast.error("Hastalar yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate phone format if provided (Turkish phone: digits, spaces, +, -, parens)
    if (formData.phone && !/^[0-9\s\-+()]{7,15}$/.test(formData.phone)) {
      toast.error("Geçersiz telefon numarası");
      return;
    }

    try {
      const user = await auth.getUser();
      if (!user) throw new Error("Kullanıcı bulunamadı");

      const patientData = {
        full_name: formData.full_name,
        phone: formData.phone || null,
        date_of_birth: formData.date_of_birth || null,
        gender: formData.gender || null,
        address: formData.address || null,
        meslek: formData.meslek || null,
        notes: formData.notes || null,
      };

      if (editingPatient) {
        await db.updatePatient(editingPatient.id, patientData);
        toast.success("Hasta güncellendi");
      } else {
        await db.createPatient({
          ...patientData,
          doctor_id: user.id,
        });
        toast.success("Hasta eklendi");
      }

      setIsDialogOpen(false);
      resetForm();
      fetchPatients();
    } catch (error: any) {
      toast.error(handleError(error, "Hasta kaydedilemedi"));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await db.deletePatient(id);
      toast.success("Hasta silindi");
      fetchPatients();
    } catch (error: any) {
      toast.error(handleError(error, "Hasta silinemedi"));
    }
  };

  const openEditDialog = (e: React.MouseEvent, patient: Patient) => {
    e.stopPropagation();
    setEditingPatient(patient);
    setFormData({
      full_name: patient.full_name,
      phone: patient.phone || "",
      date_of_birth: patient.date_of_birth || "",
      gender: patient.gender || "",
      address: patient.address || "",
      meslek: patient.meslek || "",
      notes: patient.notes || "",
    });
    setIsDialogOpen(true);
  };

  const resetForm = () => {
    setEditingPatient(null);
    setFormData({
      full_name: "",
      phone: "",
      date_of_birth: "",
      gender: "",
      address: "",
      meslek: "",
      notes: "",
    });
  };

  const openNewDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const filteredPatients = patients.filter((p) => {
    const matchesSearch =
      p.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.phone?.includes(searchTerm);

    const matchesGender = genderFilter === "all" || p.gender === genderFilter;

    return matchesSearch && matchesGender;
  });

  const calculateAge = (dateOfBirth: string | null): string => {
    if (!dateOfBirth) return "";
    const today = new Date();
    const birth = new Date(dateOfBirth);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return `${age} yaş`;
  };

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
          <h1 className="text-3xl font-display font-bold text-foreground">Hastalar</h1>
          <p className="text-muted-foreground">Hasta kayıtlarınızı yönetin</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNewDialog} className="shadow-primary">
              <Plus className="w-4 h-4 mr-2" />
              Yeni Hasta
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display">
                {editingPatient ? "Hasta Düzenle" : "Yeni Hasta Ekle"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 col-span-2">
                  <Label htmlFor="full_name">Ad Soyad *</Label>
                  <Input
                    id="full_name"
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gender">Cinsiyet</Label>
                  <Select
                    value={formData.gender}
                    onValueChange={(value) => setFormData({ ...formData, gender: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seçin" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="erkek">Erkek</SelectItem>
                      <SelectItem value="kadın">Kadın</SelectItem>
                      <SelectItem value="diğer">Diğer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="date_of_birth">Doğum Tarihi</Label>
                  <Input
                    id="date_of_birth"
                    type="date"
                    value={formData.date_of_birth}
                    onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefon</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="meslek">Meslek</Label>
                  <Input
                    id="meslek"
                    value={formData.meslek}
                    onChange={(e) => setFormData({ ...formData, meslek: e.target.value })}
                    placeholder="Örn: Mühendis, Öğretmen"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Adres</Label>
                <Textarea
                  id="address"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Genel Notlar</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                />
              </div>
              <Button type="submit" className="w-full">
                {editingPatient ? "Güncelle" : "Ekle"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Ad veya telefon ile ara..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={genderFilter} onValueChange={setGenderFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Cinsiyet" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tümü</SelectItem>
            <SelectItem value="erkek">Erkek</SelectItem>
            <SelectItem value="kadın">Kadın</SelectItem>
            <SelectItem value="diğer">Diğer</SelectItem>
          </SelectContent>
        </Select>
        {(searchTerm || genderFilter !== "all") && (
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => { setSearchTerm(""); setGenderFilter("all"); }}
            className="text-muted-foreground"
          >
            Filtreleri Temizle
          </Button>
        )}
      </div>

      {/* Summary Row */}
      <div className="flex items-center justify-between px-4 py-3 bg-muted/50 rounded-lg border">
        <div className="flex items-center gap-2 text-sm">
          <User className="w-4 h-4 text-muted-foreground" />
          {searchTerm.length >= 2 ? (
            <>
              <span className="font-medium">{Math.min(filteredPatients.length, 20)}</span>
              <span className="text-muted-foreground">
                {filteredPatients.length > 20
                  ? `/ ${filteredPatients.length} sonuç (ilk 20 gösteriliyor)`
                  : `/ ${patients.length} hasta`}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">{patients.length} kayıtlı hasta</span>
          )}
        </div>
        {(searchTerm || genderFilter !== "all") && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Aktif filtreler:</span>
            <div className="flex items-center gap-1">
              {searchTerm && (
                <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-full text-xs">
                  "{searchTerm}"
                </span>
              )}
              {genderFilter !== "all" && (
                <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-full text-xs capitalize">
                  {genderFilter}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {searchTerm.length < 2 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Search className="w-12 h-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground text-center">
              Hasta aramak için yukarıdaki arama kutusunu kullanın
            </p>
            <p className="text-sm text-muted-foreground mt-1">En az 2 karakter yazın</p>
          </CardContent>
        </Card>
      ) : filteredPatients.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <User className="w-12 h-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground text-center">Sonuç bulunamadı</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredPatients.slice(0, 20).map((patient, index) => (
            <Card 
              key={patient.id} 
              className="group hover:shadow-medium transition-all duration-300 animate-slide-up cursor-pointer"
              style={{ animationDelay: `${index * 50}ms` }}
              onClick={() => onPatientSelect(patient.id)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg font-semibold">{patient.full_name}</CardTitle>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        {patient.gender && <span className="capitalize">{patient.gender}</span>}
                        {patient.date_of_birth && (
                          <>
                            {patient.gender && <span>•</span>}
                            <span>{calculateAge(patient.date_of_birth)}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {patient.phone && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="w-4 h-4" />
                    <span>{patient.phone}</span>
                  </div>
                )}
                {patient.address && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="w-4 h-4" />
                    <span className="truncate">{patient.address}</span>
                  </div>
                )}
                {patient.last_appointment && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="w-4 h-4" />
                    <span>Son: {format(new Date(patient.last_appointment), "d MMM yyyy", { locale: tr })}</span>
                  </div>
                )}
                <div className="flex gap-1 pt-2 border-t opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1"
                    onClick={(e) => openEditDialog(e, patient)}
                  >
                    <Edit className="w-4 h-4 mr-1" />
                    Düzenle
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={(e) => { e.stopPropagation(); setDeletePatientId(patient.id); }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!deletePatientId} onOpenChange={(open) => !open && setDeletePatientId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hasta Silme</AlertDialogTitle>
            <AlertDialogDescription>Bu hastayı ve tüm randevularını silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deletePatientId) handleDelete(deletePatientId); setDeletePatientId(null); }}
            >
              Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
